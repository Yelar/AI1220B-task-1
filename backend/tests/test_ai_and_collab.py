import json
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.services import build_lm_studio_chat_url, sanitize_model_output


@pytest.fixture()
def client():
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        test_engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        TestingSessionLocal = sessionmaker(
            bind=test_engine,
            autoflush=False,
            autocommit=False,
        )

        Base.metadata.create_all(bind=test_engine)

        def override_get_db():
            db = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db

        with TestClient(app) as test_client:
            yield test_client

        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)


def register_user(client: TestClient, email: str, name: str, password: str = "Password123!"):
    response = client.post(
        "/api/users/register",
        json={
            "email": email,
            "name": name,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def login_headers(client: TestClient, email: str, password: str = "Password123!"):
    return {"Authorization": f"Bearer {login_token(client, email, password)}"}


def login_token(client: TestClient, email: str, password: str = "Password123!"):
    response = client.post(
        "/api/users/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def create_document(client: TestClient, headers: dict, title: str = "Doc", content: str = "Hello"):
    response = client.post(
        "/api/documents",
        headers=headers,
        json={
            "title": title,
            "content": content,
            "save_initial_version": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def set_llm_mock(value: bool):
    old = settings.llm_mock
    settings.llm_mock = value
    return old


def restore_llm_mock(old: bool):
    settings.llm_mock = old


def parse_sse_events(lines: list[str]) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    current_event = "message"
    current_data: list[str] = []

    def flush() -> None:
        nonlocal current_event, current_data
        if current_data:
            events.append((current_event, json.loads("\n".join(current_data))))
        current_event = "message"
        current_data = []

    for raw_line in lines:
        line = raw_line.decode() if isinstance(raw_line, bytes) else raw_line
        if not line.strip():
            flush()
            continue

        if line.startswith("event:"):
            current_event = line.split(":", 1)[1].strip()
            continue

        if line.startswith("data:"):
            current_data.append(line.split(":", 1)[1].lstrip())

    flush()
    return events


def test_ai_invoke_returns_mock_metadata(client: TestClient):
    register_user(client, "owner@example.com", "Owner Demo")
    headers = login_headers(client, "owner@example.com")
    document = create_document(client, headers)

    old_mock = set_llm_mock(True)
    try:
        response = client.post(
            "/api/ai/invoke",
            headers=headers,
            json={
                "feature": "rewrite",
                "selected_text": "This is the selected text.",
                "surrounding_context": "Some context.",
                "document_id": document["id"],
            },
        )
    finally:
        restore_llm_mock(old_mock)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["feature"] == "rewrite"
    assert payload["provider"] == "mock"
    assert payload["mocked"] is True
    assert payload["model_name"] == "mock-model"
    assert "[MOCK REWRITE RESPONSE]" in payload["output_text"]


def test_ai_invoke_surfaces_generation_failure(client: TestClient, monkeypatch):
    register_user(client, "owner@example.com", "Owner Demo")
    headers = login_headers(client, "owner@example.com")
    document = create_document(client, headers)

    async def fail_generation(_payload):
        raise HTTPException(status_code=502, detail="LM Studio unavailable.")

    monkeypatch.setattr("app.routers.ai.generate_ai_suggestion", fail_generation)

    response = client.post(
        "/api/ai/invoke",
        headers=headers,
        json={
            "feature": "summarize",
            "selected_text": "Text to summarize.",
            "surrounding_context": "",
            "document_id": document["id"],
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "LM Studio unavailable."


def test_ai_history_filters_by_document_and_feature(client: TestClient):
    register_user(client, "owner@example.com", "Owner Demo")
    headers = login_headers(client, "owner@example.com")
    document = create_document(client, headers)

    old_mock = set_llm_mock(True)
    try:
        response_one = client.post(
            "/api/ai/invoke",
            headers=headers,
            json={
                "feature": "rewrite",
                "selected_text": "Rewrite this paragraph.",
                "surrounding_context": "",
                "document_id": document["id"],
            },
        )
        assert response_one.status_code == 200, response_one.text

        response_two = client.post(
            "/api/ai/invoke",
            headers=headers,
            json={
                "feature": "summarize",
                "selected_text": "Summarize this paragraph.",
                "surrounding_context": "",
                "document_id": document["id"],
            },
        )
        assert response_two.status_code == 200, response_two.text
    finally:
        restore_llm_mock(old_mock)

    history_response = client.get(
        f"/api/ai/history?document_id={document['id']}&feature=rewrite",
        headers=headers,
    )
    assert history_response.status_code == 200, history_response.text

    items = history_response.json()
    assert len(items) == 1
    assert items[0]["feature"] == "rewrite"
    assert items[0]["document_id"] == document["id"]


def test_document_history_can_include_other_users_with_access(client: TestClient):
    owner = register_user(client, "owner@example.com", "Owner Demo")
    viewer = register_user(client, "viewer@example.com", "Viewer Demo")

    owner_headers = login_headers(client, "owner@example.com")
    viewer_headers = login_headers(client, "viewer@example.com")

    document = create_document(client, owner_headers)

    permission_response = client.post(
        f"/api/documents/{document['id']}/permissions",
        headers=owner_headers,
        json={
            "user_id": viewer["id"],
            "role": "viewer",
        },
    )
    assert permission_response.status_code == 201, permission_response.text

    old_mock = set_llm_mock(True)
    try:
        invoke_response = client.post(
            "/api/ai/invoke",
            headers=owner_headers,
            json={
                "feature": "rewrite",
                "selected_text": "Rewrite this.",
                "surrounding_context": "",
                "document_id": document["id"],
            },
        )
        assert invoke_response.status_code == 200, invoke_response.text
    finally:
        restore_llm_mock(old_mock)

    viewer_history_response = client.get(
        f"/api/ai/history?document_id={document['id']}",
        headers=viewer_headers,
    )
    assert viewer_history_response.status_code == 200, viewer_history_response.text

    items = viewer_history_response.json()
    assert len(items) == 1
    assert items[0]["document_id"] == document["id"]


def test_ai_streaming_emits_sse_events_and_updates_history(client: TestClient, monkeypatch):
    register_user(client, "owner@example.com", "Owner Demo")
    headers = login_headers(client, "owner@example.com")
    document = create_document(client, headers)

    class FakeStreamingProvider:
        async def stream(self, _payload):
            yield "Here is the rewritten text: "
            yield "Cleaner final answer."

    old_mock = set_llm_mock(False)
    monkeypatch.setattr("app.routers.ai.get_ai_provider", lambda: FakeStreamingProvider())

    try:
        with client.stream(
            "POST",
            "/api/ai/stream",
            headers=headers,
            json={
                "feature": "rewrite",
                "selected_text": "Rewrite this paragraph.",
                "surrounding_context": "Some surrounding context.",
                "document_id": document["id"],
            },
        ) as response:
            assert response.status_code == 200, response.text
            events = parse_sse_events(list(response.iter_lines()))
    finally:
        restore_llm_mock(old_mock)

    event_names = [event_name for event_name, _ in events]
    assert event_names[0] == "start"
    assert "chunk" in event_names
    assert event_names[-1] == "done"

    done_payload = next(payload for event_name, payload in events if event_name == "done")
    assert done_payload["output_text"] == "Cleaner final answer."
    assert done_payload["feature"] == "rewrite"

    interaction_id = done_payload["interaction_id"]
    history_response = client.get(
        f"/api/ai/history?document_id={document['id']}",
        headers=headers,
    )
    assert history_response.status_code == 200, history_response.text

    history_items = history_response.json()
    for _ in range(20):
        if history_items and history_items[0]["status"] != "streaming":
            break
        time.sleep(0.1)
        history_response = client.get(
            f"/api/ai/history?document_id={document['id']}",
            headers=headers,
        )
        assert history_response.status_code == 200, history_response.text
        history_items = history_response.json()

    assert len(history_items) == 1
    assert history_items[0]["status"] in {"streaming", "completed"}
    assert history_items[0]["response_text"] == "Cleaner final answer."

    accepted = client.patch(
        f"/api/ai/history/{interaction_id}",
        headers=headers,
        json={"status": "accepted"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "accepted"

    rejected = client.patch(
        f"/api/ai/history/{interaction_id}",
        headers=headers,
        json={"status": "rejected"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"


def test_websocket_auth_presence_and_reconnect_sync(client: TestClient):
    register_user(client, "owner@example.com", "Owner Demo")
    register_user(client, "editor@example.com", "Editor Demo")

    owner_headers = login_headers(client, "owner@example.com")
    editor_headers = login_headers(client, "editor@example.com")
    owner_token = owner_headers["Authorization"].removeprefix("Bearer ")
    editor_token = editor_headers["Authorization"].removeprefix("Bearer ")

    document = create_document(
        client,
        owner_headers,
        title="Realtime Doc",
        content="Initial collaborative content",
    )

    with client.websocket_connect(
        f"/ws/documents/{document['id']}?token={owner_token}&clientId=owner-client"
    ) as ws_owner:
        ack_owner = ws_owner.receive_json()
        assert ack_owner["type"] == "connection:ack"
        assert ack_owner["clientId"] == "owner-client"

        sync_owner = ws_owner.receive_json()
        assert sync_owner["type"] == "document:sync"
        assert sync_owner["state"] is None

        initial_presence_owner = ws_owner.receive_json()
        assert initial_presence_owner["type"] == "presence:sync"
        assert len(initial_presence_owner["participants"]) == 1

        with client.websocket_connect(
            f"/ws/documents/{document['id']}?token={editor_token}&clientId=editor-client"
        ) as ws_editor:
            ack_editor = ws_editor.receive_json()
            assert ack_editor["type"] == "connection:ack"
            assert ack_editor["clientId"] == "editor-client"

            sync_editor = ws_editor.receive_json()
            assert sync_editor["type"] == "document:sync"
            assert sync_editor["state"] is None

            presence_join_editor = ws_editor.receive_json()
            assert presence_join_editor["type"] == "presence:sync"
            assert len(presence_join_editor["participants"]) == 2

            presence_join_owner = ws_owner.receive_json()
            assert presence_join_owner["type"] == "presence:sync"
            assert len(presence_join_owner["participants"]) == 2

            ws_editor.send_json(
                {
                    "type": "presence:update",
                    "cursor": {"from": 5, "to": 5},
                    "selection": {"from": 0, "to": 5},
                }
            )

            presence_for_owner = ws_owner.receive_json()
            assert presence_for_owner["type"] == "presence:sync"
            assert len(presence_for_owner["participants"]) == 2

            presence_for_editor = ws_editor.receive_json()
            assert presence_for_editor["type"] == "presence:sync"
            assert len(presence_for_editor["participants"]) == 2

            ws_owner.send_json(
                {
                    "type": "document:update",
                    "payload": {
                        "title": "Realtime Doc v2",
                        "content": "Updated collaborative content",
                    },
                }
            )

            update_for_editor = ws_editor.receive_json()
            assert update_for_editor["type"] == "document:update"
            assert update_for_editor["documentId"] == str(document["id"])
            assert update_for_editor["payload"]["content"] == "Updated collaborative content"
            assert update_for_editor["sender"]["clientId"] == "owner-client"

        presence_after_leave = ws_owner.receive_json()
        assert presence_after_leave["type"] == "presence:sync"
        assert len(presence_after_leave["participants"]) == 1

        with client.websocket_connect(
            f"/ws/documents/{document['id']}?token={editor_token}&clientId=editor-client"
        ) as ws_editor_reconnected:
            ack_reconnected = ws_editor_reconnected.receive_json()
            assert ack_reconnected["type"] == "connection:ack"

            sync_reconnected = ws_editor_reconnected.receive_json()
            assert sync_reconnected["type"] == "document:sync"
            assert sync_reconnected["state"]["title"] == "Realtime Doc v2"
            assert sync_reconnected["state"]["content"] == "Updated collaborative content"

            presence_reconnected_editor = ws_editor_reconnected.receive_json()
            assert presence_reconnected_editor["type"] == "presence:sync"
            assert len(presence_reconnected_editor["participants"]) == 2

            presence_reconnected_owner = ws_owner.receive_json()
            assert presence_reconnected_owner["type"] == "presence:sync"
            assert len(presence_reconnected_owner["participants"]) == 2


def test_websocket_rejects_invalid_token(client: TestClient):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/documents/999?token=not-a-real-token"):
            pass


def test_lm_studio_url_normalizes_supported_base_urls():
    original = settings.lm_studio_base_url
    try:
        settings.lm_studio_base_url = "http://127.0.0.1:1234"
        assert build_lm_studio_chat_url() == "http://127.0.0.1:1234/v1/chat/completions"

        settings.lm_studio_base_url = "http://127.0.0.1:1234/v1"
        assert build_lm_studio_chat_url() == "http://127.0.0.1:1234/v1/chat/completions"

        settings.lm_studio_base_url = "http://127.0.0.1:1234/v1/chat/completions"
        assert build_lm_studio_chat_url() == "http://127.0.0.1:1234/v1/chat/completions"
    finally:
        settings.lm_studio_base_url = original


def test_sanitize_model_output_strips_common_wrappers():
    wrapped = 'Here is the rewritten text: "Cleaner final answer."'
    assert sanitize_model_output(wrapped) == "Cleaner final answer."

    fenced = "```text\nImproved paragraph.\n```"
    assert sanitize_model_output(fenced) == "Improved paragraph."

    summary = "Summary:\n\nThis is the concise summary."
    assert sanitize_model_output(summary) == "This is the concise summary."
