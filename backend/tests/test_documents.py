import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import DocumentPermission, User

TEST_DATABASE_URL = "sqlite://"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    bind=test_engine,
    autoflush=False,
    autocommit=False,
)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

client = TestClient(app)


def seed_demo_users_for_tests():
    with TestingSessionLocal() as db:
        db.add_all(
            [
                User(email="owner@example.com", name="Owner Demo"),
                User(email="editor@example.com", name="Editor Demo"),
                User(email="commenter@example.com", name="Commenter Demo"),
                User(email="viewer@example.com", name="Viewer Demo"),
            ]
        )
        db.commit()


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    seed_demo_users_for_tests()
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def auth_headers(user_id: int) -> dict[str, str]:
    return {"X-User-Id": str(user_id)}


def test_create_document_and_list_versions():
    response = client.post(
        "/api/documents",
        json={"title": "Doc 1", "content": "Hello", "save_initial_version": True},
        headers=auth_headers(1),
    )
    assert response.status_code == 201

    data = response.json()
    assert data["title"] == "Doc 1"

    versions = client.get(
        f"/api/documents/{data['id']}/versions",
        headers=auth_headers(1),
    )
    assert versions.status_code == 200
    assert len(versions.json()) == 1


def test_editor_can_update_but_viewer_cannot():
    created = client.post(
        "/api/documents",
        json={"title": "Shared", "content": "Start", "save_initial_version": True},
        headers=auth_headers(1),
    )
    document_id = created.json()["id"]

    with TestingSessionLocal() as db:
        db.add(DocumentPermission(document_id=document_id, user_id=2, role="editor"))
        db.add(DocumentPermission(document_id=document_id, user_id=4, role="viewer"))
        db.commit()

    editor_update = client.patch(
        f"/api/documents/{document_id}",
        json={"content": "Edited by editor"},
        headers=auth_headers(2),
    )
    assert editor_update.status_code == 200

    viewer_update = client.patch(
        f"/api/documents/{document_id}",
        json={"content": "Viewer edit"},
        headers=auth_headers(4),
    )
    assert viewer_update.status_code == 403


def test_create_version_endpoint():
    created = client.post(
        "/api/documents",
        json={"title": "Versioned", "content": "v1", "save_initial_version": False},
        headers=auth_headers(1),
    )
    document_id = created.json()["id"]

    create_version = client.post(
        f"/api/documents/{document_id}/versions",
        json={"label": "Checkpoint 1"},
        headers=auth_headers(1),
    )
    assert create_version.status_code == 201
    assert create_version.json()["label"] == "Checkpoint 1"


def test_owner_can_revert_version():
    created = client.post(
        "/api/documents",
        json={"title": "Revert Me", "content": "original", "save_initial_version": True},
        headers=auth_headers(1),
    )
    document_id = created.json()["id"]

    client.patch(
        f"/api/documents/{document_id}",
        json={"content": "changed", "create_version": True, "version_label": "changed"},
        headers=auth_headers(1),
    )

    versions = client.get(
        f"/api/documents/{document_id}/versions",
        headers=auth_headers(1),
    )
    assert versions.status_code == 200
    original_version = versions.json()[-1]

    reverted = client.post(
        f"/api/documents/{document_id}/versions/{original_version['id']}/revert",
        headers=auth_headers(1),
    )
    assert reverted.status_code == 200
    assert reverted.json()["content"] == "original"


def test_owner_can_manage_permissions():
    created = client.post(
        "/api/documents",
        json={"title": "Sharing", "content": "Share me", "save_initial_version": True},
        headers=auth_headers(1),
    )
    document_id = created.json()["id"]

    grant = client.post(
        f"/api/documents/{document_id}/permissions",
        json={"user_id": 2, "role": "editor"},
        headers=auth_headers(1),
    )
    assert grant.status_code == 201
    assert grant.json()["role"] == "editor"

    listed = client.get(
        f"/api/documents/{document_id}/permissions",
        headers=auth_headers(1),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    remove = client.delete(
        f"/api/documents/{document_id}/permissions/2",
        headers=auth_headers(1),
    )
    assert remove.status_code == 204
