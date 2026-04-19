#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Preparing backend..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created backend/.env from backend/.env.example"
fi

echo "Preparing frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  echo "Created frontend/.env.local from frontend/.env.example"
fi

echo "Starting backend on http://127.0.0.1:8000 ..."
(
  cd "$BACKEND_DIR"
  source .venv/bin/activate
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

echo
echo "Application is starting."
echo "Frontend: http://localhost:3000"
echo "Backend:  http://127.0.0.1:8000"
echo "API docs: http://127.0.0.1:8000/docs"
echo
echo "Before using AI, make sure backend/.env points to a running LM Studio server and loaded model."
echo "Press Ctrl+C to stop both processes."

wait
