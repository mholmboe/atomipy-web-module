# Installation & Deployment

How the atomipy web module is built, deployed, and run — and how the **local**,
**online**, and **Google Colab** versions differ.

---

## 1. Architecture at a glance

The app is **one unified main service** plus an **optional worker**:

```
            ┌─────────────────────────────────────────────┐
            │  MAIN SERVICE  (one image, one process)      │
   Browser ─┤  FastAPI (backend/core)                      │
            │   ├── serves the built React frontend (dist/)│
            │   └── /api/* : build-stream, upload, presets,│
            │              organic preview, download…       │
            └───────────────┬─────────────────────────────┘
                            │  HTTP  (OPENFF_WORKER_URL)
                            ▼
            ┌─────────────────────────────────────────────┐
            │  OPENFF WORKER  (separate image/process)     │
            │  FastAPI (workers/openff_worker)             │
            │  GAFF/OpenFF + ACPYPE — Organic Molecule node│
            └─────────────────────────────────────────────┘
```

- **Frontend + backend are a single deployable.** The React app is built with
  Vite into `dist/`, and the **FastAPI** backend serves that `dist/` *and* the
  API from the same process. There is **no separate frontend server** in
  production. (Root [`Dockerfile`](Dockerfile).)
- **OpenFF worker** ([`docker/Dockerfile.openff`](docker/Dockerfile.openff)) is a
  separate service in its own conda environment (`atomipy-openff`:
  `openff-toolkit`, `openff-interchange`, `acpype`, `rdkit`, `openbabel`). The
  main app reaches it over HTTP via the `OPENFF_WORKER_URL` env var. It is only
  needed for the **Organic Molecule (GAFF/OpenFF)** node.
- **Celery + Redis** are **optional** (async job queue). The web app serves
  everything through the synchronous build-stream path and starts fine without
  them.
