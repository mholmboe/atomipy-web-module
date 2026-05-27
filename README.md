# atomipy web module

A powerful, node-based visual programming environment for designing, manipulating, and analyzing molecular systems. Built on top of the **[atomipy](https://github.com/mholmboe/atomipy)** Python library, this web application allows researchers to create complex mineral-water systems through an intuitive graph interface.

![atomipy web module](screenshot.png)

## 🚀 Key Features

- **Visual Workflow**: Build systems by connecting nodes: Import → Replicate → Solvate → Add Ions → Run Simulation → Export.
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
- **Interactive MD Simulations**:
    - **Simulation Node**: Execute Molecular Dynamics (NVT) simulations directly in the node workspace.
    - **GPU Acceleration**: Utilizes hardware GPU acceleration (via OpenMM's OpenCL/Metal/CUDA platforms) automatically when available, falling back to CPU or Reference platforms seamlessly.
    - **Live Trajectory Plotting**: Real-time graphing of potential energy and temperature progress directly in the web UI.
    - **Auto-Unzipping & Download**: Download the completed trajectory, topology, and state files in an automatically unzipped structural bundle.
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

You will need **Node.js (v20+)** and **Python (3.11+)** installed on your system.

#### 1. Clone the Repository
```bash
git clone https://github.com/mholmboe/atomipy-web-module.git
cd atomipy-web-module
```

#### 2. Backend Setup (Flask)
```bash
# It is recommended to use a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

#### 3. Frontend Setup (React/Vite)
```bash
npm install --legacy-peer-deps
```

#### 4. Run Development Servers
You will need two terminal windows open:

**Terminal 1 (Backend):**
```bash
python app.py
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```
Open your browser at `http://localhost:8080`.

---

## 🐳 Docker Deployment

The application is containerized for easy deployment (e.g., on Render or Google App Engine).

```bash
docker build -t atomipy-web .
docker run -p 5002:5002 atomipy-web
```

---

## 🏗️ Architecture

- **Frontend**: React, React Flow (for the node graph), Tailwind CSS, Shadcn UI.
- **Backend**: Flask (Python), Gunicorn (Production server).
- **Core Engine**: `atomipy` (Molecular geometry & topology logic).

## 📄 License
This project is part of the atomipy web module toolbox. See the main [atomipy](https://github.com/mholmboe/atomipy) repository for licensing details.
