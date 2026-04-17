# atomipy web module

A powerful, web-based visual workflow builder for composing atomistic systems for molecular dynamics (MD) simulations. Built on top of the [atomipy](https://github.com/mholmboe/atomipy) Python library.

![UI Preview](/public/placeholder.svg)

## 🚀 Overview

**atomipy web module** allows researchers to build complex molecular systems through an intuitive node-based interface. Instead of writing long scripts, you can compose your system by connecting nodes—representing operations like importing, replicating, merging, and solvating—to create a reproducible workflow.

## ✨ Key Features

- **Node-Based Workflow**: Visualize your system-building pipeline using [React Flow](https://reactflow.dev/).
- **Dynamic Slabs**: Import from a library of mineral presets (Montmorillonite, Pyrophyllite, Kaolinite, etc.) or upload your own `.pdb`, `.gro`, `.cif`, or `.xyz` files.
- **Workflow Tools**:
    - **Replicate**: Expand unit cells into larger supercells.
    - **Merge**: Intelligently combine layers with overlap-aware atom removal.
    - **Add Ions & Solvate**: Automatically add charge-balancing ions and water layers.
    - **XRD Simulation**: Simulate X-ray Diffraction patterns directly within the builder, with support for preferred orientation.
- **System Analysis**: Perform Bond Valence Sum (BVS) analysis and bonded term checks.
- **Export**: Generate ready-to-run systems for **GROMACS**, **LAMMPS**, or **NAMD**, complete with auto-generated Python build scripts for local reproduction.

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- **Graph Engine**: [@xyflow/react](https://reactflow.dev/).
- **Backend**: Flask (Python).
- **Core Library**: [atomipy](https://github.com/mholmboe/atomipy) for all molecular operations.

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.9+)
- [atomipy](https://github.com/mholmboe/atomipy) installed in your Python environment.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mholmboe/atomipy-web-module.git
   cd atomipy-web-module
   ```

2. **Setup the Backend**:
   - Create a virtual environment and install dependencies:
     ```bash
     python -m venv .venv
     source .venv/bin/activate  # or .venv\Scripts\activate on Windows
     pip install flask werkzeug atomipy
     ```
   - Run the backend server:
     ```bash
     python app.py
     ```

3. **Setup the Frontend**:
   - Install npm dependencies:
     ```bash
     npm install
     ```
   - Start the development server:
     ```bash
     npm run dev
     ```

## 📖 Usage

1. **Add Nodes**: Use the top toolbar to add nodes like `Import`, `Rep`, `Box`, and `Solv`.
2. **Connect Pipes**: Drag connections between node handles to define the flow of atoms and cell metrics.
3. **Configure**: Click on nodes to adjust parameters (e.g., replication factors, water density, XRD wavelength).
4. **Build**: Click the **Build** button to send the workflow to the backend.
5. **Download**: Once finished, download a `.zip` file containing your structure files, topology, and the exact Python script used to build the system.

## 📝 License

This project is part of the atomipy ecosystem. See the [atomipy main repository](https://github.com/mholmboe/atomipy) for licensing details.

---
*Generated with ❤️ by atomipy developers.*
