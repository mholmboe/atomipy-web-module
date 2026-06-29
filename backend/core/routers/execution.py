import os
import sys
import gc
import json
import uuid

import numpy as np
# NumPy 2.x compatibility patch:
# Intercept np.array calls specifying copy=False to prevent "Unable to avoid copy" errors on Python 3.14 + NumPy 2.x
_orig_array = np.array
def _compat_array(*args, **kwargs):
    if kwargs.get('copy') is False:
        try:
            return _orig_array(*args, **kwargs)
        except ValueError as e:
            if "Unable to avoid copy" in str(e):
                # Under NumPy 2.x, if copy=False fails, allow copy by setting copy=True (or removing copy=False)
                # This keeps all other arguments (like subok) perfectly intact!
                kwargs['copy'] = True
                return _orig_array(*args, **kwargs)
            raise
    return _orig_array(*args, **kwargs)
np.array = _compat_array
import queue
import time
import signal
import zipfile
import threading
import subprocess
import contextlib
import traceback
import tempfile
from typing import Optional, Dict

from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

router = APIRouter()
import os
import sys

# Fallback to local project root if not running inside Docker
if os.path.exists("/app"):
    BASE_DIR = "/app"
    OUTPUTS_DIR = "/tmp/outputs"
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")

CACHE_DIR = os.path.join(OUTPUTS_DIR, "cache")
UPLOADS_DIR = os.path.join(OUTPUTS_DIR, "uploads")
PRESETS_DIR = os.path.join(OUTPUTS_DIR, "presets")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _safe_join(base: str, *user_parts: str) -> str:
    """Join user-supplied path parts under ``base``, refusing anything that escapes it.

    Allows legitimate subfolders (e.g. ``zeolites/FAU.pdb``) but blocks ``../`` traversal
    and absolute paths, so a request can never read/write outside the intended directory.
    """
    base_real = os.path.realpath(base)
    candidate = os.path.realpath(os.path.join(base_real, *user_parts))
    if candidate != base_real and not candidate.startswith(base_real + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    return candidate
os.makedirs(PRESETS_DIR, exist_ok=True)


def simulation_mode() -> str:
    """Server simulation policy: 'full', 'em_only', or 'disabled'.

    Controlled by the SIMULATION_MODE env var (full | em_only | disabled). The
    legacy DISABLE_SIMULATION=true is honored as 'disabled' when SIMULATION_MODE
    is unset. The online (CPU) instance uses 'em_only' so users can run Energy
    Minimization but are pointed to Colab/local for NVT/NPT MD.
    """
    raw = os.environ.get("SIMULATION_MODE", "").strip().lower().replace("-", "_")
    if raw in ("disabled", "none", "off"):
        return "disabled"
    if raw in ("em_only", "emonly", "em", "minimize"):
        return "em_only"
    if raw in ("full", "all", "on"):
        return "full"
    # Legacy fallback
    if os.environ.get("DISABLE_SIMULATION", "false").lower() == "true":
        return "disabled"
    return "full"

import ctypes

# ---------------------------------------------------------------------------
# Active-build registry — maps build_id → thread for stop/abort support
# ---------------------------------------------------------------------------
# build_id -> the sandboxed subprocess (subprocess.Popen) running that build.
_active_builds: dict = {}
_active_builds_lock = threading.Lock()


# Environment variable names matching these (case-insensitive substrings) are never
# passed to the sandboxed build process — they are credentials/secrets the untrusted
# generated script has no business reading.
_SECRET_ENV_SUBSTRINGS = (
    "SECRET", "TOKEN", "PASSWORD", "PASSWD", "CREDENTIAL", "PRIVATE_KEY",
    "API_KEY", "APIKEY", "ACCESS_KEY", "_AUTH", "SESSION",
)
_SECRET_ENV_KEYS = {
    "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
}


def _sandbox_env() -> dict:
    """A copy of the environment with credentials/secrets removed (and stdio forced
    unbuffered) for the sandboxed build subprocess.

    Conda / OpenMM / GROMACS variables are preserved so simulations still work. The
    complementary control for cloud instance-metadata access (169.254.169.254) is
    network-egress restriction at the infra layer (Cloud Run egress settings).
    """
    env = {}
    for k, v in os.environ.items():
        ku = k.upper()
        if k in _SECRET_ENV_KEYS or any(s in ku for s in _SECRET_ENV_SUBSTRINGS):
            continue
        env[k] = v
    env["PYTHONUNBUFFERED"] = "1"
    return env


def _set_rlimits():
    """preexec_fn for the sandboxed build: apply optional resource limits.

    All limits are opt-in via env (default 0 = unlimited) so normal builds aren't
    constrained; enable them on shared/public instances. Wall-clock runaway is
    already bounded by BUILD_TIMEOUT and the process-group kill.
    """
    try:
        import resource
    except Exception:
        return

    def _set(which, mb=0, secs=0):
        try:
            if secs > 0:
                resource.setrlimit(which, (secs, secs + 10))
            elif mb > 0:
                b = mb * 1024 * 1024
                resource.setrlimit(which, (b, b))
        except Exception:
            pass

    _set(resource.RLIMIT_CPU, secs=int(os.environ.get("BUILD_RLIMIT_CPU_SECONDS", "0") or 0))
    _set(resource.RLIMIT_AS, mb=int(os.environ.get("BUILD_RLIMIT_AS_MB", "0") or 0))
    _set(resource.RLIMIT_FSIZE, mb=int(os.environ.get("BUILD_RLIMIT_FSIZE_MB", "0") or 0))


def _terminate_proc(proc) -> str:
    """Kill the sandboxed build process and its whole process group (children too)."""
    if proc is None:
        return "no_proc"
    if proc.poll() is not None:
        return "already_done"
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            return "kill_failed"
    return "ok"


def _kill_thread(thread: threading.Thread) -> str:
    """Raise SystemExit in *thread* via CPython's async-exception mechanism.

    Works reliably for pure-Python code; may take a few steps to fire inside
    C extensions (e.g. OpenMM will check at the next Python reporter call).
    Returns a human-readable status string.
    """
    tid = thread.ident
    if not tid:
        return "no_ident"
    res = ctypes.pythonapi.PyThreadState_SetAsyncExc(
        ctypes.c_ulong(tid),
        ctypes.py_object(SystemExit),
    )
    if res == 0:
        return "thread_gone"   # thread already finished
    if res > 1:
        # More than one thread affected — undo immediately
        ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_ulong(tid), None)
        return "multi_match"
    return "ok"


