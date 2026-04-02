import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import AIInteraction, Document, DocumentVersion
from app.services import AIResult, build_lm_studio_chat_url


class BackendAITestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.client = TestClient(app)
        self._clear_database()

    def tearDown(self):
        self.client.close()
        self._clear_database()

    def _clear_database(self):
        with SessionLocal() as db:
            db.query(AIInteraction).delete()
            db.query(DocumentVersion).delete()
            db.query(Document).delete()
            db.commit()

    def test_ai_invoke_returns_mock_metadata(self):
        response = self.client.post(
            "/api/ai/invoke",
            json={
                "feature": "summarize",
                "selected_text": "Mock metadata test paragraph.",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["provider"], "mock")
        self.assertTrue(payload["mocked"])
        self.assertEqual(payload["model_name"], "mock-model")

    def test_ai_history_filters_by_document_and_feature(self):
        first_doc = self.client.post(
            "/api/documents",
            json={"title": "Doc one", "content": "Body one"},
        ).json()
        second_doc = self.client.post(
            "/api/documents",
            json={"title": "Doc two", "content": "Body two"},
        ).json()

        self.client.post(
            "/api/ai/invoke",
            json={
                "feature": "summarize",
                "selected_text": "Alpha",
                "document_id": first_doc["id"],
            },
        )
        self.client.post(
            "/api/ai/invoke",
            json={
                "feature": "rewrite",
                "selected_text": "Beta",
                "document_id": second_doc["id"],
            },
        )

        response = self.client.get(
            f"/api/ai/history?document_id={first_doc['id']}&feature=summarize&limit=10"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["document_id"], first_doc["id"])
        self.assertEqual(payload[0]["feature"], "summarize")

    def test_ai_invoke_surfaces_generation_failure(self):
        with patch(
            "app.routers.ai.generate_ai_suggestion",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=502,
                    detail="Could not connect to LM Studio.",
                )
            ),
        ):
            response = self.client.post(
                "/api/ai/invoke",
                json={
                    "feature": "summarize",
                    "selected_text": "Failure path paragraph.",
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Could not connect to LM Studio.")

    def test_websocket_presence_and_document_updates(self):
        with self.client.websocket_connect(
            "/ws/documents/abc?userId=u1&userName=Alice&clientId=c1"
        ) as ws1:
            ack1 = ws1.receive_json()
            sync1 = ws1.receive_json()

            self.assertEqual(ack1["type"], "connection:ack")
            self.assertEqual(sync1["type"], "presence:sync")
            self.assertEqual(len(sync1["participants"]), 1)

            with self.client.websocket_connect(
                "/ws/documents/abc?userId=u2&userName=Bob&clientId=c2"
            ) as ws2:
                ws2.receive_json()
                ws2.receive_json()
                ws1.receive_json()

                ws2.send_json(
                    {
                        "type": "presence:update",
                        "cursor": {"from": 5},
                        "selection": {"from": 5, "to": 9},
                    }
                )
                ws2_presence = ws2.receive_json()
                ws1_presence = ws1.receive_json()

                self.assertEqual(ws2_presence["type"], "presence:sync")
                self.assertEqual(ws1_presence["type"], "presence:sync")
                self.assertEqual(
                    ws1_presence["participants"][1]["selection"],
                    {"from": 5, "to": 9},
                )

                ws2.send_json({"type": "document:update", "payload": {"text": "hello"}})
                doc_update = ws1.receive_json()

                self.assertEqual(doc_update["type"], "document:update")
                self.assertEqual(doc_update["sender"]["userName"], "Bob")
                self.assertEqual(doc_update["payload"], {"text": "hello"})

    def test_lm_studio_url_normalizes_supported_base_urls(self):
        with patch("app.services.settings.lm_studio_base_url", "http://127.0.0.1:1234"):
            self.assertEqual(
                build_lm_studio_chat_url(),
                "http://127.0.0.1:1234/v1/chat/completions",
            )

        with patch("app.services.settings.lm_studio_base_url", "http://127.0.0.1:1234/v1"):
            self.assertEqual(
                build_lm_studio_chat_url(),
                "http://127.0.0.1:1234/v1/chat/completions",
            )

        with patch(
            "app.services.settings.lm_studio_base_url",
            "http://127.0.0.1:1234/v1/chat/completions",
        ):
            self.assertEqual(
                build_lm_studio_chat_url(),
                "http://127.0.0.1:1234/v1/chat/completions",
            )


if __name__ == "__main__":
    unittest.main()
