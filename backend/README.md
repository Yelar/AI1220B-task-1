# FastAPI Backend

This backend provides authentication, document management, versioning, sharing, AI endpoints, and collaboration transport for the Assignment 2 submission.

## Responsibilities

- JWT registration, login, and refresh
- Password hashing with `bcrypt`
- Protected REST API routes
- Document CRUD and export
- Version creation and restore
- Server-side role enforcement for `owner`, `editor`, and `viewer`
- Direct sharing and share-by-link invitation support
- AI invocation, streaming, and history logging
- Authenticated WebSocket collaboration

## Local Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend URLs:

- API: `http://127.0.0.1:8000/api`
- Docs: `http://127.0.0.1:8000/docs`

## Environment

Required and optional variables are documented in `backend/.env.example`.

Key variables:

- `JWT_SECRET_KEY`
- `JWT_REFRESH_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_MINUTES`
- `LM_STUDIO_BASE_URL`
- `LM_STUDIO_MODEL`
- `LM_STUDIO_TIMEOUT_SECONDS`
- `LLM_MOCK`
- `FRONTEND_ORIGIN`

## AI Provider

The backend targets LM Studio through an OpenAI-compatible local API.

Accepted `LM_STUDIO_BASE_URL` formats:

- `http://127.0.0.1:1234`
- `http://127.0.0.1:1234/v1`
- `http://127.0.0.1:1234/v1/chat/completions`

If you want to evaluate the system without a running local model, set:

```env
LLM_MOCK=true
```

## Main Endpoints

### Users

- `POST /api/users/register`
- `POST /api/users/login`
- `POST /api/users/refresh`
- `GET /api/users/me`
- `GET /api/users`

### Documents

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/{id}`
- `PATCH /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/documents/{id}/export?format=md|txt|json`

### Versions

- `GET /api/documents/{id}/versions`
- `POST /api/documents/{id}/versions`
- `POST /api/documents/{id}/versions/{version_id}/revert`

### Permissions

- `GET /api/documents/{id}/permissions`
- `POST /api/documents/{id}/permissions`
- `DELETE /api/documents/{id}/permissions/{user_id}`

### Share links

- `GET /api/documents/{id}/share-links`
- `POST /api/documents/{id}/share-links`
- `DELETE /api/documents/{id}/share-links/{link_id}`
- `POST /api/documents/share-links/redeem`

### AI

- `POST /api/ai/invoke`
- `POST /api/ai/stream`
- `GET /api/ai/history`
- `PATCH /api/ai/history/{interaction_id}`

## Authentication Model

- Access and refresh tokens are both JWTs.
- Access tokens protect all API routes.
- Refresh tokens issue a new access/refresh pair.
- WebSocket sessions require a valid token.

## Collaboration Transport

WebSocket endpoint:

- `ws://127.0.0.1:8000/ws/documents/{document_id}?token=<access-token>&clientId=<client-id>`

Supported client message types:

- `presence:update`
- `document:update`

Server message types:

- `connection:ack`
- `document:sync`
- `presence:sync`
- `document:update`
- `error`

The current consistency model uses reconnect resynchronization plus frontend merge handling for common non-overlapping concurrent edits. It is stronger than plain snapshot last-write-wins, but it does not claim CRDT/OT conflict resolution.

## Tests

Run the backend suite with:

```bash
cd backend
source .venv/bin/activate
pytest
```

Useful full verification commands:

```bash
cd backend
source .venv/bin/activate
pytest
cd ../frontend
npm install
npx playwright install chromium
npm test
npm run lint
npx next build --webpack
npm run test:e2e
```

Coverage includes:

- auth and refresh flow
- protected routes
- document CRUD and permissions
- version restore
- AI invocation and streaming behavior
- AI history updates
- authenticated WebSocket connection and reconnection
