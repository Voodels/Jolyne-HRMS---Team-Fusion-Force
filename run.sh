#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"

mkdir -p "$LOG_DIR"

status() {
  printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    status "Missing command: $1"
    exit 1
  fi
}

source_env() {
  local file="$1"
  if [[ -f "$file" ]]; then
    status "Loading env: $file"
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local timeout="${3:-60}"
  local start
  start=$(date +%s)

  while true; do
    if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
      status "$name is listening on port $port"
      return 0
    fi
    if [[ $(( $(date +%s) - start )) -ge $timeout ]]; then
      status "Timed out waiting for $name on port $port"
      return 1
    fi
    sleep 2
  done
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local timeout="${3:-60}"
  local start
  start=$(date +%s)

  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      status "$name is healthy at $url"
      return 0
    fi
    if [[ $(( $(date +%s) - start )) -ge $timeout ]]; then
      status "Timed out waiting for $name at $url"
      return 1
    fi
    sleep 2
  done
}

PIDS=()
cleanup() {
  status "Stopping services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup INT TERM

status "Checking required commands..."
require_cmd java
require_cmd node
require_cmd npm
require_cmd python3
require_cmd curl

status "Loading environment files..."
source_env "$ROOT_DIR/Backend/.env"
source_env "$ROOT_DIR/SQL-Agent/.env"
source_env "$ROOT_DIR/Frontend/.env"

status "Starting Backend (Spring Boot)..."
BACKEND_DIR="$ROOT_DIR/Backend"
MAVEN_BIN=""
if [[ -x "$BACKEND_DIR/mvnw" ]]; then
  MAVEN_BIN="$BACKEND_DIR/mvnw"
elif [[ -f "$BACKEND_DIR/mvnw" ]]; then
  chmod +x "$BACKEND_DIR/mvnw"
  MAVEN_BIN="$BACKEND_DIR/mvnw"
else
  require_cmd mvn
  MAVEN_BIN="mvn"
fi

(
  cd "$BACKEND_DIR"
  "$MAVEN_BIN" -q -DskipTests spring-boot:run
) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")
status "Backend started (PID $BACKEND_PID). Logs: $LOG_DIR/backend.log"
wait_for_port 8080 "Backend" 90 || true

status "Starting SQL-Agent (FastAPI)..."
SQL_DIR="$ROOT_DIR/SQL-Agent"
PYTHON_BIN="python3"
if [[ -x "$SQL_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$SQL_DIR/.venv/bin/python"
fi

if [[ -f "$SQL_DIR/requirements.txt" ]]; then
  status "Installing SQL-Agent dependencies (if needed)..."
  (
    cd "$SQL_DIR"
    "$PYTHON_BIN" -m pip install -r requirements.txt
  ) >"$LOG_DIR/sql-agent-install.log" 2>&1 || true
fi

(
  cd "$SQL_DIR"
  "$PYTHON_BIN" -m uvicorn chat_api:app --host 0.0.0.0 --port 8000
) >"$LOG_DIR/sql-agent.log" 2>&1 &
SQL_PID=$!
PIDS+=("$SQL_PID")
status "SQL-Agent started (PID $SQL_PID). Logs: $LOG_DIR/sql-agent.log"
wait_for_http "http://127.0.0.1:8000/health" "SQL-Agent" 90 || wait_for_port 8000 "SQL-Agent" 30 || true

status "Starting Frontend (React)..."
FRONTEND_DIR="$ROOT_DIR/Frontend"
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  status "Installing Frontend dependencies..."
  (
    cd "$FRONTEND_DIR"
    npm install
  ) >"$LOG_DIR/frontend-install.log" 2>&1
fi

(
  cd "$FRONTEND_DIR"
  npm start
) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")
status "Frontend started (PID $FRONTEND_PID). Logs: $LOG_DIR/frontend.log"
wait_for_port 3000 "Frontend" 90 || true

status "All services started. Press Ctrl+C to stop."

wait
