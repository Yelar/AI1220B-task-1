# Collaborative Document Editor with AI Writing Assistant

Implementation submission for AI1220 Assignment 2.

This project builds the Assignment 1 design into a working local-first system with:

- `Next.js` frontend
- `FastAPI` backend
- `SQLite` persistence
- `JWT` authentication
- streamed AI suggestions via `SSE`
- authenticated real-time collaboration via `WebSocket`

## Implemented Scope

### Core application

- Registration, login, and refresh-token flow
- Secure password hashing with `bcrypt`
- Protected API routes
- Document CRUD with metadata and dashboard listing
- Rich-text editing with headings, bold, italic, lists, and code blocks
- Auto-save with status feedback
- Version history and restore
- Server-side sharing and access control with `owner`, `editor`, and `viewer` roles

### Real-time collaboration

- Authenticated WebSocket document sessions
- Live document update propagation
- Presence and activity awareness
- Remote cursor and selection rendering
- Reconnect and session resynchronization
- Safe merge handling for common non-overlapping concurrent edits

### AI assistant

- Streamed AI responses
- Supported features: `rewrite`, `summarize`, `translate`, `restructure`
- Cancel in-progress generation
- Suggestion review workflow: compare, edit, apply, partially apply, reject, undo
- Configurable prompt-building module
- AI interaction history per document

### Completed bonus features

- Remote cursor and selection tracking
- Share-by-link invitations with role selection and revocation
- Partial acceptance of AI suggestions
- Playwright E2E coverage for login through AI suggestion acceptance

### Testing and documentation

- Backend `pytest` suite for auth, documents, permissions, AI, and WebSocket behavior
- Frontend component tests with `Vitest` and React Testing Library
- FastAPI auto-generated API docs with route descriptions and schemas
- Architecture deviation notes in `DEVIATIONS.md`

## Repository Structure

```text
AI1220B-task-1/
├── README.md
├── DEVIATIONS.md
├── run.sh
├── team-task-division.md
├── assignment-1-archive/
├── diagrams/
├── backend/
└── frontend/
```

## Local Setup

The system can be started using `run.sh` or manually.

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend URLs:

- API root: `http://127.0.0.1:8000/api`
- Swagger UI: `http://127.0.0.1:8000/docs`

### 2. LM Studio or mock mode

In `backend/.env`, either:

- point the backend to a running LM Studio server, or
- set `LLM_MOCK=true` to test the full flow without a local model

Important backend variables are documented in `backend/.env.example`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- `http://localhost:3000`

The frontend works with its default local API settings even without a `.env.local` file.

Optional frontend overrides:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_BASE_URL`
- `NEXT_PUBLIC_AUTH_MODE`

## One-Command Script

A helper script is included at `run.sh` to prepare dependencies and start both services:

```bash
./run.sh
```

## Demo Flow

The live demo can be run in this order:

1. Register a user and log in.
2. Create a document and edit it in the rich-text editor.
3. Observe auto-save status updates.
4. Share the document with another user as `editor` or `viewer`.
5. Open the same document in two sessions and show live collaboration.
6. Invoke the AI assistant with streaming output and cancellation.
7. Apply or reject a suggestion and review AI history.
8. Create a version and restore a previous version.

## API Surface

### Health

- `GET /api/health`

### Users and authentication

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

### Sharing and permissions

- `GET /api/documents/{id}/permissions`
- `POST /api/documents/{id}/permissions`
- `DELETE /api/documents/{id}/permissions/{user_id}`
- `GET /api/documents/{id}/share-links`
- `POST /api/documents/{id}/share-links`
- `DELETE /api/documents/{id}/share-links/{link_id}`
- `POST /api/documents/share-links/redeem`

### AI

- `POST /api/ai/invoke`
- `POST /api/ai/stream`
- `GET /api/ai/history`
- `PATCH /api/ai/history/{interaction_id}`

### Collaboration

- `WS /ws/documents/{document_id}`

## Testing

### Backend

```bash
cd backend
source .venv/bin/activate
pytest
```

### Frontend

```bash
cd frontend
npm install
npx playwright install chromium
npm test
npm run lint
npx next build --webpack
npm run test:e2e
```

## Deliverables Included

- Source code in `frontend/` and `backend/`
- Editable architecture and data-model diagrams in `diagrams/`
- Assignment 1 to Assignment 2 deviation report in `DEVIATIONS.md`
- Team task breakdown in `team-task-division.md`
- Archived Assignment 1 artifacts in `assignment-1-archive/`

## Notes for Evaluators

- The collaboration layer uses authenticated WebSocket sessions with presence, reconnect sync, remote selections, and merge handling for common non-overlapping concurrent edits. It does not claim CRDT/OT conflict resolution.
- AI suggestions are non-destructive until the user explicitly applies them.
- The implementation remains aligned with the Assignment 1 architecture, and all intentional changes are documented in `DEVIATIONS.md`.
