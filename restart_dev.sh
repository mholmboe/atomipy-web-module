#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/.dev-logs"

BACKEND_PORT=5002
FRONTEND_PORT=8080
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
PYTHON_BIN=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" || true)"
  if [[ -n "${pids}" ]]; then
    echo "Stopping process(es) on port ${port}: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} || true
    sleep 1
    local remaining
    remaining="$(lsof -ti tcp:"${port}" || true)"
    if [[ -n "${remaining}" ]]; then
      echo "Force killing process(es) on port ${port}: ${remaining}"
      # shellcheck disable=SC2086
      kill -9 ${remaining} || true
    fi
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local tries="${3:-40}"
  local delay="${4:-0.5}"
  local i

  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      echo "${label} is ready: ${url}"
      return 0
    fi
    sleep "${delay}"
  done

  echo "Timed out waiting for ${label}: ${url}"
  return 1
}

find_python_for_backend() {
  local candidates=()

  if [[ -n "${PYTHON_BIN:-}" ]]; then
    candidates+=("${PYTHON_BIN}")
  fi
  if [[ -n "${ATOMIPY_PYTHON:-}" ]]; then
    candidates+=("${ATOMIPY_PYTHON}")
  fi

  candidates+=(
    "${ROOT_DIR}/.venv/bin/python"
    "${ROOT_DIR}/venv/bin/python"
    "${ROOT_DIR}/env/bin/python"
    "${ROOT_DIR}/../.venv/bin/python"
  )

  if command -v python3 >/dev/null 2>&1; then
    candidates+=("$(command -v python3)")
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]] && "${candidate}" -c "import flask" >/dev/null 2>&1; then
      PYTHON_BIN="${candidate}"
      return 0
    fi
  done

  return 1
}

main() {
  require_cmd lsof
  require_cmd curl
  require_cmd npm
  require_cmd nohup

  cd "${ROOT_DIR}"
  mkdir -p "${LOG_DIR}"

  if [[ ! -d node_modules ]]; then
    echo "node_modules/ is missing. Run 'npm install' first."
    exit 1
  fi

  if ! find_python_for_backend; then
    echo "Could not find a Python interpreter with Flask installed."
    echo "Set ATOMIPY_PYTHON=/path/to/python or install Flask in your active environment."
    exit 1
  fi

  kill_port "${FRONTEND_PORT}"
  kill_port "${BACKEND_PORT}"

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local backend_log="${LOG_DIR}/backend-${timestamp}.log"
  local frontend_log="${LOG_DIR}/frontend-${timestamp}.log"

  echo "Starting backend on ${BACKEND_PORT}..."
  nohup "${PYTHON_BIN}" app.py >"${backend_log}" 2>&1 &
  local backend_pid=$!

  if ! wait_for_url "${BACKEND_URL}/health" "Backend"; then
    echo "Backend failed to start. Last log lines:"
    tail -n 80 "${backend_log}" || true
    exit 1
  fi

  echo "Starting frontend on ${FRONTEND_PORT}..."
  nohup npm run dev -- --host 127.0.0.1 --port "${FRONTEND_PORT}" >"${frontend_log}" 2>&1 &
  local frontend_pid=$!

  if ! wait_for_url "${FRONTEND_URL}" "Frontend"; then
    echo "Frontend failed to start. Last log lines:"
    tail -n 80 "${frontend_log}" || true
    exit 1
  fi

  echo "Running smoke checks..."
  curl -fsS "${BACKEND_URL}/health" >/dev/null
  curl -fsS "${BACKEND_URL}/api/presets" >/dev/null
  curl -fsS "${FRONTEND_URL}/health" >/dev/null
  curl -fsS "${FRONTEND_URL}/api/presets" >/dev/null

  cat <<EOF
Restart complete.

Frontend: ${FRONTEND_URL}
Backend:  ${BACKEND_URL}
Python:   ${PYTHON_BIN}

PIDs:
  Backend PID:  ${backend_pid}
  Frontend PID: ${frontend_pid}

Logs:
  ${backend_log}
  ${frontend_log}

Useful commands:
  tail -f "${backend_log}"
  tail -f "${frontend_log}"
  lsof -ti tcp:${BACKEND_PORT} | xargs kill
  lsof -ti tcp:${FRONTEND_PORT} | xargs kill
EOF
}

main "$@"
