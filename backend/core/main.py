import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from routers import forcefield, execution

app = FastAPI(title="Atomipy Core Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_INDEX_HTML)
