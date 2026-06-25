# Distributing atomipy as a desktop installer (conda `constructor`)

This describes the **prototype** installer in [`installer/`](installer/) that packages the
atomipy web-module as a **native, self-contained installer per operating system**, bundling
a full conda environment (Python + **OpenMM** + **CPU GROMACS**) together with the FastAPI
backend, the built React frontend, and the vendored `atomipy` package.

> Status: **prototype** — the recipe is complete but should be built and tested on each
> target OS before distribution.

---

## What the user gets

A double-click installer that lays down a self-contained folder and a launcher:

| OS | Installer artifact | Launcher |
|---|---|---|
| Windows | `atomipy-<ver>-Windows-x86_64.exe` | `launch_atomipy.bat` |
| macOS | `atomipy-<ver>-MacOSX-<arch>.pkg` (or `.sh`) | `launch_atomipy.sh` |
| Linux | `atomipy-<ver>-Linux-x86_64.sh` | `launch_atomipy.sh` |

Running the launcher boots the FastAPI server and opens the app at
`http://127.0.0.1:8000`. No separate Python/conda/Node install is required — everything
(including **OpenMM** and a **CPU GROMACS**) is inside the bundle, so **local EM / NVT / NPT
work offline**.

---

## Building the installer

1. **Install constructor** (once, into your base conda):
   ```bash
   conda install -n base -c conda-forge constructor
   ```
2. **Build the frontend** so `dist/` exists (the recipe copies it in), from the repo root:
   ```bash
   npm ci && npm run build
   ```
   > The repo includes a `.npmrc` with `legacy-peer-deps=true`. It's needed because the
   > project tracks **Vite 8** while `@vitejs/plugin-react-swc` still declares its peer range
   > only up to Vite 7 (it works fine with Vite 8). Without it, `npm ci` fails with
   > `ERESOLVE`. The `.npmrc` makes `npm ci`/`npm install` succeed without any flag (also
   > fixes CI / Colab / the Cloud Run build). If you ever build elsewhere without the
   > `.npmrc`, use `npm ci --legacy-peer-deps` instead.
3. **Make sure the vendored `atomipy/` is current** (re-vendored from the canonical library).
4. **Pack the app bundle.** constructor's `extra_files` copies individual *files* only (not
   directories), so the app (`dist/` + `backend/` + `atomipy/` + `workers/` +
   `requirements.txt`) is shipped as one archive that `post_install` unpacks:
   ```bash
   cd installer
   ./make_bundle.sh          # writes installer/app_bundle.tar.gz (needs dist/ from step 2)
   ```
5. **Build** the installer from the same folder. `constructor` is a conda package, so run it
   from the env it's installed in (here, `base`):
   ```bash
   conda run -n base constructor .
   # or:  conda activate base   &&   constructor .
   ```
   This resolves the conda packages and emits the native installer for the OS you build on.
   (Build on each OS you want to ship — constructor does not cross-compile.)

   First run **downloads ~1 GB** of conda packages (OpenMM, GROMACS, …) and takes a few
   minutes. On Apple Silicon it builds `osx-arm64`; output lands in `installer/`, e.g.
   `atomipy-<ver>-MacOSX-arm64.pkg` (and `.sh`).

> **License (optional).** `license_file` is **commented out** in `construct.yaml` so the
> prototype builds without a `LICENSE`. For public distribution, add a `LICENSE` file and
> uncomment that line to show a license page in the `.pkg`/`.exe` installers.

---

## GROMACS: bundled by default, but the custom path still works

**Yes — the user can still set a custom GROMACS path.** The "GROMACS path" field in the
Simulate node is part of the app and is unaffected by how the app is installed. The installer
just gives you a sensible default:

- **Bundled (default).** The recipe includes `gromacs` (conda-forge, **CPU** build), and the
  launcher puts the env's `bin`/`Library\bin` on `PATH`. So the Simulate node's default value
  `gmx` resolves to the **bundled GROMACS** — it works out of the box, no path needed.
