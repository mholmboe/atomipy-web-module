# Release Notes: atomipy Visual Builder (`atomipy-web-module`) v0.5.2

*Released 2026-11-15 · embeds atomipy 1.1*

A Box- and XRD-node release: the **System Box size** node now shows the real unit
cell of a crystal picked from the Library (and no longer fabricates a bogus 50³
box), and the **XRD** node gains Advanced options, (hkl) peak labels, super-cell
Miller-index scaling, and a peak-list export.

## 📦 Box node — real crystal cell on display
* **Crystal unit cell now displayed.** Pick a crystal from the Library (e.g.
  *Oxides → SiO₂-Quartz-α*) and the downstream Box shows its actual cell —
  `4.9124, 4.9124, 5.4039 / 90, 90, 120` — instead of the old `auto`/placeholder.
  A crystal's cell lives inside its CIF, which the browser never parsed, so the
  Box previously had no numbers to show. A new backend endpoint
  (`GET /api/inorganic/cell`) reads the cell from the CIF and the Structure node
  fetches it on selection; the Box reads it through the normal upstream trace.
* **Scales with Replicate/Scale.** With a Replicate 2×2×4 in between, the Box now
  reads `9.8248, 9.8248, 21.6154` (volume ×16), angles preserved — the cell is
  display-only and never enters the generated Python, so `load_crystal` stays the
  authoritative source and the numbers match the build.
* **No more phantom 50³ box.** Toggling the **Cell ↔ Box Dim** tabs on an empty
  (pass-through) box used to materialise a fake `50 × 50 × 50` cell, which then
  overrode the real upstream cell (wrong downstream results, e.g. XRD) and could
  not be re-seeded. The toggle now only converts fields that actually hold values;
  an empty box reads **"auto (from upstream)"**. Existing graphs still holding a
  stale `50` can be cleared with the node's **↻ reset** button.

## 🔬 XRD node — Advanced options, (hkl) labels & super-cell scaling
* **Advanced options** (collapsible) expose the full `ap.xrd` control set that the
  node previously hard-coded:
  * **Broadening** — per-family peak widths `fwhm_00l` / `fwhm_hk0` / `fwhm_hkl`
    and a **Lorentzian** mixing factor (pseudo-Voigt profile).
  * **Preferred orientation** — a strength parameter + a preferred `(hkl)` direction
    (exponential `exp(pref·cos2θ)` texture correction).
  * **B-factor** — an isotropic Debye–Waller `B` (`b_all`) damping the high-angle tail.
  * **Neutral atoms** — use neutral atomic scattering factors instead of ionic.
* **(hkl) peak labels.** A *Show (hkl) labels* toggle draws Miller indices above the
  strongest peaks, both in the node's inline plot (with anti-overlap thinning) and in
  the exported data. Off by default.
* **Super-cell Miller scaling.** Enter the system's replication factor as three
  integers (**nₓ, n_y, n_z**); peaks from a super-cell are **labelled with the reduced
  (primitive-cell) index** — e.g. a 2×2×4 super-lattice reflection `(2 0 4)` prints as
  `(1 0 2)` — and super-lattice-only peaks are flagged.
* **Peak-list export.** XRD now returns a labelled peak list (`two_theta`, intensity,
  `hkl`, raw index, multiplicity, super-lattice flag); download it as **`peaks.csv`**
  from the node. (Backed by `ap.xrd(..., return_peaks=True, supercell=…)` in atomipy 1.1.)

---

# Release Notes: atomipy Visual Builder (`atomipy-web-module`) v0.5.1

*Released 2026-06-25 · embeds atomipy 0.97*

A focused viewer release: a third renderer (**NGL**) for smooth large-trajectory
playback, plus trajectory-rendering fixes.

## 🧊 Viewer
* **NGL renderer** added alongside 3Dmol and JSmol (toggle at the top of the node).
  NGL uses **GPU impostor rendering**, so large MD trajectories play smoothly where
  3Dmol bogs down. Wired to all the shared controls: representations (ball & stick /
  sticks / spheres / lines), element/charge **labels**, unit cell (thin blue box),
  hydrogens, spin, projection, **trajectory playback**, style presets, **PNG export**,
  and reset. Not in NGL: Miller-plane overlay and outline (3Dmol/JSmol).
* **Whole-molecule trajectories**: the GROMACS viewer trajectory is now wrapped with
  `-pbc mol` (was `-pbc atom`), so molecules stay whole and bonds no longer stretch
  across the box during playback.
* **Sizing/zoom fix**: the viewer canvas now fills the node at any React Flow zoom
  level (sized to layout pixels, not the zoom-transformed rectangle).
* The empty-viewer placeholder now includes a short **renderer guide** (which mode is
  best for what).

---

# Release Notes: atomipy Visual Builder (`atomipy-web-module`) v0.5.0

*Released 2026-06-24 · embeds atomipy 0.97*

This release adds a second simulation engine (**GROMACS**), a **trajectory-analysis**
toolkit, a **Water-models** library, a files/variable **Inspector**, clearer run-error
feedback, and two ways to run **GROMACS on a Colab GPU**.

---

## ⚙️ Simulation — now two engines
* **GROMACS engine** in the Simulate node (grompp + mdrun) alongside OpenMM. Each
  node runs **one stage** (EM / NVT / NPT) and they **chain in any order**, each
  continuing from the previous structure. Point it at any local GROMACS (binary,
  `GMXRC`, or install dir).
* **Editable `.mdp`** per stage (pop-out editor) or auto-generated from the fields.
* **Thermodynamics plot**: energy / temperature / pressure / volume / density vs
  time from `.edr` (GROMACS) or the OpenMM reporter.

## 🟢 GROMACS on a Google Colab GPU
* The launcher notebook's optional **Step 1c** cell installs a CUDA GROMACS via
  micromamba (no kernel restart) and puts `gmx` on PATH, so the GROMACS Simulate
  node runs on the GPU. (Clear the node's GROMACS-path field to use `gmx` on PATH.)

## 📈 Trajectory analysis nodes
* **RDF g(r) + running coordination n(r)**, **density profiles** (x/y/z;
  number/mass/charge), **MSD / self-diffusion** (3D/2D/1D + van Hove distribution),
  **VACF / power spectrum** (Green–Kubo *D* + vibrational DOS), and **hydrogen-bond**
  analysis (per-molecule counts; donor/acceptor by type or residue).
* Results stream to a multi-series **Data Plotter** and export as `.dat`/`.json`.

## 💧 Libraries, Inspector & UX
* **Water-models library** (SPC/E, TIP3P, TIP4P, TIP5P — hex-ice, grid, and
  equilibrated boxes); "96 water" removed from the MINFF category.
* **Inspector node** — reports the variables (atom counts/types, box, trajectory,
  topology) and files present at any point in the graph.
* **Run-error feedback** — a failing node turns its border red and shows the error
  message (only the node that actually failed).
* **Solvation fixes** — density now scales the water template; overlapping waters are
  declashed; contiguous residue/atom numbering; unmet target counts raise an error.

---

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
