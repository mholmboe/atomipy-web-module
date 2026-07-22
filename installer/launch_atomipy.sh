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

# Choose a port that won't clash with any existing local server. An explicit
# ATOMIPY_PORT always wins. Otherwise prefer 8000, but if something is already
# listening there (another local server, a previous atomipy, a dev backend), fall
# back to an OS-assigned free port. We probe with connect_ex ("is anything actually
# accepting connections?") rather than a trial bind — a bind can spuriously fail on a
# port left in TIME_WAIT by a just-killed server, whereas uvicorn (SO_REUSEADDR) can
# still use it; connect_ex only reports a port busy when a live listener is present.
if [ -n "${ATOMIPY_PORT:-}" ]; then
  PORT="$ATOMIPY_PORT"
else
  PORT="$("$HERE/bin/python" - <<'PY'
import socket
def in_use(p):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return s.connect_ex(("127.0.0.1", p)) == 0
    finally:
        s.close()
if not in_use(8000):
    print(8000)
else:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()
PY
)"
fi
URL="http://127.0.0.1:${PORT}"

if [ "${PORT}" != "8000" ]; then
  echo "(port 8000 busy or overridden -> using ${PORT})"
fi
echo "Starting atomipy at ${URL}  (Ctrl+C to stop)"
# Open the browser once the server has had a moment to come up.
( sleep 3; "$HERE/bin/python" -c "import webbrowser; webbrowser.open('${URL}')" >/dev/null 2>&1 || true ) &

exec "$HERE/bin/uvicorn" main:app \
  --app-dir "$HERE/backend/core" \
  --host 127.0.0.1 --port "${PORT}"