class BuildRequest(BaseModel):
    script: str
    workflow: Optional[dict] = None
    artifacts: Optional[Dict[str, str]] = None
    verbose_log: bool = False


class SSE:
    @staticmethod
    def status(msg): return f"data: {json.dumps({'type': 'status', 'message': msg})}\n\n"
    @staticmethod
    def build_id(bid): return f"data: {json.dumps({'type': 'build_id', 'buildId': bid})}\n\n"
    @staticmethod
    def progress(node_id, index): return f"data: {json.dumps({'type': 'progress', 'nodeId': node_id, 'index': int(index)})}\n\n"
    @staticmethod
    def log(line): return f"data: {json.dumps({'type': 'log', 'message': line})}\n\n"
    @staticmethod
    def visualize(node_id, data): return f"data: {json.dumps({'type': 'visualize', 'nodeId': node_id, 'data': data})}\n\n"
    @staticmethod
    def box(node_id, data): return f"data: {json.dumps({'type': 'box', 'nodeId': node_id, 'data': data})}\n\n"
    @staticmethod
    def complete(token, success): return f"data: {json.dumps({'type': 'complete', 'token': token, 'success': success})}\n\n"

def _iter_regular_files(work_dir, ignore_dirs):
    for root, dirs, files in os.walk(work_dir):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, work_dir)
            yield rel_path, full_path

