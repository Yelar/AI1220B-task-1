# FastAPI Backend

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

The API starts at `http://127.0.0.1:8000` and Swagger UI is available at `http://127.0.0.1:8000/docs`.

## LM Studio

1. Start LM Studio's local server.
2. Set `LM_STUDIO_BASE_URL` in `.env` to the provided base URL, for example `http://127.0.0.1:1234`.
3. Set `LM_STUDIO_MODEL` to the model name you loaded in LM Studio.

The backend accepts either:

- the LM Studio server root, such as `http://127.0.0.1:1234`
- or a full OpenAI-compatible path ending in `/v1`

If you want to test the backend without LM Studio first, set `LLM_MOCK=true`.
