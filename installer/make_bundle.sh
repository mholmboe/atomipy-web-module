#!/usr/bin/env bash
# Pack the built app into installer/app_bundle.tar.gz, which constructor ships via
# `extra_files` and post_install unpacks into the install prefix.
# Run this BEFORE `constructor .`. Requires the frontend to be built (dist/ present).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"     # installer/
ROOT="$(cd "$HERE/.." && pwd)"                            # atomipy-web-module/

cd "$ROOT"
if [ ! -d dist ]; then
  echo "ERROR: dist/ not found. Build the frontend first:" >&2
  echo "  (cd \"$ROOT\" && npm ci && npm run build)" >&2
  exit 1
fi

# Top-level entries land at $PREFIX/<name> after `tar -C $PREFIX` in post_install.
tar --exclude='__pycache__' --exclude='*.pyc' --exclude='.DS_Store' \
    -czf "$HERE/app_bundle.tar.gz" \
    dist backend atomipy workers requirements.txt

echo "Wrote $HERE/app_bundle.tar.gz"
echo "Now build the installer:  (cd \"$HERE\" && conda run -n base constructor .)"
