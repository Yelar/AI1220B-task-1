# AI1220B Task 1 Submission

This submission contains:

- `frontend/`: Next.js document dashboard and editor UI.
- `backend/`: FastAPI backend with local SQLite persistence, role checks, versioning, collaboration, and LM Studio integration.
- `diagrams/`: editable Mermaid C4 diagram source files used in the report.
- `report.md`, `meeting_log.md`, `team-task-division.md`: supporting assignment documentation.

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

### 2. Start LM Studio

Run LM Studio locally, enable the server, and set the base URL and model name in `backend/.env`.

### 3. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend runs at `http://localhost:3000`. Backend runs at `http://127.0.0.1:8000`.

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
