# AI1220B Task 1 Submission

This submission contains:

- `frontend/`: Next.js document dashboard and editor UI.
- `backend/`: FastAPI backend with local SQLite persistence, role checks, versioning, collaboration, and LM Studio integration.
- `diagrams/`: editable Mermaid source files used in the report.
- `report.pdf`, `meeting_log.md`, `team-task-division.md`: supporting assignment documentation.

## What This PoC Demonstrates

- A working Next.js frontend connected to a FastAPI backend.
- Local-first setup with SQLite and LM Studio, with optional mock AI mode for local testing.
- Document creation, editing, saving, and deletion.
- Role-based access behavior using local demo users.
- Version snapshot creation and version revert.
- AI-assisted rewrite, summarize, translate, and restructure flows through LM Studio.
- Basic collaboration signaling over WebSockets.

## What It Intentionally Does Not Implement Yet

- Production-grade authentication such as passwords, OAuth, or JWT sessions.
- Full operational-transform or CRDT-based collaborative editing.
- Production deployment infrastructure or cloud-hosted services.
- Comprehensive frontend automated tests.

## Local setup

### 1. Start the backend

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

## Troubleshooting

- If AI responses do not work, verify LM Studio is running and the model name in `backend/.env` matches the loaded model.
- If the frontend cannot reach the backend, confirm the frontend uses `http://127.0.0.1:8000` and the backend is started before `npm run dev`.
- If local testing behaves inconsistently, remove the local SQLite file under `backend/data/` and restart the backend to rebuild it.
