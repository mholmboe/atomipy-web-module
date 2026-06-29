#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/.dev-logs"

CORE_PORT=8000
OPENFF_PORT=8001
FRONTEND_PORT=8080

CORE_URL="http://127.0.0.1:${CORE_PORT}"
OPENFF_URL="http://127.0.0.1:${OPENFF_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"

# Default local GROMACS for the GROMACS engine. Points the Simulate node's default
# 'gmx' at this install (via atomipy's ATOMIPY_GMX_PATH resolution) instead of the
# Homebrew gmx on PATH. Override by exporting ATOMIPY_GMX_PATH before running this
# script. Accepts a GMXRC script, a gmx binary, or an install dir.
ATOMIPY_GMX_PATH="${ATOMIPY_GMX_PATH:-/usr/local/gromacs-2024.2/bin/GMXRC}"

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
  local tries="${3:-60}"
  local delay="${4:-1}"
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

setup_conda_envs() {
  require_cmd conda

  if ! conda env list | grep -q "atomipy-core"; then
    echo "Creating atomipy-core conda environment..."
    conda env create -f envs/atomipy-core.yml
  fi

  if ! conda env list | grep -q "atomipy-openff"; then
    echo "Creating atomipy-openff conda environment..."
    conda env create -f envs/atomipy-openff.yml
  fi
}

update_conda_envs() {
  require_cmd conda
  echo "Updating atomipy-core environment..."
  conda env update -n atomipy-core -f envs/atomipy-core.yml --prune
  echo "Updating atomipy-openff environment..."
  conda env update -n atomipy-openff -f envs/atomipy-openff.yml --prune
}

check_acpype() {
  if conda run -n atomipy-openff acpype --version >/dev/null 2>&1; then
    echo "ACPYPE available in atomipy-openff — GAFF/GAFF2 parametrization enabled."
  else
    echo ""
    echo "⚠️  WARNING: ACPYPE not found in atomipy-openff environment."
    echo "   GAFF/GAFF2 parametrization will fail until you run:"
    echo "   conda env update -n atomipy-openff -f envs/atomipy-openff.yml --prune"
    echo "   (or pass --update-envs to this script)"
    echo ""
  fi
}

start_redis() {
  if ! command -v redis-server >/dev/null 2>&1; then
    echo "redis-server not found! Please install it (e.g. 'brew install redis')"
    exit 1
  fi
  
  if ! redis-cli ping >/dev/null 2>&1; then
    echo "Starting Redis server in background..."
    redis-server --daemonize yes
    sleep 1
  else
    echo "Redis is already running."
  fi
}

