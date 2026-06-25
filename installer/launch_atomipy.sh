#!/usr/bin/env bash
# Launch the atomipy web-module from a `constructor`-built install (macOS / Linux).
# This script lives at the install prefix root, so its own folder IS the conda env.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Put the bundled env on PATH so the backend (and the subprocesses it spawns) find the
# bundled `gmx`, `python`, OpenMM, etc. This is what makes the Simulate node's default
# "GROMACS path" = `gmx` resolve to the bundled CPU GROMACS. A custom path typed into
# the node still overrides this (atomipy resolves a binary / GMXRC / install dir).
export PATH="$HERE/bin:$HERE/Library/bin:$PATH"

export PYTHONPATH="$HERE"               # vendored atomipy (./atomipy) importable
export FRONTEND_DIST="$HERE/dist"       # built React app served by FastAPI
export PYTHONIOENCODING="utf-8"         # atomipy prints Å, ·, ⁻² etc.
export SIMULATION_MODE="${SIMULATION_MODE:-full}"   # full local sims (EM/NVT/NPT)

PORT="${ATOMIPY_PORT:-8000}"
URL="http://127.0.0.1:${PORT}"

echo "Starting atomipy at ${URL}  (Ctrl+C to stop)"
# Open the browser once the server has had a moment to come up.
( sleep 3; "$HERE/bin/python" -c "import webbrowser; webbrowser.open('${URL}')" >/dev/null 2>&1 || true ) &

exec "$HERE/bin/uvicorn" main:app \
  --app-dir "$HERE/backend/core" \
  --host 127.0.0.1 --port "${PORT}"
