# Installer build notes (practical log + cheat-sheet)

Companion to [`../DISTRIBUTION.md`](../DISTRIBUTION.md) (which explains the *design*). This
file is the **operational log**: the exact commands, the environment that worked, every
gotcha hit so far, and the checklist for turning the **prototype** into a **signed, public
"real deal"** — so future builds don't start from scratch.

Installer type: conda [`constructor`](https://github.com/conda/constructor) → one native
installer per OS, bundling a full conda env (Python + OpenMM + CPU GROMACS + FastAPI backend
+ built React frontend + vendored `atomipy`). The installed app is a **local-server + browser**
desktop app: the launcher starts `uvicorn` on loopback and opens the browser.

---

## TL;DR — rebuild the macOS arm64 pkg

From `atomipy-web-module/`:

```bash
npm run build                      # 1. build frontend -> dist/   (npm ci first on a clean checkout)
cd installer
./make_bundle.sh                   # 2. pack dist/+backend/+atomipy/+workers/+requirements -> app_bundle.tar.gz
conda run -n base constructor .    # 3. build atomipy-<ver>-MacOSX-arm64.pkg  (+ .sh)
```

- Step 2 is only needed when **app code** changed (frontend, backend, vendored `atomipy`, workers).
- The **launcher scripts ship via `extra_files`** (copied verbatim, *not* inside `app_bundle.tar.gz`),
  so if you only edit `launch_atomipy.sh` / `.bat`, skip step 2 and just re-run step 3.
- `constructor` **refuses to overwrite an existing install prefix** — see gotcha #1 before re-installing.

## Toolchain that worked (2026-07-22, this machine)

| Tool | Version | Notes |
|---|---|---|
| macOS / arm64 | Darwin 24.6.0, Apple Silicon | "non-Intel" == `osx-arm64` |
| conda | 26.1.1 (miniforge) | `conda-forge` channel |
| constructor | 3.15.3 | `conda install -n base -c conda-forge constructor` |
| node / npm | 25.9.0 / 11.12.1 | Vite 8 build |
| build time | ~6.3 min | full env solve + download + pkg assembly |
| artifact size | `.pkg` 247 MB, `.sh` 248 MB | installs to ~1.1 GB on disk |

`constructor` does **not cross-compile** — run it *on* each target OS. macOS build emits both
`.pkg` (GUI) and `.sh` (headless) for `osx-arm64`; an Intel Mac would emit `osx-64`.

---

## Gotchas & fixes (each cost time — don't rediscover)

### 1. "Chosen path already exists!" on (re)install
`constructor` never installs over an existing prefix. The macOS `.pkg` defaults to `~/atomipy`.
If a previous install is there, the installer aborts with *"'/Users/…/atomipy' already exists.
Please relaunch the installer and choose another location."*
- **Fix:** remove or rename the old prefix, then re-run — `mv ~/atomipy ~/atomipy_old && <install>`
  (rename is reversible; the old env won't *launch* after a rename because its Python shebangs are
  absolute, but we discard it anyway). Or pick a different dir in the installer's **Destination
  Select** step.
- The `outputs/{cache,presets,uploads}` dirs in an install are normally **empty** (runtime scratch),
  so there's usually no user data to preserve — but check before deleting.

### 2. Port 8000 already in use
Two local servers (or a leftover dev backend) both want `127.0.0.1:8000` → the second dies with
`[Errno 48] address already in use`.
- **Fixed in the launcher (2026-07-22):** `launch_atomipy.sh`/`.bat` now auto-pick a port —
  explicit `ATOMIPY_PORT` wins; else prefer 8000; else fall back to an OS-assigned free port.
  The launcher prints the actual URL and opens it.
- The probe uses **`connect_ex` ("is anything actually listening?")**, *not* a trial `bind` — a bind
  can spuriously fail on a port left in **TIME_WAIT** by a just-killed server, while uvicorn
  (`SO_REUSEADDR`) can still use it. `connect_ex` only reports busy when a live listener is present.
- Manual escape hatches:
  ```bash
  lsof -nP -iTCP:8000 -sTCP:LISTEN          # who has it
  kill $(lsof -tiTCP:8000 -sTCP:LISTEN)     # free it (add -9 if stubborn)
  ATOMIPY_PORT=8010 ~/atomipy/launch_atomipy.sh   # or just use another port
  ```

### 3. Unsigned / not notarized (Gatekeeper)
The prototype `.pkg` is **unsigned** (`pkgutil --check-signature` → "no signature"). Fine on the
build machine; on **another** Mac, Gatekeeper blocks it.
- Test-bypass: right-click → Open, or `xattr -dr com.apple.quarantine atomipy-*.pkg`.
- Real distribution needs Apple **Developer ID** signing + **notarization** (see checklist below).

### 4. `npm ci` ERESOLVE (Vite 8 vs plugin peer range)
The repo tracks Vite 8 while `@vitejs/plugin-react-swc` still declares peers only up to Vite 7.
A committed `.npmrc` with `legacy-peer-deps=true` makes `npm ci`/`npm install` succeed with no flag.
If building somewhere without the `.npmrc`, use `npm ci --legacy-peer-deps`.

### 5. Re-vendor `atomipy` before bundling
The bundle ships the web-module's `./atomipy` copy. Make sure it's synced from canonical
`atomipy` first, or the desktop app runs stale library code. (Verify a known-new symbol is present,
e.g. `grep -c pull_mdp_extra atomipy/gromacs/mdp.py` before `make_bundle.sh`.)

---

## GPU / engine reality (Apple Silicon)

- **GROMACS = CPU-only on arm64, unavoidably.** GROMACS GPU offload is CUDA (no NVIDIA on Apple),
  or OpenCL (Apple deprecated it, and recent GROMACS dropped it); there is **no Metal backend and no
  GPU GROMACS conda package for `osx-arm64`** to bundle. Any "GPU GROMACS on a Mac" is an Intel Mac +
  AMD GPU on older GROMACS (≤2024), which doesn't carry to arm64.
- **OpenMM = GPU-capable on the same Mac** via its **OpenCL** platform (auto-selected on the M-series
  integrated GPU). So on Apple Silicon: OpenMM is the GPU path, GROMACS is CPU. The bundle pairs
  GPU-capable OpenMM (`openmm>=8.1`) with CPU GROMACS deliberately.

## What's bundled vs not
- **Bundled:** Python 3.11, OpenMM, CPU GROMACS, FastAPI/uvicorn, the built frontend, vendored
  `atomipy`, analysis deps (numpy/scipy/pandas/matplotlib/gemmi/numba). Local **EM/NVT/NPT run
  offline** (`SIMULATION_MODE=full` default in the launcher).
- **Present but idle on desktop:** `celery`/`redis-py` client libs are in the spec so imports never
  fail, but the desktop build runs jobs **in-thread** (no redis/celery services needed).
- **Not a bundled service:** the **OpenFF worker** (organic GAFF/OpenFF force fields, normally
  `:8001`). Organic-FF features need it running; for a polished desktop build, run it as an in-process
  thread (future work).

---

## Version bumping
Keep these in sync when cutting a new installer version:
- `installer/construct.yaml` → `version:`  (drives the artifact filename `atomipy-<ver>-…`)
- `package.json` → `version`  (frontend build stamp)

## File map (installer/)
| File | Role |
|---|---|
| `construct.yaml` | constructor recipe (conda specs, extra_files, post_install, per-OS type) |
| `make_bundle.sh` | packs `dist/ backend/ atomipy/ workers/ requirements.txt` → `app_bundle.tar.gz` |
| `app_bundle.tar.gz` | the app payload, unpacked into `$PREFIX` by post_install |
| `launch_atomipy.sh` / `.bat` | shipped via `extra_files`; start uvicorn on loopback + auto-port + open browser |
| `post_install.sh` / `.bat` | unpack `app_bundle.tar.gz`, chmod launcher, print next steps |
| `atomipy-<ver>-MacOSX-arm64.pkg` / `.sh` | build output (gitignored; not committed) |

---

## Checklist → the "real deal" (public, signed, multi-OS)

**Per-OS builds (constructor can't cross-compile):**
- [ ] macOS `osx-arm64` `.pkg`/`.sh` — this machine ✅ (prototype)
- [ ] macOS `osx-64` (Intel) — on an Intel Mac or CI runner, if still supporting Intel
- [ ] Linux `x86_64` `.sh` — Linux box / CI (also the basis for an Apptainer image for HPC — see below)
- [ ] Windows `x86_64` `.exe` — a Windows machine / CI; verify `tar.exe` (bsdtar, Win10+) unpacks the bundle

**macOS signing + notarization:**
- [ ] Apple Developer ID Installer cert; `productsign --sign "Developer ID Installer: …" in.pkg out.pkg`
- [ ] Notarize: `xcrun notarytool submit out.pkg --keychain-profile … --wait` then `xcrun stapler staple out.pkg`
- [ ] Sign the bundled Mach-O binaries too if hardened-runtime issues appear (constructor has signing hooks)

**Windows signing:**
- [ ] Authenticode code-signing cert for the `.exe` (SmartScreen otherwise warns)

**Recipe polish:**
- [ ] Uncomment `license_file:` in `construct.yaml` and add a real `LICENSE` (shows a license page)
- [ ] App icon / branding (welcome image, `.pkg` background) — `welcome_image`, `icon_image` keys
- [ ] Pin conda specs (e.g. exact `gromacs`/`openmm` builds) for reproducibility
- [ ] Bundle/launch the OpenFF worker if organic force fields must work out-of-the-box
- [ ] Test each installer on a **clean** VM/user (no dev conda on PATH, Gatekeeper on)

**HPC / ThinLinc (separate track):** loopback-only launcher already fits; prefer an **Apptainer/
Singularity** image built from `docker/Dockerfile.core` (rootless, HPC-standard). Per-user port is now
handled by the auto-port launcher. Note: the app runs sims as subprocesses **on whatever node hosts the
server** — steer heavy runs to compute nodes (interactive allocation), not login nodes. (A dedicated
`docs/HPC.md` is the natural home for this.)
