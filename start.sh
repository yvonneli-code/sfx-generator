#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting SFX Generator ==="

# Backend
echo "[backend] Starting FastAPI on :8000..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "[backend] Creating virtualenv..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Frontend
echo "[frontend] Installing deps and starting Next.js on :3000..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
