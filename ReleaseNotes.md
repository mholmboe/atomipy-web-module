# Release Notes: atomipy Visual Builder (`atomipy-web-module`) v0.4.0

*Released 2026-06-06 · embeds atomipy 0.96*

This release turns the Visual Builder into a full node-based MD workbench:
energy minimization / MD with live plots, the new **Dummy FF**, inorganic and
organic libraries, an organic parametrization path (GAFF / OpenFF Sage), 3Dmol &
JSmol viewer upgrades, a box "Fit to mol" mode, and a batch of editor
quality-of-life improvements.

---

## 🧪 Simulation & Forcefields
* **Simulate node**: run Energy Minimization and NVT (and NPT where supported) directly from the workflow graph, with **live potential-energy & temperature plots**, **decoupled Log vs PDB-trajectory frequencies**, and a **fluctuating bounding-box** in the 3Dmol trajectory viewer (NPT box expansion/contraction).
* **Forcefield node**: MINFF / CLAYFF (mineral), GAFF / OpenFF Sage (organic), and the new **Dummy FF** for non-MINFF inorganics (Pauling charges, self-calculated UFF Lennard-Jones, MINFF global cutoffs, "No angles" option at the top of the list).
* A self-contained `.top` is written per chained run.

## 📚 Libraries & Import
* **Inorganic material Library** picker (MINFF presets + a 517-crystal Avogadro/COD/IZA library) on the **Structure** and **Insert** nodes — the old standalone preset dropdown is folded into the library.
* **Organic Molecule** node: build from **SMILES**, an **uploaded file**, or the **bundled 428-molecule library**, then parametrize with **GAFF-2.11** (ACPYPE) or **OpenFF Sage**.
* **Accurate upload-format handling**: structure import (`.pdb`/`.gro`/`.xyz`/`.cif`/`.mmcif`/`.poscar`/`.contcar`/`.pqr`/`.cjson`) via atomipy; organic uploads (`.mol`/`.mol2`/`.sdf`) via the GAFF/Sage path.

## 🧭 Geometry & Editing
* **Box node "Fit to mol"** mode — size the box to the structure + margin per side, with optional cubic and center-molecule options.
* **Topology pass-through**: organic `.itp` now survives coordinate-only nodes; the Dummy FF is exportable.
* **Duplicate a whole shift-selected set of nodes**; horizontal auto-layout for disconnected nodes; visible node selection; **resizable Node Status window**.

## 🖥️ Viewer
* **Save image** (PNG, 1× / 2× / 4×) from both 3Dmol and JSmol.
* JSmol **"Hide periodic bonds"** option.

## ⚠️ Data Retention & Docs
* Clear warning (download button, Help page, and README) that **results are download-only and never stored on the server** — there is no database/persistent storage and no one else can access them.
* **Acknowledgements** of third-party software and data dependencies on the Help page.
* Corrected file-format claims so advertised import/export formats match what the app actually supports.

## 🌐 Routing
* **`atomipy.io/topology`** now redirects to the standalone Topology Generator at **`topology.atomipy.io`**.

---

*Embeds atomipy 0.96 — see the atomipy core release notes for engine-level changes.*
