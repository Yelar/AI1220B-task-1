import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_token(email, password):
    res = client.post("/api/users/login", json={
        "email": email,
        "password": password
    })
    return res.json()["access_token"]


def test_owner_can_create_document():
    email = "owner_test@example.com"
    password = "Password123!"

    client.post("/api/users/register", json={
        "email": email,
        "name": "Owner",
        "password": password
    })

    token = get_token(email, password)

    res = client.post(
        "/api/documents",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Test Doc", "content": "Hello"}
    )

    assert res.status_code == 201


def test_viewer_cannot_edit():
    # Create owner
    owner_email = "owner2@example.com"
    password = "Password123!"

    client.post("/api/users/register", json={
        "email": owner_email,
        "name": "Owner",
        "password": password
    })

    owner_token = get_token(owner_email, password)

    # Create document
    doc = client.post(
        "/api/documents",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"title": "Doc", "content": "Test"}
    ).json()

    doc_id = doc["id"]

    # Create viewer
    viewer_email = "viewer@example.com"
    client.post("/api/users/register", json={
        "email": viewer_email,
        "name": "Viewer",
        "password": password
    })

    viewer_token = get_token(viewer_email, password)

    # Viewer tries to edit
    res = client.patch(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"content": "Hacked"}
    )

    assert res.status_code == 403