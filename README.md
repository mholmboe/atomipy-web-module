# atomipy web module

A powerful, node-based visual programming environment for designing, manipulating, and analyzing molecular systems. Built on top of the **[atomipy](https://github.com/mholmboe/atomipy)** Python library, this web application allows researchers to create complex mineral-water systems through an intuitive graph interface.

![atomipy web module](screenshot.png)

## 🚀 Key Features

- **Interactive MD & Energy Minimization (EM) Simulations**:
    - **Simulation Node**: Execute Molecular Dynamics (NVT/NPT) and Energy Minimization (EM) simulations directly in the node workspace.
    - **Dynamic EM Trajectories**: Unlike standard minimizers, EM now runs step-by-step to compile a smooth, real-time relaxation trajectory of your system.
    - **Max Force Norm Logging**: EM table outputs report both Potential Energy and Maximum Euclidean Force Norm vectors in standard `kJ/mol/nm` units.
    - **Decoupled reporting frequencies**: Configure **Log frequency (steps)** and **PDB frequency (steps)** independently in the advanced settings.
    - **Clean Log CSV Headers Interceptor**: Built-in Python output stream wrapper (`CleanHeaderStream`) automatically filters and cleans comment symbols (`#`) and double quotes (`"`) from CSV header columns.
    - **GPU Acceleration**: Utilizes hardware GPU acceleration (via OpenMM's OpenCL/Metal/CUDA platforms) automatically when available, falling back to CPU or Reference platforms seamlessly.
    - **Live Trajectory Plotting**: Real-time graphing of potential energy and temperature progress directly in the web UI.
    - **Auto-Unzipping & Download**: Download the completed trajectory, topology, and state files in an automatically unzipped structural bundle.
- **Visual Workflow**: Build systems by connecting nodes: Import → Replicate → Solvate → Add Ions → Run Simulation → Export.
- **Topology & Structure Uploads**: Drag-and-drop structural coordinate files (`.xyz`, `.gro`, `.pdb`, `.cif`) as well as GROMACS topology files (`.itp`) cleanly into both the Import and Insert nodes.
- **Fluctuating Bounding Box Rendering**: Enabled dynamic unit cell/box animation in the 3Dmol viewer. Supports NPT simulation box expansion and contraction playbacks up to **1000 frames**.
- **Top-Left Warnings Position**: Floating Workflow Warning banners are positioned in the top-left corner of the editor canvas to prevent bottom dock overlapping.
- **Undo & Redo Capabilities**: Unlimited layout timeline history (up to 50 snapshots) with full `Cmd+Z` / `Cmd+Y` (or `Ctrl+Z` / `Ctrl+Y`) keyboard shortcut integration.
- **Session Auto-save & Restore**: Debounced local storage caching preserves the complete workflow layout across page refreshes or unexpected crashes.
- **Topological Warnings Alert**: Active rule-based prerequisite check validation (e.g. alerts when a Forcefield node is missing before a Simulation).
- **Trajectory Frame Extraction**: Advanced trajectory parser allowing standard pass-through of coordinates and single-frame snapshot extraction.
- **Strict Backend Safety Limits**: Enforced safety boundaries on system sizes and parameters:
    - **Replication Limits**: Maximum grid replication size capped at $15 \times 15 \times 15$.
    - **Spacing Safeguards**: Early errors for non-positive or abnormal solvate/ion minimum distances.
    - **Ion Thresholds**: Capped maximum ionization count at $10,000$ to prevent out-of-memory overheads.
    - **Path Traversal Shields**: Basename-scoped path parsing blocking folder traversal attempts (`..` or absolute prefixes).
- **Structure Library**: Built-in 100+ mineral preset structures (Pyrophyllite, Kaolinite, Montmorillonite, etc.).
- **3D Visualization**: Real-time 3D structure previewing with integrated NGL/3Dmol viewers.
- **Forcefield Generation**: Streamlined assignment of **MINFF** and **CLAYFF** parameters.
- **Advanced Analysis**:
    - **XRD Patterns**: Simulate high-performance X-ray diffraction patterns.
    - **BVS/GII Analysis**: Calculate Bond Valence Sums and Global Instability Index.
    - **Solvation & Ionization**: Automated placement of water and ions with periodic boundary awareness.
- **Format Support**: Import/Export for PDB, GRO, XYZ, and CIF (with symmetry expansion).

---

## 🛠️ Getting Started

### Online Access
Use the hosted version directly at:  
👉 **[www.atomipy.io](https://www.atomipy.io)** (also mirrored at [atomipy.io](https://atomipy.io) and [top.atomipy.io](https://top.atomipy.io))

---

### ⚡ GPU-Accelerated Google Colab Access (Recommended for Simulations)
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/mholmboe/atomipy-web-module/blob/main/ColabLaunchGuide.ipynb)

If you plan to run large molecular dynamics simulations, you can launch the Visual Builder with **free hardware GPU acceleration** via Google Colab!
1. Click the **"Open in Colab"** badge above to load the notebook directly in Google Colab.
2. Follow the simple steps inside the notebook to launch your private, GPU-accelerated cloud instance!

---

### Local Installation

You will need **Node.js (v20+)** and **Miniconda / Anaconda** (or mamba) installed on your system.

#### 1. Clone the Repository
```bash
git clone https://github.com/mholmboe/atomipy-web-module.git
cd atomipy-web-module
```

#### 2. Install Frontend Dependencies
```bash
npm install
```

#### 3. Run Development Servers
We provide a unified script that handles setting up conda environments (`atomipy-core` and `atomipy-openff`), launching Redis, starting the Celery worker, and spinning up both the Core Backend and OpenFF Microservice, plus the React frontend.

```bash
./restart_dev.sh
```

*(Note: You must have `redis-server` installed on your system, e.g. `brew install redis` or `sudo apt install redis-server`)*

The script will stream logs to `.dev-logs/` and open your frontend at `http://localhost:8080`.

---

## 🐳 Docker Deployment

The app deploys as a **single image**: the FastAPI core backend serves both the
API and the built React frontend. The OpenFF small-molecule worker is an
optional second service.

```bash
# Unified app + optional OpenFF worker
docker compose up --build
# open http://localhost:8080

# Or just the main image:
docker build -t atomipy-web .
docker run -p 8080:8080 -e PORT=8080 atomipy-web
```

### Cloud Run (atomipy.io)
A Cloud Run **source-deploy trigger** on this GitHub repo auto-builds the root
`Dockerfile` and deploys to the `atomipy-web-module` service on every push to
`main` (project `atomipywebmodule`, region `europe-north1`; domains atomipy.io /
www / top map to it). The service runs with `DISABLE_SIMULATION=false`
(CPU energy-minimization / short MD allowed; the image ships no OpenCL driver so
OpenMM uses the native CPU platform), `OPENFF_WORKER_URL` pointing at the
`atomipywebmodule-openff-worker` service, and 4Gi memory.

[`cloudbuild.yaml`](cloudbuild.yaml) / [`cloudbuild.openff.yaml`](cloudbuild.openff.yaml)
are optional Infrastructure-as-Code / manual-deploy references (the live path is
the source trigger; see headers in those files).

---

## 🏗️ Architecture

- **Frontend**: React, React Flow (for the node graph), Tailwind CSS, Shadcn UI — built with Vite and served by the backend in production.
- **Core Backend**: FastAPI (Python), serving the frontend, build-stream execution, and native `atomipy` merging logic without heavy GMSO dependencies.
- **OpenFF Worker**: Isolated FastAPI microservice handling `openff-interchange` / `openff-toolkit` (GAFF/Sage), reached via `OPENFF_WORKER_URL`.
- **Task Queue (optional)**: Celery + Redis for asynchronous jobs; not required for the build-only online path.
- **Core Engine**: `atomipy` (molecular geometry & purely native dictionary-based topology merging).
- **Legacy**: `app.py` (Flask) predates the FastAPI unification and is no longer in the serving path.

## 📄 License
This project is part of the atomipy web module toolbox. See the main [atomipy](https://github.com/mholmboe/atomipy) repository for licensing details.
