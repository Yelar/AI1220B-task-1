from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
    response = client.post(
        "/api/users/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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


def test_websocket_presence_and_document_updates(client: TestClient):
    with client.websocket_connect(
        "/ws/documents/123?userId=u1&userName=Alice&clientId=client-a"
    ) as ws_a:
        ack_a = ws_a.receive_json()
        assert ack_a["type"] == "connection:ack"
        assert ack_a["clientId"] == "client-a"

        sync_a = ws_a.receive_json()
        assert sync_a["type"] == "presence:sync"

        with client.websocket_connect(
            "/ws/documents/123?userId=u2&userName=Bob&clientId=client-b"
        ) as ws_b:
            ack_b = ws_b.receive_json()
            assert ack_b["type"] == "connection:ack"
            assert ack_b["clientId"] == "client-b"

            sync_b = ws_b.receive_json()
            assert sync_b["type"] == "presence:sync"

            sync_a_after_join = ws_a.receive_json()
            assert sync_a_after_join["type"] == "presence:sync"
            assert len(sync_a_after_join["participants"]) == 2

            ws_a.send_json(
                {
                    "type": "presence:update",
                    "cursor": {"line": 1, "column": 5},
                    "selection": {"start": 0, "end": 4},
                }
            )

            presence_for_a = ws_a.receive_json()
            assert presence_for_a["type"] == "presence:sync"

            presence_for_b = ws_b.receive_json()
            assert presence_for_b["type"] == "presence:sync"
            assert len(presence_for_b["participants"]) == 2

            ws_a.send_json(
                {
                    "type": "document:update",
                    "payload": {"content": "Updated content"},
                }
            )

            update_for_b = ws_b.receive_json()
            assert update_for_b["type"] == "document:update"
            assert update_for_b["documentId"] == "123"
            assert update_for_b["payload"]["content"] == "Updated content"
            assert update_for_b["sender"]["userId"] == "u1"