@router.post("/build-stream")
async def build_stream(request: BuildRequest):
    script_code = request.script
    if not script_code:
        raise HTTPException(status_code=400, detail="No script provided")

    # Server-side enforcement of the simulation policy (the frontend also reflects
    # it via the /api/presets `simulationMode` flag, but this can't be bypassed).
    #   - 'disabled': no simulations at all (any OpenMM load is refused)
    #   - 'em_only' : Energy Minimization allowed; NVT/NPT MD refused.
    #
    # NB: the generated script ALWAYS contains both the EM (minimizeEnergy) and MD
    # (simulation.step) branches as `if True/False: ... else: ...`, so the body
    # cannot reveal the active type. The frontend emits an explicit marker
    # `# __ATOMIPY_SIM_TYPE__=<minimize|nvt|npt>` (one per Simulate node) which we
    # read here; fall back to the human-readable MD banner for older clients.
    import re as _re
    _mode = simulation_mode()
    _sim_types = [t.lower() for t in _re.findall(r"__ATOMIPY_SIM_TYPE__=([A-Za-z_]+)", script_code)]
    if _sim_types:
        _is_simulation = True
        _is_md = any(t in ("nvt", "npt") for t in _sim_types)
    else:
        # Fallback: EM uses only minimizeEnergy; NVT/NPT print "Executing NVT/NPT MD".
        _is_simulation = "load_minff_into_openmm" in script_code
        _is_md = ("Executing NVT MD" in script_code) or ("Executing NPT MD" in script_code)
    if _mode == "disabled" and _is_simulation:
        raise HTTPException(
            status_code=403,
            detail="Simulation execution is disabled on this server instance. "
                   "Run locally or in Google Colab to execute simulations.",
        )
    if _mode == "em_only" and _is_md:
        raise HTTPException(
            status_code=403,
            detail="NVT/NPT molecular dynamics is disabled on the public server "
                   "(CPU-only). Energy Minimization runs here — for NVT/NPT MD, "
                   "download the Python script and run it on Google Colab (GPU) "
                   "or a local install.",
        )

    BUILD_TIMEOUT = int(os.environ.get("BUILD_TIMEOUT_SECONDS", "600"))
    
    def generate():
        import atomipy as ap
        with tempfile.TemporaryDirectory(prefix="atomipy_stream_") as work_dir:
            # Prepare UC_conf symlink
            ap_data_dir = os.path.dirname(ap.__file__)
            potential_dirs = [
                os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
                os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
            ]
            uc_conf_dir = next((path for path in potential_dirs if os.path.exists(path)), None)
            if uc_conf_dir:
                try:
                    os.symlink(uc_conf_dir, os.path.join(work_dir, "UC_conf"))
                except OSError:
                    pass

            # Symlink uploads directory
            if os.path.exists(UPLOADS_DIR):
                try:
                    # In the legacy backend, session_id was used, but UPLOADS_DIR currently stores all uploads
                    os.symlink(UPLOADS_DIR, os.path.join(work_dir, "uploads"))
                except OSError:
                    pass

            # 1. Write the script
            script_path = os.path.join(work_dir, "build_script.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(script_code)

            # Save the workflow JSON if provided
            if request.workflow:
                from datetime import datetime
                date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
                workflow_filename = f"workflow_{date_str}.json"
                with open(os.path.join(work_dir, workflow_filename), "w", encoding="utf-8") as wf:
                    json.dump(request.workflow, wf, indent=2)

            # Save additional artifacts (Notebook, strict minimal script, full script) if provided
            if request.artifacts:
                for fname, content in request.artifacts.items():
                    safe_name = os.path.basename(fname)
                    with open(os.path.join(work_dir, safe_name), "w", encoding="utf-8") as af:
                        af.write(content)
                
            yield SSE.status('Build initializing...')

            # Assign a short build ID so the client can request a stop later
            build_id = str(uuid.uuid4())[:12]
            yield SSE.build_id(build_id)

            log_queue = queue.Queue()
            log_file_path = os.path.join(work_dir, "execution.log")
            log_file = open(log_file_path, "w", encoding="utf-8")

            _PROTOCOL_PREFIXES = (
                "__VISUALIZE_", "__BOX_", "__CHARGES_",
                "__XRD_DATA_", "__PLOT_", "__NODE_START__", "__INSPECT_",
            )
            _verbose_log = request.verbose_log

            # Run the (untrusted) generated script in a SEPARATE, sandboxed process:
            # a scrubbed environment (no secrets), its own process group (so the whole
            # process tree can be killed cleanly), and optional resource limits. The
            # script never shares this server's interpreter or memory. See
            # build_runner.py / build_runtime.py.
            runner_path = os.path.abspath(
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build_runner.py")
            )
            popen_kwargs = dict(
                cwd=work_dir,
                env=_sandbox_env(),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,  # own process group -> killpg cleans up children (gmx, ...)
            )
            if os.name == "posix":
                popen_kwargs["preexec_fn"] = _set_rlimits
            proc = subprocess.Popen([sys.executable, runner_path], **popen_kwargs)

            with _active_builds_lock:
                _active_builds[build_id] = proc

            def _pump_output():
                # Mirror the sandboxed build's stdout/stderr into the SSE queue, and
                # tee non-protocol lines into execution.log (same filtering as before).
                try:
                    for line in proc.stdout:
                        log_queue.put(line)
                        if _verbose_log or not any(p in line for p in _PROTOCOL_PREFIXES):
                            log_file.write(line)
                            log_file.flush()
                finally:
                    try:
                        rc = proc.wait()
                    except Exception:
                        rc = 1
                    try:
                        log_file.close()
                    except Exception:
                        pass
                    log_queue.put(f"__FINISH__:{0 if rc == 0 else 1}")

            reader = threading.Thread(target=_pump_output, daemon=True)
            reader.start()

            curr_line = ""
            success = False
            has_plot_data = False
            deferred_events = []
            deadline = time.time() + BUILD_TIMEOUT

            def process_line_item(line_str):
                nonlocal has_plot_data
                stripped = line_str.strip()
                if not stripped:
                    return None
                if "__NODE_START__:" in stripped:
                    try:
                        parts = stripped.split(":")
                        return SSE.progress(parts[1], parts[2])
                    except: pass
                elif "__VISUALIZE_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__VISUALIZE_", "")
                        pdb_data = parts[1].replace("\\n", "\n")
                        return SSE.visualize(node_id, pdb_data)
                    except: pass
                elif "__BOX_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__BOX_", "")
                        box_data = json.loads(parts[1])
                        return SSE.box(node_id, box_data)
                    except: pass
                elif "__XRD_DATA_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__XRD_DATA_", "")
                        xrd_data = json.loads(parts[1])
                        return f"data: {json.dumps({'type': 'xrd', 'nodeId': node_id, **xrd_data})}\n\n"
                    except: pass
                elif "__PLOT_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__PLOT_", "")
                        deferred_events.append(
                            f"data: {json.dumps({'type': 'plot', 'nodeId': node_id, 'data': json.loads(parts[1])})}\n\n"
                        )
                        has_plot_data = True
                    except: pass
                elif "__CHARGES_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__CHARGES_", "")
                        deferred_events.append(
                            f"data: {json.dumps({'type': 'charges', 'nodeId': node_id, 'data': json.loads(parts[1])})}\n\n"
                        )
                    except: pass
                elif "__INSPECT_" in stripped:
                    try:
                        parts = stripped.split("__:", 1)
                        node_id = parts[0].replace("__INSPECT_", "")
                        deferred_events.append(
                            f"data: {json.dumps({'type': 'inspect', 'nodeId': node_id, 'data': json.loads(parts[1])})}\n\n"
                        )
                    except: pass
                else:
                    return SSE.log(stripped)
                return None

            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    yield SSE.log(f"Build timed out after {BUILD_TIMEOUT}s.")
                    success = False
                    break
                try:
                    content = log_queue.get(timeout=min(15, remaining))
                    if content.startswith("__FINISH__"):
                        success = content.endswith(":0")
                        break

                    if content:
                        normalized_content = content.replace('\r', '\n')
                        lines_chunk = normalized_content.split('\n')
                        
                        curr_line += lines_chunk[0]
                        
                        if len(lines_chunk) > 1:
                            res = process_line_item(curr_line)
                            if res is not None:
                                yield res
                            
                            for middle_line in lines_chunk[1:-1]:
                                res = process_line_item(middle_line)
                                if res is not None:
                                    yield res
                                    
                            curr_line = lines_chunk[-1]
                except queue.Empty:
                    yield SSE.log(" ")
                    continue

            # Make sure the sandboxed process (and its group) is gone and the reader
            # has flushed/closed execution.log before we package the results. On a
            # normal finish the process has already exited; on timeout this kills it.
            _terminate_proc(proc)
            reader.join(timeout=5)

            if has_plot_data:
                yield SSE.log("Plot data ready.")

            # Package Results
            token = str(uuid.uuid4())
            zip_path = os.path.join(CACHE_DIR, f"result_{token}.zip")

            import shutil
            shutil.copy(script_path, os.path.join(work_dir, "run_openmm.py"))

            summary = {
                "success": success,
                "message": "Build succeeded." if success else "Build failed.",
            }

            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for fname, path in _iter_regular_files(work_dir, {"UC_conf", "uploads"}):
                    zf.write(path, arcname=fname)
                zf.writestr("build_summary.json", json.dumps(summary, indent=2))

            for evt in deferred_events:
                yield evt

            yield SSE.complete(token, success)

            # Clean up the build registry
            with _active_builds_lock:
                _active_builds.pop(build_id, None)

    return StreamingResponse(generate(), media_type="text/event-stream")

