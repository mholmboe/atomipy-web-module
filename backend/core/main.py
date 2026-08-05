import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from routers import forcefield, execution

app = FastAPI(title="Atomipy Core Backend")

# CORS: an explicit origin allowlist instead of "*". The production deploy serves the
# frontend and /api from the SAME origin (so CORS is not even consulted), and local dev
# uses Vite's /api proxy (also same-origin) — so tightening this does not affect normal
# use, but it stops arbitrary third-party sites from driving the API from a victim's
# browser. Override via the ALLOWED_ORIGINS env var (comma-separated). Credentials are
# off because the API uses no cookies/auth ("*"+credentials is invalid anyway).
_DEFAULT_ORIGINS = (
    "https://atomipy.io,https://www.atomipy.io,https://topology.atomipy.io,"
    "http://localhost:8080,http://127.0.0.1:8080,"
    "http://localhost:8000,http://127.0.0.1:8000"
)
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forcefield.router, prefix="/api/forcefield", tags=["forcefield"])
app.include_router(execution.router, prefix="/api", tags=["execution"])


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# /topology -> the standalone Atomipy Topology Generator (separate Cloud Run
# service, served at topology.atomipy.io). Registered before the SPA catch-all
# so atomipy.io/topology redirects out instead of loading the React app.
# ---------------------------------------------------------------------------
TOPOLOGY_URL = os.environ.get("TOPOLOGY_URL", "https://topology.atomipy.io")


@app.get("/topology")
@app.get("/topology/{rest:path}")
def topology_redirect(rest: str = ""):
    target = TOPOLOGY_URL + (("/" + rest) if rest else "")
    return RedirectResponse(target, status_code=301)


# ---------------------------------------------------------------------------
# Static frontend (single-image deployment)
#
# In production / Colab the built React bundle (Vite `dist/`) is served by this
# same FastAPI app, so there is exactly ONE process to deploy. In local dev the
# Vite dev server serves the frontend instead, and `dist/` is absent here, so
# the static mount is skipped and Vite proxies /api -> this backend.
# ---------------------------------------------------------------------------
FRONTEND_DIST = os.environ.get(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist"),
)

if os.path.isdir(FRONTEND_DIST):
    _INDEX_HTML = os.path.join(FRONTEND_DIST, "index.html")

    # Catch-all registered LAST so the API routers and /health win. Serves real
    # files (assets, etc.) and falls back to index.html for SPA client routes.
    _DIST_ROOT = os.path.realpath(FRONTEND_DIST)
    _ASSETS_ROOT = os.path.join(_DIST_ROOT, "assets")

    # Cache-Control matters more here than on a typical site: Cloud Run runs this
    # service at concurrency=1 (builds exec user scripts with process-global
    # state, so two per instance clobber each other), which means EVERY request
    # occupies an instance exclusively — a 300-byte favicon costs the same slot
    # as a build. Uncached, one page load was 4 requests (html + js + css +
    # icon) against max-instances=6, so a single visitor could tie up most of
    # the service. With these headers a repeat load is 1 request.
    _ONE_YEAR = 31536000

    def _cache_control(path: str) -> str:
        # Vite content-hashes everything under assets/ (index-BNAzA1N8.js), so
        # the URL changes whenever the bytes do — safe to cache forever.
        if path.startswith(_ASSETS_ROOT + os.sep):
            return "public, max-age=%d, immutable" % _ONE_YEAR
        # index.html must revalidate or a deploy is never picked up. "no-cache"
        # means "cache it, but always revalidate" — with the ETag that is a
        # cheap 304, not a re-download.
        if os.path.basename(path) == "index.html":
            return "no-cache"
        # Everything else at the dist root (favicon, manifest, robots.txt) is
        # NOT content-hashed, so a long max-age would pin a stale copy.
        return "public, max-age=3600"

    def _file(path: str) -> FileResponse:
        return FileResponse(path, headers={"Cache-Control": _cache_control(path)})

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Confine to the dist root: realpath-resolve the request and verify it stays
        # inside _DIST_ROOT, so "/../../etc/passwd" (or encoded "..%2f") can't escape.
        if full_path:
            candidate = os.path.realpath(os.path.join(FRONTEND_DIST, full_path))
            if (candidate == _DIST_ROOT or candidate.startswith(_DIST_ROOT + os.sep)) and os.path.isfile(candidate):
                return _file(candidate)
        return _file(_INDEX_HTML)