main() {
  require_cmd lsof
  require_cmd curl
  require_cmd npm
  require_cmd nohup

  local update_envs=false
  for arg in "$@"; do
    [[ "${arg}" == "--update-envs" ]] && update_envs=true
  done

  cd "${ROOT_DIR}"
  mkdir -p "${LOG_DIR}"

  if [[ ! -d node_modules ]]; then
    echo "node_modules/ is missing. Run 'npm install' first."
    exit 1
  fi

  if [[ "${update_envs}" == "true" ]]; then
    update_conda_envs
  else
    setup_conda_envs
  fi

  check_acpype
  start_redis

  kill_port "${FRONTEND_PORT}"
  kill_port "${CORE_PORT}"
  kill_port "${OPENFF_PORT}"

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local core_log="${LOG_DIR}/core-${timestamp}.log"
  local openff_log="${LOG_DIR}/openff-${timestamp}.log"
  local celery_log="${LOG_DIR}/celery-${timestamp}.log"
  local frontend_log="${LOG_DIR}/frontend-${timestamp}.log"

  echo "Starting OpenFF Worker on port ${OPENFF_PORT}..."
  export INTERCHANGE_EXPERIMENTAL=1
  # PYTHONPATH = ROOT_DIR so that the local atomipy/ package inside atomipy-web-module is used
  export PYTHONPATH="${ROOT_DIR}"
  # Force UTF-8 stdio: the conda envs can default to an ASCII locale, which makes
  # atomipy print()s containing non-ASCII (Å, ·, ⁻²) raise UnicodeEncodeError.
  export PYTHONIOENCODING=utf-8
  # --reload-dir includes the embedded atomipy package (a sibling of backend/
  # and workers/), so re-vendoring atomipy triggers a hot reload. Without this,
  # uvicorn only watches the cwd and vendored atomipy edits are ignored until a
  # full restart.
  nohup conda run --cwd workers/openff_worker -n atomipy-openff \
    env PYTHONPATH="${PYTHONPATH}" PYTHONIOENCODING=utf-8 INTERCHANGE_EXPERIMENTAL=1 \
    uvicorn main:app --reload \
      --reload-dir "${ROOT_DIR}/workers/openff_worker" --reload-dir "${ROOT_DIR}/atomipy" \
      --port "${OPENFF_PORT}" >"${openff_log}" 2>&1 &
  local openff_pid=$!

  echo "Starting Core Backend on port ${CORE_PORT}..."
  export OPENFF_WORKER_URL="${OPENFF_URL}"
  nohup conda run --cwd backend/core -n atomipy-core \
    env PYTHONPATH="${PYTHONPATH}" PYTHONIOENCODING=utf-8 OPENFF_WORKER_URL="${OPENFF_URL}" \
    ATOMIPY_GMX_PATH="${ATOMIPY_GMX_PATH}" \
    uvicorn main:app --reload \
      --reload-dir "${ROOT_DIR}/backend/core" --reload-dir "${ROOT_DIR}/atomipy" \
      --port "${CORE_PORT}" >"${core_log}" 2>&1 &
  local core_pid=$!

  echo "Starting Celery Worker..."
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  nohup conda run --cwd backend/core -n atomipy-core \
    env PYTHONPATH="${PYTHONPATH}" PYTHONIOENCODING=utf-8 OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES \
    ATOMIPY_GMX_PATH="${ATOMIPY_GMX_PATH}" \
    celery -A celery_app.app worker --loglevel=info >"${celery_log}" 2>&1 &
  local celery_pid=$!

  if ! wait_for_url "${CORE_URL}/health" "Core Backend"; then
    echo "Core Backend failed to start. Last log lines:"
    tail -n 80 "${core_log}" || true
    exit 1
  fi
  
  if ! wait_for_url "${OPENFF_URL}/docs" "OpenFF Worker"; then
    echo "OpenFF Worker failed to start. Last log lines:"
    tail -n 80 "${openff_log}" || true
  fi

  echo "Starting frontend on ${FRONTEND_PORT}..."
  nohup npm run dev -- --host 127.0.0.1 --port "${FRONTEND_PORT}" >"${frontend_log}" 2>&1 &
  local frontend_pid=$!

  if ! wait_for_url "${FRONTEND_URL}" "Frontend"; then
    echo "Frontend failed to start. Last log lines:"
    tail -n 80 "${frontend_log}" || true
    exit 1
  fi

  cat <<EOF

✅ Restart complete! The new modern stack is running natively.

Frontend: ${FRONTEND_URL}
Core API: ${CORE_URL}
OpenFF:   ${OPENFF_URL}

PIDs:
  Core Backend:   ${core_pid}
  OpenFF Worker:  ${openff_pid}
  Celery Worker:  ${celery_pid}
  Frontend:       ${frontend_pid}

Logs in .dev-logs/:
  tail -f "${core_log}"
  tail -f "${openff_log}"
  tail -f "${celery_log}"
  tail -f "${frontend_log}"

Useful commands to stop services:
  lsof -ti tcp:${CORE_PORT} | xargs kill
  lsof -ti tcp:${OPENFF_PORT} | xargs kill
  lsof -ti tcp:${FRONTEND_PORT} | xargs kill
EOF
}

main "$@"
