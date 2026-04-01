# AI1220B Task 1 Submission

This submission contains:

- `frontend/`: Next.js starter frontend.
- `backend/`: FastAPI starter backend with local SQLite persistence and LM Studio integration hooks.

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

## Starter API

- `GET /api/health`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/{id}`
- `PATCH /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/documents/{id}/versions`
- `POST /api/ai/invoke`
- `GET /api/ai/history`
- `WS /ws/documents/{document_id}`