@router.get("/download-result/{token}")
async def download_result(token: str):
    zip_path = os.path.join(CACHE_DIR, f"result_{token}.zip")
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Result expired or not found")
    return FileResponse(zip_path, filename="atomipy_system_bundle.zip")


@router.post("/stop-build/{build_id}")
async def stop_build(build_id: str):
    """Abort a running build by killing the sandboxed subprocess and its whole
    process group (so OpenMM/GROMACS children die too). The client should also
    abort its SSE stream reader."""
    with _active_builds_lock:
        proc = _active_builds.get(build_id)

    if proc is None:
        return {"status": "not_found"}
    if proc.poll() is not None:
        with _active_builds_lock:
            _active_builds.pop(build_id, None)
        return {"status": "already_done"}

    status = _terminate_proc(proc)
    if status == "ok":
        # Give it a moment, then clean up the registry
        import asyncio
        asyncio.get_event_loop().call_later(
            5.0,
            lambda: _active_builds.pop(build_id, None),
        )
    return {"status": status}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    import uuid
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file")
    
    stem, ext = os.path.splitext(file.filename)
    stem = os.path.basename(stem)  # strip any path components from the client filename
    ext = ext.lower().lstrip(".")
    # Structure formats (pdb/xyz/gro/cif/mmcif/mcif/poscar/contcar/pqr/json/jsonl)
    # are read by ap.import_auto(); mol/mol2/sdf are routed to the organic/GAFF path.
    allowed_exts = {
        "pdb", "xyz", "gro", "cif", "mmcif", "mcif", "poscar", "contcar", "pqr",
        "mol", "mol2", "sdf", "json", "jsonl",
    }
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported extension '.{ext}'")

    session_id = "default_session" # Simplified for FastAPI migration
    filename = f"{stem}_{uuid.uuid4().hex[:12]}.{ext}"
    upload_dir = os.path.join(UPLOADS_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())

    return {
        "status": "success",
        "filename": filename,
        "originalName": file.filename,
        "path": f"uploads/{session_id}/{filename}",
    }

