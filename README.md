# Collaborative Document Editor with AI Writing Assistant

## Overview

This project implements a collaborative document editor with an AI writing assistant.

It is built using:
- **Frontend:** Next.js (React)
- **Backend:** FastAPI
- **Database:** SQLite (local-first)
- **AI:** LM Studio (local LLM)

The system supports document editing, versioning, sharing, and AI-assisted writing, with secure authentication and backend testing.

---

## Features

### Authentication
- User registration and login
- Secure password hashing using bcrypt
- JWT-based authentication
- Access and refresh tokens
- Protected API endpoints

### Document Management
- Create, read, update, and delete documents
- Version history with restore functionality
- Automatic version creation
- Export documents (txt, markdown, JSON)

### Access Control
- Role-based permissions:
  - Owner
  - Editor
  - Viewer
- Server-side enforcement of permissions
- Document sharing between users

### AI Writing Assistant
- Supports:
  - Rewrite
  - Summarize
  - Translate
  - Restructure
- Uses LM Studio local API
- Logs AI interaction history
- Context-aware prompt construction
- Safe output sanitization

### Real-Time Collaboration
- WebSocket-based updates
- Presence tracking
- Basic real-time document updates (last-write-wins)

### Testing
- Backend tests using pytest
- Covers authentication, permissions, document CRUD, AI functionality, and WebSocket behavior

---

## Project Structure
AI1220B-task-1/
├── run.sh
├── README.md
├── DEVIATIONS.md
├── backend/
├── frontend/

## Local setup


### Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```


### 2. Start LM Studio or enable mock mode

Run LM Studio locally, enable the server, and set the base URL and model name in `backend/.env`.

If you want to run the PoC without LM Studio first, set `LLM_MOCK=true` in `backend/.env`.

### 3. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend runs at `http://localhost:3000`. Backend runs at `http://127.0.0.1:8000`.

## Deliverables Included

- Running source code in `frontend/` and `backend/`
- Final written report as `report.pdf`
- Editable Mermaid architecture and data-model diagrams in `diagrams/`
- Team process notes in `meeting_log.md` and `team-task-division.md`

## API Surface

- `GET /api/health`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/{id}`
- `PATCH /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/documents/{id}/versions`
- `POST /api/documents/{id}/versions`
- `POST /api/documents/{id}/versions/{version_id}/revert`
- `GET /api/documents/{id}/permissions`
- `POST /api/documents/{id}/permissions`
- `DELETE /api/documents/{id}/permissions/{user_id}`
- `GET /api/documents/{id}/export?format=md|txt|json`
- `POST /api/ai/invoke`
- `GET /api/ai/history`
- `GET /api/users`
- `GET /api/users/me`
- `WS /ws/documents/{document_id}`


Authentication:
- Register → Login → Authorize using Bearer token

## Environment Configuration

- Create a .env file in backend/ based on .env.example.

Example:

JWT_SECRET_KEY=change-me-access-secret
JWT_REFRESH_SECRET_KEY=change-me-refresh-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_MINUTES=10080


## Troubleshooting

- If AI responses do not work, verify LM Studio is running and the model name in `backend/.env` matches the loaded model.
- If the frontend cannot reach the backend, confirm the frontend uses `http://127.0.0.1:8000` and the backend is started before `npm run dev`.
- If local testing behaves inconsistently, remove the local SQLite file under `backend/data/` and restart the backend to rebuild it.