- `app.py` (Flask) is **legacy** and no longer in the serving path.
- `atomipy/` inside this repo is a vendored copy of the canonical
  [atomipy](https://github.com/mholmboe/atomipy) library, added to `PYTHONPATH`.

---

## 2. Build & deploy triggers

> **Do the frontend and backend have different triggers? No.** They are the same
> image, deployed by a single trigger. The only thing with a *separate* deploy
> path is the OpenFF worker.

| Component | Image / Dockerfile | Deploy mechanism |
|---|---|---|
| **Main app** (frontend **+** backend) | root [`Dockerfile`](Dockerfile) | **Cloud Run source-deploy trigger** on the GitHub repo — auto-builds and deploys on **every push to `main`** |
| **OpenFF worker** | [`docker/Dockerfile.openff`](docker/Dockerfile.openff) | **No trigger** — deployed **manually** |

**Main app (automatic).** A Cloud Run "continuous deployment" trigger
(`rmgpgab-atomipy-web-module-…`) is connected to `mholmboe/atomipy-web-module`.
On every push to `main` it builds the root `Dockerfile` (which runs `npm run
build` for the frontend, then assembles the FastAPI image) and deploys to the
`atomipy-web-module` Cloud Run service. Service env/resources (memory, env vars)
are **preserved across these deploys**, so they only need to be set once.

> Because frontend and backend ship in one image, *any* change — React component
> or Python endpoint — is delivered by this single trigger. There is nothing to
> deploy separately for the frontend.

**OpenFF worker (manual).** The worker rarely changes and has **no auto-trigger**.
Rebuild/redeploy it yourself after editing `workers/`,
`envs/atomipy-openff.yml`, or `docker/Dockerfile.openff`:

```bash
gcloud builds submit --config cloudbuild.openff.yaml
```

[`cloudbuild.yaml`](cloudbuild.yaml) / [`cloudbuild.openff.yaml`](cloudbuild.openff.yaml)
are declarative build/deploy configs. The **live main-app path is the
source-deploy trigger**, which does *not* use `cloudbuild.yaml`; that file is an
Infrastructure-as-Code / manual-deploy reference (and the way to deploy your own
instance with explicit settings).

---

## 3. The three versions

| | **Local (dev)** | **Online (Cloud Run)** | **Google Colab** |
|---|---|---|---|
| Launch | `./restart_dev.sh` | push to `main` (auto) | `ColabLaunchGuide.ipynb` |
| Frontend | **Vite dev server** :8080 (hot reload) | built `dist/` served by FastAPI | built `dist/` served by FastAPI |
| Backend | FastAPI :8000 (conda `atomipy-core`) | FastAPI in container | FastAPI via `uvicorn` (pip deps) |
| Python deps | conda envs (`atomipy-core` / `-openff`) | conda (baked into image) | **pip** (`requirements.txt`) |
| Simulations | OpenMM — **GPU if present**, else CPU | **CPU only** (image ships no OpenCL driver) | **GPU (CUDA)** |
| Simulation policy (`SIMULATION_MODE`) | `full` | **`em_only`** — EM allowed, NVT/NPT → Colab/local | `full` |
| OpenFF worker | auto-started on :8001 by `restart_dev.sh` | separate Cloud Run service | **optional** Step 1b (micromamba) |
| Celery + Redis | started by `restart_dev.sh` | not deployed (optional) | not installed |
| Public URL | `http://localhost:8080` | `https://www.atomipy.io` | a `*.trycloudflare.com` Cloudflare Quick Tunnel URL |
| Best for | development (hot reload) | sharing, light EM / short MD | heavy/long **GPU** MD |

### 3a. Local

Two ways to run locally (both first `git clone` the repo):

**Option A — Development (hot reload).** Needs **Node 20+**, **Miniconda/mamba**,
**redis-server**.
```bash
npm install
./restart_dev.sh
```
`restart_dev.sh` creates both conda envs, starts Redis + the Celery worker, the
**Core Backend** (FastAPI :8000), the **OpenFF worker** (:8001), and the **Vite**
dev server (:8080). Here the frontend is served by Vite (with HMR) and proxies
`/api` → :8000; FastAPI does **not** serve `dist/` in this mode. Open
<http://localhost:8080>.

**Option B — Production-like (Docker).** Needs only **Docker**. Runs the exact
image deployed online (FastAPI serving `dist/` + API) plus the worker:
```bash
docker compose up --build       # → http://localhost:8080
```

Local simulations use whatever OpenMM platform your machine offers (CUDA / Metal
/ OpenCL GPU if present, otherwise CPU).

### 3b. Online (Cloud Run — atomipy.io)

- Project `atomipywebmodule`, region `europe-north1`.
- **Two services:** `atomipy-web-module` (main, mapped to **atomipy.io /
  www.atomipy.io / top.atomipy.io**) and `atomipywebmodule-openff-worker`.
- Deployed by the **source-deploy trigger** (§2). Runtime config:
  `SIMULATION_MODE=em_only`, `OPENFF_WORKER_URL=<worker URL>`, **4 GiB** memory.
- **CPU-only, EM-only.** The image deliberately ships **no OpenCL driver**, so
  OpenMM uses its native CPU platform. `SIMULATION_MODE=em_only` allows **Energy
  Minimization** but refuses **NVT/NPT MD** (server returns 403 and the UI
  recommends Colab/local). For NVT/NPT MD, use Colab (GPU) or a local install.

### 3c. Google Colab (GPU)

`ColabLaunchGuide.ipynb` clones the repo, `pip install -r requirements.txt`,
builds the frontend, and launches the **same FastAPI server** via `uvicorn` with
simulations enabled on the **GPU**, exposed through a free **Cloudflare Quick Tunnel** (`*.trycloudflare.com` — no account/login/password).

- **Step 0** — set Runtime → GPU.
- **Step 1** — clone + install + build.
- **Step 1b (optional)** — installs the OpenFF/ACPYPE stack with a standalone
  **micromamba** (no kernel restart) and starts the worker on :8001, enabling the
  **Organic Molecule** node. Skip it and that one node is unavailable; everything
  else works.
- **Step 2** — launch the server + Cloudflare Quick Tunnel; just click the
  printed `*.trycloudflare.com` link (no password). The main server's
  `OPENFF_WORKER_URL` defaults to `http://127.0.0.1:8001`, so Step 1b needs no
  extra wiring.

---

## 4. Environment variables (main app)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port to listen on (Cloud Run injects this) |
| `SIMULATION_MODE` | `full` | `full` (all sims) · `em_only` (Energy Minimization only — NVT/NPT refused with a Colab/local recommendation) · `disabled` (no sims) |
| `DISABLE_SIMULATION` | `false` | Legacy: `true` = `disabled`. Ignored when `SIMULATION_MODE` is set |
| `OPENFF_WORKER_URL` | `http://127.0.0.1:8001` | URL of the OpenFF worker (Organic Molecule node) |
| `WEB_CONCURRENCY` | `1` | uvicorn worker processes |
| `FRONTEND_DIST` | `<backend>/dist` | Path to the built frontend; if absent, static serving is skipped (dev mode) |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Only used by the optional Celery worker |

OpenFF worker: `PORT`, `INTERCHANGE_EXPERIMENTAL=1`.

---

## 5. Deploy your own on Cloud Run

```bash
# 0. One-time: enable APIs + an Artifact Registry repo
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create atomipy --repository-format=docker --location=REGION

# 1. OpenFF worker (≥2 GiB RAM — importing openff toolkit alone OOMs 512 MiB).
#    Must stay public: the main app calls it without an auth token.
gcloud builds submit --config cloudbuild.openff.yaml

# 2. Main app (frontend + backend). SIMULATION_MODE=em_only is recommended for a
#    public CPU instance (EM allowed, NVT/NPT pointed to Colab/local); use 'full'
#    to allow all sims, or 'disabled' for build-only.
gcloud run deploy atomipy-web-module --source . --region REGION \
  --allow-unauthenticated --memory 4Gi --cpu 2 --timeout 900 \
  --set-env-vars SIMULATION_MODE=em_only,OPENFF_WORKER_URL=<worker-url>

# 3. (optional) Continuous deploys: Cloud Run console → "Set up continuous
#    deployment" on the GitHub repo (this creates the source-deploy trigger).
```

### Concurrency & capacity (important)
Each build/EM runs the generated script using **process-global state**
(`os.chdir` into the build's temp dir + a redirected `stdout`), so **two builds
must never share an instance** — they would corrupt each other's working dir and
output streams. Therefore:

- **`--concurrency=1` is required** on both services. Do **not** raise it.
- Serve more users by **scaling out** (`--max-instances`), not up. With online
  being EM-only (short runs) instances cycle quickly.
- Current sizing: main app `concurrency=1, max-instances=20, min-instances=1`
  (≈16 simultaneous users + page-load headroom, 40 vCPU); OpenFF worker
  `concurrency=1, max-instances=8`.
- To support **N concurrent users**, set `max-instances ≈ N + 25%`. Raise
  `min-instances` to reduce cold-start latency during bursts (costs more, since
  those instances are always on); the ~4 GiB image takes ~10–20 s to cold-start.
- Watch the region's **CPU quota** (`max-instances × cpu` vCPU); request an
  increase if you scale beyond it.

**Operational notes**
- The **main app needs ≥2 GiB** (4 GiB recommended): `/tmp` is RAM-backed on
  Cloud Run and build outputs are written there.
- The **worker has no auto-trigger** — redeploy it manually after changes.
- **Simulation workflow:** chain an **Energy Minimization (EM)** node *before*
  **NVT/NPT**. On the CPU (online) platform an unrelaxed structure can diverge
  (`Particle coordinate is NaN`); EM relaxes it first. (NVT/NPT do not
  auto-minimize by design.)

---

## 6. Repo map

| Path | Role |
|---|---|
| `src/`, `index.html`, `vite.config.ts` | React frontend (built into `dist/`) |
| `backend/core/` | FastAPI app: serves frontend + API (`main.py`, `routers/`, `services/`) |
| `workers/openff_worker/` | OpenFF/ACPYPE worker (separate service) |
| `atomipy/` | Vendored atomipy library |
| `envs/atomipy-core.yml`, `envs/atomipy-openff.yml` | conda environments |
| `Dockerfile` | Unified main-app image |
| `docker/Dockerfile.openff` | OpenFF worker image |
| `cloudbuild.yaml`, `cloudbuild.openff.yaml` | IaC / manual deploy configs |
| `docker-compose.yml` | Local production-like run |
| `restart_dev.sh` | Local dev launcher (hot reload) |
| `ColabLaunchGuide.ipynb` | Colab GPU launcher |
| `requirements.txt` | pip deps for non-conda envs (Colab) |
| `app.py` | Legacy Flask server (not in serving path) |
