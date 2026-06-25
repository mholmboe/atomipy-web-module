#!/usr/bin/env bash
# Runs once after `constructor` unpacks the env (macOS / Linux). $PREFIX is the install dir.
set -e

# Unpack the app bundle (dist/ + backend/ + atomipy/ + workers/ + requirements.txt) into
# the prefix, then remove the archive.
if [ -f "$PREFIX/app_bundle.tar.gz" ]; then
  tar -xzf "$PREFIX/app_bundle.tar.gz" -C "$PREFIX"
  rm -f "$PREFIX/app_bundle.tar.gz"
fi

chmod +x "$PREFIX/launch_atomipy.sh" 2>/dev/null || true

# Optional pip-only extras (needs internet at install time). The conda specs already
# cover the runtime; uvicorn's [standard] extras just improve websocket/SSE perf.
"$PREFIX/bin/python" -m pip install --no-input "uvicorn[standard]" >/dev/null 2>&1 || true

cat <<EOF

============================================================
 atomipy installed to: $PREFIX
 Start it with:
   "$PREFIX/launch_atomipy.sh"
 then open http://127.0.0.1:8000 (opens automatically).
============================================================
EOF
