from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def register_user(email, password="Password123!"):
    return client.post("/api/users/register", json={
        "email": email,
        "name": "Test User",
        "password": password
    })


def login_user(email, password="Password123!"):
    return client.post("/api/users/login", json={
        "email": email,
        "password": password
    })


def test_register_and_login():
    email = "testuser@example.com"
    password = "Password123!"

    # Register
    res = register_user(email, password)
    assert res.status_code in (201, 409)

    # Login
    res = login_user(email, password)
    assert res.status_code == 200

    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_protected_route_requires_auth():
    res = client.get("/api/users/me")
    assert res.status_code == 401


def test_invalid_token_rejected():
    res = client.get(
        "/api/users/me",
        headers={"Authorization": "Bearer invalidtoken"}
    )
    assert res.status_code == 401


def test_refresh_token_invalid():
    res = client.post("/api/users/refresh", json={
        "refresh_token": "invalidtoken"
    })
    assert res.status_code == 401


def test_valid_token_allows_access():
    email = "authsuccess@example.com"
    password = "Password123!"

    register_user(email, password)

    res = login_user(email, password)
    token = res.json()["access_token"]

    res = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200