- **Override (custom build).** Type a path into the node's **GROMACS path** field to use your
  own GROMACS instead. atomipy accepts any of:
  - a **`gmx` binary** (e.g. `/opt/gromacs/bin/gmx`),
  - a **`GMXRC`** script (e.g. a cluster module's `.../bin/GMXRC`),
  - an **install directory** (its libraries are added to the loader path automatically).

  Use this to point at a **GPU/CUDA GROMACS**, a **newer version**, or a **cluster module**.

### GPU note
The bundled GROMACS is **CPU-only** (safe to ship on Windows/macOS/Linux). For GPU:
- **OpenMM** in the same bundled env automatically uses **CUDA / OpenCL / Metal** when a
  supported GPU/driver is present — so OpenMM MD can already be GPU-accelerated.
- For **GPU GROMACS**, either **override the path** to a local CUDA build, or use the
  **Google Colab** GPU path. The CPU bundle remains the universal fallback.

---

## What's in the bundle (and what isn't)

**Included:** Python 3.11, OpenMM, CPU GROMACS, NumPy/SciPy/pandas/matplotlib/numba, gemmi,
FastAPI + uvicorn, the FastAPI backend, the built frontend (`dist/`), and the vendored
`atomipy` package. `SIMULATION_MODE=full` (local EM/NVT/NPT all enabled).

**Not included (by design, for the prototype):**
- The **OpenFF / GAFF organic worker** runs in a *separate* environment, so the **Organic
  Molecule (GAFF/OpenFF)** node is unavailable unless that stack is installed separately
  (same as the Colab launcher's optional step). Everything else — build, MINFF/CLAYFF,
  solvate/ions, simulate, analyse, visualize — works.
- **Redis/Celery server** — not needed; the desktop build runs builds in-thread.

---

## Install location & uninstalling

The recipe sets `initialize_conda: false` and `register_python: false`, so the installer
**does not modify the user's shell** (`~/.zshrc` etc.) or register a system Python — the app
runs only via the bundled launcher. The whole install is therefore a single self-contained
folder.

**macOS (`.pkg`)** — installs into the home directory by default: **`~/atomipy`** (the
GUI can change this). To uninstall:
```bash
rm -rf ~/atomipy                              # 1. delete the install folder
pkgutil --pkgs | grep -i atomipy             # 2. find the package id ...
sudo pkgutil --forget <that-id>              #    ... and forget the receipt
```
(With `initialize_conda: false` there is no shell-init block to remove.)

**Linux (`.sh`)** — installs to the path chosen during install (default `~/atomipy`);
uninstall = `rm -rf <that-folder>`.

**Windows (`.exe`)** — installs to the chosen folder (default `%USERPROFILE%\atomipy`);
uninstall = delete that folder (it appears in *Apps & features* only if you enable a
Windows uninstaller in the recipe).

> Launch after install via the bundled `launch_atomipy.sh` / `launch_atomipy.bat` in the
> install folder.

---

## Caveats / things to verify

- **Size.** OpenMM + GROMACS make the installer large (hundreds of MB to ~1+ GB). Expected.
- **Per-OS builds.** Run `constructor` on each OS; it doesn't cross-compile.
- **`dist/` must be pre-built** (step 2) and **`./make_bundle.sh` run** (step 4) before
  `constructor .` — the generated `installer/app_bundle.tar.gz` is what gets shipped. It's a
  build artifact (safe to `.gitignore`); re-run `make_bundle.sh` whenever the app changes.
- **Port** defaults to 8000; override with the `ATOMIPY_PORT` env var.
- **First launch** may be slow (OpenMM/GROMACS plugin discovery).
- This is a **prototype**: test a real EM and a GROMACS run from the installed app on each OS,
  and confirm the bundled `gmx` is found (Simulate node shows a "gmx detected" hint) and that
  a custom path override is honoured.

---

## Files

| File | Purpose |
|---|---|
| [`installer/construct.yaml`](installer/construct.yaml) | The constructor recipe (packages + bundled app + launchers). |
| [`installer/make_bundle.sh`](installer/make_bundle.sh) | Packs `dist/`+`backend/`+`atomipy/`+`workers/` into `app_bundle.tar.gz` (run before constructor). |
| [`installer/launch_atomipy.sh`](installer/launch_atomipy.sh) | macOS/Linux launcher (sets PATH/env, starts uvicorn, opens browser). |
| [`installer/launch_atomipy.bat`](installer/launch_atomipy.bat) | Windows launcher. |
| [`installer/post_install.sh`](installer/post_install.sh) | macOS/Linux post-install (chmod launcher, optional pip extras, print next steps). |
| [`installer/post_install.bat`](installer/post_install.bat) | Windows post-install. |