@router.post("/organic/parametrize")
async def organic_parametrize(request: Request):
    """
    Preview & Validate endpoint for the Organic Molecule node.
    Routes directly to the OpenFF worker without a full build run.
    Returns { job_id, n_atoms, box } on success.
    """
    import requests as req_lib
    body = await request.json()
    smiles        = body.get("smiles", "")
    version       = body.get("forcefield", "gaff-2.11")
    input_mode    = body.get("inputMode", "smiles")
    upload_path   = body.get("uploadedFilePath", "")
    library_mol   = body.get("libraryMolecule", "")  # e.g. "amino_acids/L-alanine.cjson"

    worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
    v = version.lower()

    try:
        if (input_mode == "library" or library_mol) and library_mol:
            # Load the bundled cjson molecule and write an SDF (with bond orders)
            # so antechamber/acpype can perceive atom types, then route through
            # the same file-based GAFF worker endpoint as an uploaded structure.
            import atomipy as ap
            import tempfile as _tf
            atoms_lib, _cell = ap.load_molecule(library_mol)
            sdf_dir = _tf.mkdtemp(prefix="lib_mol_")
            base = os.path.splitext(os.path.basename(library_mol))[0]
            sdf_path = os.path.join(sdf_dir, f"{base}.sdf")
            ap.write_sdf(atoms_lib, sdf_path)
            with open(sdf_path, "rb") as fh:
                resp = req_lib.post(
                    f"{worker_url}/parametrize/gaff-file",
                    files={"file": (os.path.basename(sdf_path), fh)},
                    params={"version": version, "charge_method": "bcc"},
                    timeout=180,
                )
        elif input_mode == "file" and upload_path:
            # upload_path is relative to work_dir: "uploads/session/filename.ext"
            full_path = _safe_join(OUTPUTS_DIR, upload_path)
            if not os.path.exists(full_path):
                raise HTTPException(status_code=404,
                                    detail=f"Uploaded file not found: {upload_path}")
            with open(full_path, "rb") as fh:
                resp = req_lib.post(
                    f"{worker_url}/parametrize/gaff-file",
                    files={"file": (os.path.basename(full_path), fh)},
                    params={"version": version, "charge_method": "bcc"},
                    timeout=180,
                )
        elif "sage" in v or "openff" in v:
            resp = req_lib.post(f"{worker_url}/parametrize/sage",
                                params={"smiles": smiles}, timeout=120)
        elif "opls" in v:
            resp = req_lib.post(f"{worker_url}/parametrize/oplsaa",
                                params={"smiles": smiles}, timeout=120)
        else:
            resp = req_lib.post(
                f"{worker_url}/parametrize/gaff",
                params={"smiles": smiles, "version": version, "charge_method": "bcc"},
                timeout=180,
            )

        if not resp.ok:
            detail = resp.json().get("detail", resp.text) if resp.content else resp.reason
            raise HTTPException(status_code=resp.status_code, detail=detail)

        paths = resp.json()

        import atomipy as ap
        # The worker is a separate Cloud Run service (no shared filesystem), so it
        # returns file contents; materialize the .top (+ .itp, preserving its
        # basename so the #include resolves) into a temp dir before importing.
        top_content = paths.get("top_content")
        if top_content is not None:
            import tempfile as _tf
            tmp_dir = _tf.mkdtemp(prefix="ff_preview_")
            top_local = os.path.join(tmp_dir, os.path.basename(paths.get("top") or "organic_GMX.top"))
            with open(top_local, "w", encoding="utf-8") as fh:
                fh.write(top_content)
            itp_content = paths.get("itp_content")
            if itp_content is not None and paths.get("itp"):
                with open(os.path.join(tmp_dir, os.path.basename(paths["itp"])), "w", encoding="utf-8") as fh:
                    fh.write(itp_content)
            atoms, itp = ap.import_gaff_top(top_local)
        else:
            atoms, itp = ap.import_gaff_top(paths["top"])
        n_atoms = len(atoms)
        return {
            "job_id":  f"preview_{n_atoms}atoms",
            "n_atoms": n_atoms,
            "box":     paths.get("box"),
            "note":    paths.get("note", ""),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


_GROMACS_CACHE = {"done": False, "info": None}


def _detect_gromacs():
    """Cached local-GROMACS detection (path + version), or None if absent.

    Local engine only: on Cloud Run (K_SERVICE set) there is no gmx, so report
    unavailable without probing.
    """
    if _GROMACS_CACHE["done"]:
        return _GROMACS_CACHE["info"]
    info = None
    if not os.environ.get("K_SERVICE"):
        try:
            from atomipy.gromacs import detect_gmx
            info = detect_gmx()
        except Exception:
            info = None
    _GROMACS_CACHE["done"] = True
    _GROMACS_CACHE["info"] = info
    return info


@router.get("/presets")
async def list_presets():
    import atomipy as ap
    ap_data_dir = os.path.dirname(ap.__file__)
    potential_dirs = [
        os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
        os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
    ]
    uc_conf_dir = next((path for path in potential_dirs if os.path.exists(path)), None)
    
    presets = []
    if uc_conf_dir:
        # Structure files at the top level AND one level of subfolders (e.g.
        # 'zeolites/'). A subfolder entry's fileName carries its relative path so
        # the loader reads UC_conf/<fileName> (e.g. UC_conf/zeolites/FAU_...pdb).
        _entries = []  # (relpath_from_UC_conf, base_filename, full_path, group_or_None)
        for fname in sorted(os.listdir(uc_conf_dir)):
            full = os.path.join(uc_conf_dir, fname)
            if os.path.isfile(full) and fname.endswith((".pdb", ".gro", ".cif")):
                _entries.append((fname, fname, full, None))
            elif os.path.isdir(full):
                for sub in sorted(os.listdir(full)):
                    if sub.endswith((".pdb", ".gro", ".cif")):
                        _entries.append((f"{fname}/{sub}", sub, os.path.join(full, sub), fname))

        for relpath, base, filepath, group in _entries:
            name = base.split(".")[0]
            if "_GII_" in name:
                name = name.split("_GII_")[0]
            display_name = name.replace("_", " ").strip()
            if group:
                display_name = f"{display_name} ({group.rstrip('s')})"  # e.g. "FAU (zeolite)"

            a, b, c, alpha, beta, gamma = None, None, None, None, None, None
            if filepath.endswith(".pdb"):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("CRYST1"):
                                a = float(line[6:15])
                                b = float(line[15:24])
                                c = float(line[24:33])
                                alpha = float(line[33:40])
                                beta = float(line[40:47])
                                gamma = float(line[47:54])
                                break
                except Exception:
                    pass

            presets.append({
                "id": relpath,
                "name": display_name,
                "fileName": relpath,
                "metrics": {
                    "a": a, "b": b, "c": c,
                    "alpha": alpha, "beta": beta, "gamma": gamma
                }
            })
                
    _mode = simulation_mode()
    # Sort alphabetically, but push subfolder groups (e.g. zeolites) to the end
    # of the dropdown — a preset whose fileName carries a '/' lives in a subfolder.
    return {
        "presets": sorted(presets, key=lambda x: ("/" in x["fileName"], x["name"])),
        "disableSimulation": _mode == "disabled",   # legacy flag
        "simulationMode": _mode,                     # 'full' | 'em_only' | 'disabled'
        # True only on Cloud Run (which injects K_SERVICE) — i.e. the
        # scale-to-zero online site, NOT Colab or local. Used to show a
        # one-time cold-start notice.
        "coldStart": bool(os.environ.get("K_SERVICE")),
        # Local GROMACS engine availability (None unless a local gmx is found).
        "gromacs": _detect_gromacs(),
    }


@router.post("/inorganic/scan")
async def inorganic_scan(request: Request):
    """Scan an inorganic structure (preset or upload) for MINFF compatibility.

    Loads the structure, collects its elements, and flags any that have no MINFF
    framework type (the same set the dummy-mineral path uses). When unsupported
    elements are present, the UI steers the user to the 'Dummy FF'
    forcefield.
    """
    import atomipy as ap
    from atomipy.oxidation import _norm_element

    body = await request.json()
    source = body.get("source", "preset")
    file_name = body.get("fileName", "")
    upload_path = body.get("uploadedFilePath", "")

    # Resolve the structure path.
    if source == "upload" and upload_path:
        path = _safe_join(OUTPUTS_DIR, upload_path)
    elif source == "crystal":
        crystals = os.path.join(os.path.dirname(ap.__file__), "structures", "crystals")
        path = _safe_join(crystals, file_name)
    else:
        uc_conf = os.path.join(os.path.dirname(ap.__file__), "structures", "minerals", "UC_conf")
        path = _safe_join(uc_conf, file_name)
    if not file_name and not upload_path:
        raise HTTPException(status_code=400, detail="No structure selected to scan.")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Structure not found: {file_name or upload_path}")

    try:
        atoms, _ = ap.import_auto(path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read structure: {exc}")

    supported = set(ap.MINFF_FRAMEWORK_ELEMENTS)
    elements = sorted({_norm_element(a) for a in atoms if _norm_element(a)})
    unsupported = [e for e in elements if e not in supported]
    return {
        "nAtoms": len(atoms),
        "elements": elements,
        "unsupported": unsupported,
        "minffCompatible": len(unsupported) == 0,
    }


@router.get("/molecules")
async def list_molecules():
    """Bundled organic molecule library (Chemical JSON), grouped by category.

    Returns the manifest of ~428 GAFF/OpenFF-parameterizable small molecules
    (amino acids, nucleobases, sugars, alcohols, fatty acids, etc.) vendored
    from the Avogadro2 molecules library. Each entry's ``file`` is the
    category-relative path passed to ``ap.load_molecule``.
    """
    try:
        import atomipy as ap
        cats = ap.molecule_categories()
        return {
            "categories": [
                {"name": c, "molecules": ap.list_molecules(c)} for c in cats
            ],
            "count": len(ap.list_molecules()),
            "attribution": "Avogadro2 molecules library (BSD-3-Clause, "
                           "(c) 2016 Geoffrey Hutchison, University of Pittsburgh)",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"molecule library unavailable: {exc}")


@router.get("/inorganic-library")
async def inorganic_library():
    """Inorganic material library, grouped by category.

    The first category, 'MINFF presets', is atomipy's curated, force-field-ready
    UC_conf set (loaded via UC_conf/<file>). The remaining categories are the
    bundled crystal library (~517 CIFs: oxides, halides, sulfides, elements,
    zeolites, …) — many need the Dummy FF. Each material carries a ``source``
    ('preset' or 'crystal') telling the build how to load it.
    """
    import atomipy as ap

    categories = []

    # 1) MINFF presets (curated UC_conf) — force-field-ready, on top.
    try:
        presets_resp = await list_presets()
        preset_mats = [
            {"name": p["name"], "file": p["fileName"], "source": "preset"}
            for p in presets_resp.get("presets", [])
        ]
        if preset_mats:
            categories.append({"name": "MINFF presets", "source": "preset", "materials": preset_mats})
    except Exception:
        pass

    # 1b) Water presets (force-field-ready solvent boxes). Loaded from the package
    #     structures/water dir; atom names OW/HW1/HW2 (+ MW for TIP4P, LP1/LP2 for
    #     TIP5P) and resname SOL, so the topology writer uses the water model .itp.
    try:
        water_dir = os.path.join(os.path.dirname(ap.__file__), "structures", "water")
        # (file, display name) — variants evident: count · model · arrangement.
        _water = [
            ("1xspce.pdb",            "1 × SPC/E — single molecule"),
            ("96spc_hex_ice_h.pdb",   "96 × SPC — hexagonal ice"),
            ("96tip4p_hex_ice_h.pdb", "96 × TIP4P — hexagonal ice"),
            ("spc216.gro",            "216 × SPC — equilibrated"),
            ("864_spce.pdb",          "864 × SPC/E — equilibrated"),
            ("864_spce_grid.pdb",     "864 × SPC/E — grid"),
            ("864_tip3p.pdb",         "864 × TIP3P — equilibrated"),
            ("864_tip4p.pdb",         "864 × TIP4P — equilibrated"),
            ("864_tip5p.pdb",         "864 × TIP5P — equilibrated"),
        ]
        water_mats = [
            {"name": nm, "file": fn, "source": "water"}
            for fn, nm in _water if os.path.isfile(os.path.join(water_dir, fn))
        ]
        if water_mats:
            categories.append({"name": "Water", "source": "water", "materials": water_mats})
    except Exception:
        pass

    # 2) Bundled crystal library (Avogadro), one entry per category.
    try:
        for c in ap.crystal_categories():
            mats = [
                {
                    "name": e["name"], "file": e["file"], "source": "crystal",
                    "formula": e.get("formula", ""), "mineral": e.get("mineral", ""),
                    "elements": e.get("elements", []),
                }
                for e in ap.list_crystals(c)
            ]
            if mats:
                categories.append({"name": c, "source": "crystal", "materials": mats})
    except Exception as exc:
        if not categories:
            raise HTTPException(status_code=500, detail=f"crystal library unavailable: {exc}")

    return {
        "categories": categories,
        "count": sum(len(c["materials"]) for c in categories),
        "attribution": "Avogadro2 crystals library (public domain; IZA zeolites + "
                       "Crystallography Open Database)",
    }
