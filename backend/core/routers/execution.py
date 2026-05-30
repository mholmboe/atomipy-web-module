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
import zipfile
import threading
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
os.makedirs(PRESETS_DIR, exist_ok=True)

import ctypes

# ---------------------------------------------------------------------------
# Active-build registry — maps build_id → thread for stop/abort support
# ---------------------------------------------------------------------------
_active_builds: dict[str, threading.Thread] = {}
_active_builds_lock = threading.Lock()


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

    # On the public/online instance simulations are disabled (no GPU, build-only).
    # MD/EM must be run locally or on Google Colab. The frontend already hides the
    # run controls via the `disableSimulation` flag from /api/presets; this is the
    # server-side enforcement.
    disable_sim = os.environ.get("DISABLE_SIMULATION", "false").lower() == "true"
    if disable_sim and "load_minff_into_openmm" in script_code:
        raise HTTPException(
            status_code=403,
            detail="Simulation execution is disabled on this server instance. "
                   "Run locally or in Google Colab to execute simulations.",
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
            print(f"DEBUG: potential_dirs={[ (p, os.path.exists(p)) for p in potential_dirs ]}", flush=True)
            uc_conf_dir = next((path for path in potential_dirs if os.path.exists(path)), None)
            print(f"DEBUG: selected uc_conf_dir={uc_conf_dir}", flush=True)
            if uc_conf_dir:
                try:
                    print(f"DEBUG: files inside uc_conf_dir={os.listdir(uc_conf_dir)}", flush=True)
                except Exception as e:
                    print(f"DEBUG: listdir failed: {e}", flush=True)
            if uc_conf_dir:
                try:
                    os.symlink(uc_conf_dir, os.path.join(work_dir, "UC_conf"))
                    print(f"DEBUG: successfully created symlink at {os.path.join(work_dir, 'UC_conf')}", flush=True)
                except Exception as e:
                    print(f"DEBUG: symlink creation failed: {e}", flush=True)

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

            def run_build_in_process():
                old_cwd = os.getcwd()
                log_file_path = os.path.join(work_dir, "execution.log")
                log_file = open(log_file_path, "w", encoding="utf-8")

                _PROTOCOL_PREFIXES = (
                    "__VISUALIZE_", "__BOX_", "__CHARGES_",
                    "__XRD_DATA_", "__PLOT_", "__NODE_START__",
                )
                _verbose_log = request.verbose_log

                class QueueWriter:
                    def __init__(self, q, f):
                        self.q = q
                        self.f = f
                    def write(self, s: str) -> int:
                        if s:
                            self.q.put(s)
                            if _verbose_log or not any(p in s for p in _PROTOCOL_PREFIXES):
                                self.f.write(s)
                                self.f.flush()
                        return len(s)
                    def flush(self):
                        self.f.flush()

                writer = QueueWriter(log_queue, log_file)
                try:
                    os.chdir(work_dir)
                    gc.collect()
                    with contextlib.redirect_stdout(writer), contextlib.redirect_stderr(writer):
                        def ap_plot(node_id, x, y, title="", xlabel="", ylabel=""):
                            data = {
                                "x": x.tolist() if hasattr(x, 'tolist') else list(x),
                                "y": y.tolist() if hasattr(y, 'tolist') else list(y),
                                "title": title,
                                "xlabel": xlabel,
                                "ylabel": ylabel
                            }
                            print(f"__PLOT_{node_id}__:{json.dumps(data)}")

                        import requests as _requests
                        import shutil as _shutil

                        class SystemList(list):
                            def __init__(self, atoms, itp=None, box=None):
                                super().__init__(atoms)
                                self.itp = itp
                                self.box = box

                        def wrap_atomipy_function(func_name):
                            orig_func = getattr(ap, func_name, None)
                            if orig_func is None:
                                return
                            
                            def wrapped(*args, **kwargs):
                                system_list = None
                                new_args = list(args)
                                for i, arg in enumerate(args):
                                    if isinstance(arg, SystemList):
                                        system_list = arg
                                        new_args[i] = list(arg)
                                        break
                                new_kwargs = dict(kwargs)
                                for k, v in kwargs.items():
                                    if isinstance(v, SystemList):
                                        system_list = v
                                        new_kwargs[k] = list(v)
                                
                                res = orig_func(*new_args, **new_kwargs)
                                if system_list is not None:
                                    itp = system_list.itp
                                    box = system_list.box
                                    if isinstance(res, tuple):
                                        res_atoms = res[0]
                                        res_box = res[1] if len(res) > 1 else box
                                        wrapped_atoms = SystemList(res_atoms, itp=itp, box=res_box)
                                        return (wrapped_atoms,) + res[1:]
                                    elif isinstance(res, list):
                                        return SystemList(res, itp=itp, box=box)
                                return res
                            setattr(ap, func_name, wrapped)

                        for func_name in [
                            'solvate', 'ionize', 'translate', 'rotate', 'scale', 'bend', 'center',
                            'slice', 'remove', 'fuse_atoms', 'assign_resname', 'molecule', 'wrap',
                            'replicate_system', 'update'
                        ]:
                            wrap_atomipy_function(func_name)

                        def _materialize_ff_files(paths):
                            """Write worker-returned FF files into the build dir.

                            The OpenFF worker is a separate Cloud Run service with no
                            shared filesystem, so it returns file *contents*; write them
                            locally, preserving basenames so the .top's #include of the
                            .itp resolves. Falls back to copying local paths when the
                            worker shares /tmp (local dev). Returns local {top,gro,itp}."""
                            local = {}
                            for key in ("top", "gro", "itp"):
                                src = paths.get(key)
                                content = paths.get(f"{key}_content")
                                base = os.path.basename(src) if src else f"organic_GMX.{key}"
                                dest = os.path.join(os.getcwd(), base)
                                if content is not None:
                                    with open(dest, "w", encoding="utf-8") as fh:
                                        fh.write(content)
                                    local[key] = dest
                                elif src and os.path.exists(src):
                                    try:
                                        _shutil.copy(src, dest)
                                        local[key] = dest
                                    except Exception:
                                        local[key] = src
                            return local

                        def parametrize_organic_gaff(smiles, version='gaff-2.11', charge_method='bcc'):
                            """
                            Parametrize an organic molecule via ACPYPE on the OpenFF worker.
                            Returns (SystemList, box_vectors).
                            """
                            worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
                            v = version.lower()
                            if 'sage' in v or 'openff' in v:
                                resp = _requests.post(
                                    f"{worker_url}/parametrize/sage",
                                    params={"smiles": smiles},
                                    timeout=120,
                                )
                            elif 'opls' in v:
                                resp = _requests.post(
                                    f"{worker_url}/parametrize/oplsaa",
                                    params={"smiles": smiles},
                                    timeout=120,
                                )
                            else:
                                resp = _requests.post(
                                    f"{worker_url}/parametrize/gaff",
                                    params={"smiles": smiles, "version": version, "charge_method": charge_method},
                                    timeout=180,
                                )
                            resp.raise_for_status()
                            paths = resp.json()

                            local = _materialize_ff_files(paths)
                            atoms, itp = ap.import_gaff_top(local.get("top") or paths.get("top"))
                            ap.import_gro_coords(local.get("gro") or paths.get("gro"), atoms)
                            box = paths.get("box", [50.0, 50.0, 50.0])
                            return SystemList(atoms, itp=itp, box=box), box

                        def parametrize_organic_file(filepath, version='gaff-2.11', charge_method='bcc'):
                            """
                            Parametrize an uploaded structure file via the OpenFF worker.
                            Returns (SystemList, box_vectors).
                            """
                            worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
                            with open(filepath, 'rb') as fh:
                                resp = _requests.post(
                                    f"{worker_url}/parametrize/gaff-file",
                                    files={"file": (os.path.basename(filepath), fh)},
                                    params={"version": version, "charge_method": charge_method},
                                    timeout=180,
                                )
                            resp.raise_for_status()
                            paths = resp.json()

                            local = _materialize_ff_files(paths)
                            atoms, itp = ap.import_gaff_top(local.get("top") or paths.get("top"))
                            ap.import_gro_coords(local.get("gro") or paths.get("gro"), atoms)
                            box = paths.get("box", [50.0, 50.0, 50.0])
                            return SystemList(atoms, itp=itp, box=box), box

                        def mix_systems(*components, box=None):
                            """
                            N-way topology merge for mixed mineral + organic systems.
                            Each component may be:
                              - A SystemList (organic/mixed)
                              - A plain atomipy atoms list (mineral, solvent, etc.)
                            Returns a SystemList.
                            """
                            comp_dicts = []
                            for c in components:
                                if isinstance(c, SystemList):
                                    comp_dicts.append({'atoms': list(c), 'itp': c.itp, 'box': c.box})
                                elif isinstance(c, dict) and 'atoms' in c:
                                    comp_dicts.append(c)
                                elif isinstance(c, list):
                                    # Use explicit None check — `box or [...]` fails when box is a numpy array
                                    b = box if box is not None else [50.0, 50.0, 50.0]
                                    comp_dicts.append({'atoms': c, 'itp': None, 'box': b})
                                else:
                                    raise TypeError(f"mix_systems: unrecognized component type {type(c)}")
                            # Normalise box to plain list so merge_top never receives a numpy array
                            import numpy as _np
                            _out_box = box.tolist() if isinstance(box, _np.ndarray) else box
                            atoms_merged, itp_merged, box_merged = ap.merge_top(*comp_dicts, output_box=_out_box)
                            
                            # Merge _source_itp references to preserve all organic itps
                            merged_itp = dict(itp_merged)
                            source_idx = 1
                            
                            def _collect_sources(itp_dict):
                                nonlocal source_idx
                                if not itp_dict: return
                                
                                # Check top-level
                                if itp_dict.get('_source_itp'):
                                    merged_itp[f'_source_itp_{source_idx}'] = itp_dict['_source_itp']
                                    source_idx += 1
                                    
                                # Collect any already-merged _source_itp_N keys
                                for k, v in itp_dict.items():
                                    if k.startswith('_source_itp_'):
                                        merged_itp[f'_source_itp_{source_idx}'] = v
                                        source_idx += 1
                                        
                                # Recurse into original itps
                                if itp_dict.get('_original_itps'):
                                    for orig in itp_dict['_original_itps']:
                                        _collect_sources(orig)

                            for c in comp_dicts:
                                _collect_sources(c.get('itp'))
                               
                            return SystemList(atoms_merged, itp=merged_itp, box=box_merged)

                        setattr(ap, 'parametrize_organic_gaff', parametrize_organic_gaff)
                        setattr(ap, 'parametrize_organic_file', parametrize_organic_file)
                        setattr(ap, 'mix_systems', mix_systems)



                        exec_globals = {
                            "__name__": "__main__",
                            "ap": ap,
                            "os": os,
                            "sys": sys,
                            "json": json,
                            "ap_plot": ap_plot,
                        }
                        exec(script_code, exec_globals)

                    log_queue.put("__FINISH__:0")
                except Exception as e:
                    script_lines = [f"{i+1:03d}: {line}" for i, line in enumerate(script_code.splitlines())]
                    err_msg = "\nGENERATED SCRIPT:\n" + "\n".join(script_lines) + "\n"
                    err_msg += f"\nFATAL BUILD ERROR: {str(e)}\n{traceback.format_exc()}\n"
                    writer.write(err_msg)
                    # Also write a separate error.log for convenient reading!
                    with open(os.path.join(work_dir, "error.log"), "w", encoding="utf-8") as err_f:
                        err_f.write(err_msg)
                    log_queue.put("__FINISH__:1")
                finally:
                    log_file.close()
                    os.chdir(old_cwd)
                    gc.collect()

            thread = threading.Thread(target=run_build_in_process, daemon=True)
            with _active_builds_lock:
                _active_builds[build_id] = thread
            thread.start()

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
    """Abort a running build.  Sends SystemExit to the worker thread so that
    both pure-Python code and OpenMM simulations (at next reporter callback)
    are interrupted.  The client should also abort its SSE stream reader."""
    with _active_builds_lock:
        thread = _active_builds.get(build_id)

    if thread is None:
        return {"status": "not_found"}
    if not thread.is_alive():
        with _active_builds_lock:
            _active_builds.pop(build_id, None)
        return {"status": "already_done"}

    status = _kill_thread(thread)
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
    ext = ext.lower().lstrip(".")
    allowed_exts = {"pdb", "xyz", "gro", "cif", "mol", "mol2", "sdf", "json", "jsonl"}
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

    worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
    v = version.lower()

    try:
        if input_mode == "file" and upload_path:
            # upload_path is relative to work_dir: "uploads/session/filename.ext"
            full_path = os.path.join(OUTPUTS_DIR, upload_path)
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
        for fname in os.listdir(uc_conf_dir):
            if fname.endswith((".pdb", ".gro", ".cif")):
                name = fname.split(".")[0]
                if "_GII_" in name:
                    name = name.split("_GII_")[0]
                display_name = name.replace("_", " ").strip()
                
                a, b, c, alpha, beta, gamma = None, None, None, None, None, None
                filepath = os.path.join(uc_conf_dir, fname)
                if fname.endswith(".pdb"):
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
                    "id": fname,
                    "name": display_name,
                    "fileName": fname,
                    "metrics": {
                        "a": a, "b": b, "c": c,
                        "alpha": alpha, "beta": beta, "gamma": gamma
                    }
                })
                
    disable_sim = os.environ.get("DISABLE_SIMULATION", "false").lower() == "true"
    return {
        "presets": sorted(presets, key=lambda x: x["name"]),
        "disableSimulation": disable_sim
    }
