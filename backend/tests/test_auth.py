import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_register_and_login():
    email = "testuser@example.com"
    password = "Password123!"

    # Register
    res = client.post("/api/users/register", json={
        "email": email,
        "name": "Test User",
        "password": password
    })
    assert res.status_code in (201, 409)

    # Login
    res = client.post("/api/users/login", json={
        "email": email,
        "password": password
    })
    assert res.status_code == 200

    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_protected_route_requires_auth():
    res = client.get("/api/users/me")
    assert res.status_code == 401