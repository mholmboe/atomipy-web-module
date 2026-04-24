import io
import json
import os
import sys
import tempfile
import traceback
import zipfile
from uuid import uuid4
from typing import Any

from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename

import threading
import gc
import contextlib
import queue

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Global lock to ensure only one memory-intensive build runs at a time
BUILD_LOCK = threading.Lock()

# Lazy loader for atomipy to reduce initial memory footprint
_ap = None
def get_ap():
    global _ap
    if _ap is None:
        import atomipy
        _ap = atomipy
    return _ap

app = Flask(__name__, static_folder="dist", static_url_path="")
CORS(app) # Enable CORS for local development
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024 * 1024  # 128 MB

# Persistent directory for build results cache (moved from RAM to disk for Render stability)
CACHE_DIR = os.path.join(tempfile.gettempdir(), "atomipy_results_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Serve the frontend
@app.route("/")
def serve_index():
    return send_file(os.path.join(app.static_folder, "index.html"))

@app.errorhandler(404)
def not_found(e):
    # This ensures that React Router works by redirecting 404s to index.html
    return send_file(os.path.join(app.static_folder, "index.html"))

ALLOWED_EXTENSIONS = {"pdb", "gro", "xyz", "cif", "mmcif", "mcif", "pqr", "poscar", "contcar", "sdf"}

# These will be initialized lazily to avoid importing atomipy at the top level
_preset_slabs = None
def get_preset_slabs():
    global _preset_slabs
    if _preset_slabs is None:
        ap = get_ap()
        data_dir = os.path.dirname(ap.__file__)
        _preset_slabs = {
            "montmorillonite": os.path.join(data_dir, "structures/minerals/3WNaMMT.pdb"),
            "pyrophyllite": os.path.join(data_dir, "structures/minerals/Pyrophyllite.pdb"),
            "kaolinite": os.path.join(data_dir, "structures/minerals/UC_conf/Kaolinite_GII_0.0487.pdb"),
            "muscovite": os.path.join(data_dir, "structures/minerals/UC_conf/Muscovite_Rothbauer_GII_0.142.pdb"),
            "talc": os.path.join(data_dir, "structures/minerals/UC_conf/Talc_GII_0.0748.pdb"),
            "brucite": os.path.join(data_dir, "structures/minerals/UC_conf/Brucite_GII_0.0027.pdb"),
        }
    return _preset_slabs


def _safe_filename(value, fallback):
    text = str(value).strip() if value is not None else fallback
    if not text:
        text = fallback
    return secure_filename(text) or fallback


def _parse_payload() -> dict[str, Any]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        return payload if isinstance(payload, dict) else {}
    raw = request.form.get("request", "")
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Field 'request' must be a JSON object.")
    return payload

def _extract_script_artifacts(payload: dict[str, Any]) -> dict[str, str]:
    raw_artifacts = payload.get("artifacts", {})
    if not isinstance(raw_artifacts, dict):
        return {}

    artifacts: dict[str, str] = {}
    for filename, content in raw_artifacts.items():
        if not isinstance(filename, str) or not isinstance(content, str):
            continue

        safe_name = _safe_filename(filename, "artifact.txt")
        if safe_name in {"build_script.py", "workflow.json"}:
            continue

        artifacts[safe_name] = content

    return artifacts


def _as_box_dim(box_like):
    if box_like is None or (hasattr(box_like, "__len__") and len(box_like) == 0):
        # Default fallback as requested by user
        return get_ap().Cell2Box_dim([50.0, 50.0, 50.0, 90.0, 90.0, 90.0])
    
    vals = [float(v) for v in box_like]
    if len(vals) in (3, 9):
        return vals
    if len(vals) == 6:
        return get_ap().Cell2Box_dim(vals)
    raise ValueError(f"Unsupported box/cell format. Expected 3, 6, or 9 numbers, got {len(vals)}.")


def _import_structure(file_path):
    atoms, box_or_cell = get_ap().import_auto(file_path)
    box_dim = _as_box_dim(box_or_cell)
    return atoms, box_dim


def _normalize_limits(limits, box_dim):
    if limits is None:
        return [0.0, 0.0, 0.0, float(box_dim[0]), float(box_dim[1]), float(box_dim[2])]
    vals = [float(v) for v in limits]
    if len(vals) == 3:
        return [0.0, 0.0, 0.0, vals[0], vals[1], vals[2]]
    if len(vals) == 6:
        return vals
    raise ValueError("Region limits must have 3 or 6 numbers.")


def _safe_resname(name, idx):
    cleaned = "".join(ch for ch in str(name).upper() if ch.isalnum())
    if not cleaned:
        cleaned = f"S{idx + 1}"
    return cleaned[:3]


def _save_uploaded_file(upload_field, idx, work_dir):
    if not isinstance(upload_field, str) or not upload_field:
        raise ValueError(f"Missing upload field reference for slab index {idx}.")
    if upload_field not in request.files:
        raise ValueError(f"Missing uploaded file for field '{upload_field}'.")
    file_obj = request.files[upload_field]
    filename = _safe_filename(file_obj.filename, f"slab_{idx}.pdb")
    if "." not in filename:
        raise ValueError(f"Uploaded file '{filename}' has no extension.")
    ext = filename.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported uploaded extension '.{ext}'.")
    dst = os.path.join(work_dir, f"input_{idx}_{filename}")
    file_obj.save(dst)
    return dst


def _json_compatible(value):
    if isinstance(value, dict):
        return {str(k): _json_compatible(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_compatible(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "tolist"):
        return _json_compatible(value.tolist())
    if hasattr(value, "item"):
        return _json_compatible(value.item())
    return str(value)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    
    original_name = secure_filename(file.filename)
    if "." not in original_name:
        return jsonify({"error": "Uploaded file must include an extension."}), 400

    stem, ext = os.path.splitext(original_name)
    ext = ext.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported extension '.{ext}'"}), 400

    filename = f"{stem}_{uuid4().hex[:12]}.{ext}"
    upload_dir = os.path.join(BASE_DIR, "uploads")
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    
    file_path = os.path.join(upload_dir, filename)
    file.save(file_path)
    
    return jsonify({
        "status": "success",
        "filename": filename,
        "originalName": original_name,
        "path": file_path
    })



@app.route("/api/presets", methods=["GET"])
def list_presets():
    ap = get_ap()
    ap_data_dir = os.path.dirname(ap.__file__)
    potential_dirs = [
        os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
        os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
    ]
    
    uc_conf_dir = None
    for d in potential_dirs:
        if os.path.exists(d):
            uc_conf_dir = d
            print(f"Found preset structures in: {uc_conf_dir}")
            break
    else:
        print(f"FAILED to find preset structures. Checked: {potential_dirs}")
            
    presets = []
    if uc_conf_dir and os.path.exists(uc_conf_dir):
        for fname in os.listdir(uc_conf_dir):
            if fname.endswith(".pdb") or fname.endswith(".gro") or fname.endswith(".cif"):
                # Sanitize the name for display
                # Strip extensions and truncate starting from _GII_
                name = fname.split(".")[0]
                if "_GII_" in name:
                    name = name.split("_GII_")[0]
                
                # Replace underscores with spaces for a cleaner look
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
    return jsonify({"presets": sorted(presets, key=lambda x: x["name"])})


@app.route("/build_system", methods=["POST"])
def build_system():
    try:
        payload = _parse_payload()
        slabs = payload.get("slabs", [])
        if not slabs:
            return jsonify({"error": "No slabs provided."}), 400

        box_cfg = payload.get("box", {})
        lx = float(box_cfg.get("lx", 30.0))
        ly = float(box_cfg.get("ly", 30.0))
        lz = float(box_cfg.get("lz", 80.0))
        alpha = float(box_cfg.get("alpha", 90.0))
        beta = float(box_cfg.get("beta", 90.0))
        gamma = float(box_cfg.get("gamma", 90.0))
        
        auto_x = bool(box_cfg.get("autoX", False))
        auto_y = bool(box_cfg.get("autoY", False))
        auto_z = bool(box_cfg.get("autoZ", False))
        auto_alpha = bool(box_cfg.get("autoAlpha", False))
        auto_beta = bool(box_cfg.get("autoBeta", False))
        auto_gamma = bool(box_cfg.get("autoGamma", False))
        
        final_box_raw = [lx, ly, lz, alpha, beta, gamma]
        final_box = get_ap().Cell2Box_dim(final_box_raw)

        output_name = _safe_filename(payload.get("outputName"), "atomipy_system")
        output_format = str(payload.get("outputFormat", "gromacs")).lower()

        solvation_cfg = payload.get("solvation", {})
        ions_cfg = payload.get("ions", [])
        postprocess = payload.get("postprocess", {})

        warnings = []
        component_meta = []

        with tempfile.TemporaryDirectory(prefix="atomipy_web_") as work_dir:
            all_atoms = []

            # Build and place slabs
            for idx, slab in enumerate(slabs):
                source = str(slab.get("source", "preset"))
                if source == "uploaded":
                    upload_field = slab.get("uploadField")
                    slab_path = _save_uploaded_file(upload_field, idx, work_dir)
                else:
                    preset_id = slab.get("presetId")
                    if not preset_id:
                        raise ValueError(f"Preset slab at index {idx} has no presetId.")
                    slab_path = os.path.join(BASE_DIR, "UC_conf", str(preset_id))
                    if not os.path.exists(slab_path):
                        rel = get_preset_slabs().get(str(preset_id))
                        if rel:
                            slab_path = rel
                        else:
                            raise ValueError(f"Preset file not found: {preset_id}")

                slab_atoms, slab_box = _import_structure(slab_path)
                rep = slab.get("replicate", {})
                nx = max(1, int(rep.get("x", 1)))
                ny = max(1, int(rep.get("y", 1)))
                nz = max(1, int(rep.get("z", 1)))
                if [nx, ny, nz] != [1, 1, 1]:
                    slab_atoms, slab_box, _ = ap.replicate_system(
                        slab_atoms, slab_box, replicate=[nx, ny, nz]
                    )

                pos = slab.get("position", {})
                mode = pos.get("mode", "absolute")
                target = [
                    float(pos.get("x", 0.0)),
                    float(pos.get("y", 0.0)),
                    float(pos.get("z", idx * 15.0)),
                ]
                
                if mode == "relative":
                    slab_atoms = ap.translate(slab_atoms, target)
                else:
                    slab_atoms = ap.place(slab_atoms, target)
                    
                if idx == 0 and any([auto_x, auto_y, auto_z, auto_alpha, auto_beta, auto_gamma]):
                    slab_cell = ap.Box_dim2Cell(slab_box)
                    if auto_x: final_box_raw[0] = slab_cell[0]
                    if auto_y: final_box_raw[1] = slab_cell[1]
                    if auto_z: final_box_raw[2] = slab_cell[2]
                    if auto_alpha: final_box_raw[3] = slab_cell[3]
                    if auto_beta: final_box_raw[4] = slab_cell[4]
                    if auto_gamma: final_box_raw[5] = slab_cell[5]
                    final_box = get_ap().Cell2Box_dim(final_box_raw)

                resname = _safe_resname(slab.get("name", f"SLAB{idx+1}"), idx)
                for atom in slab_atoms:
                    atom["resname"] = resname

                component_meta.append(
                    {
                        "name": slab.get("name", f"slab_{idx+1}"),
                        "source": source,
                        "n_atoms": len(slab_atoms),
                        "replicate": [nx, ny, nz],
                        "position": target,
                    }
                )

                all_atoms = ap.update(all_atoms, slab_atoms) if all_atoms else ap.update(slab_atoms)

            # Add ions (region defaults to full box)
            for ion in ions_cfg:
                ion_type = str(ion.get("ion", "")).strip()
                count = max(0, int(ion.get("count", 0)))
                if not ion_type or count <= 0:
                    continue
                wrapped_solute = ap.wrap(all_atoms, final_box) if all_atoms else []
                limits = _normalize_limits(ion.get("limits"), final_box)
                min_distance = float(ion.get("minDistance", 3.0))
                placement = str(ion.get("placement", "random"))

                ion_atoms = ap.ionize(
                    ion_type=ion_type,
                    resname="ION",
                    limits=limits,
                    num_ions=count,
                    min_distance=min_distance,
                    solute_atoms=wrapped_solute,
                    placement=placement,
                )
                if ion_atoms:
                    all_atoms = ap.update(all_atoms, ion_atoms) if all_atoms else ap.update(ion_atoms)

            # Solvation (single or multiple regions)
            if bool(solvation_cfg.get("enabled", True)):
                model_raw = str(solvation_cfg.get("waterModel", "spce")).lower()
                solvent_model = {
                    "spc_e": "spce",
                    "spce": "spce",
                    "spc": "spc",
                    "tip3p": "tip3p",
                    "tip4p": "tip4p",
                }.get(model_raw, "spce")
                density_kg_m3 = float(solvation_cfg.get("density", 1.0)) * 1000.0
                regions = solvation_cfg.get("regions") or [
                    {"limits": _normalize_limits(solvation_cfg.get("limits"), final_box)}
                ]
                for region in regions:
                    wrapped_solute = ap.wrap(all_atoms, final_box) if all_atoms else []
                    limits = _normalize_limits(region.get("limits"), final_box)
                    max_solvent = region.get("maxSolvent", solvation_cfg.get("maxSolvent", "max"))
                    min_distance = float(region.get("minDistance", 2.0))
                    solvent_atoms = ap.solvate(
                        limits=limits,
                        density=density_kg_m3,
                        min_distance=min_distance,
                        max_solvent=max_solvent,
                        solute_atoms=wrapped_solute,
                        solvent_type=solvent_model,
                        include_solute=False,
                    )
                    if solvent_atoms:
                        all_atoms = ap.update(all_atoms, solvent_atoms) if all_atoms else ap.update(solvent_atoms)

            # Optional postprocessing
            if bool(postprocess.get("center", False)):
                all_atoms = ap.center(all_atoms, final_box, dim="xyz")
            if bool(postprocess.get("wrap", True)):
                all_atoms = ap.wrap(all_atoms, final_box)
            all_atoms = ap.update(all_atoms, force=True)

            # Write base structure outputs
            out_pdb = os.path.join(work_dir, f"{output_name}.pdb")
            out_gro = os.path.join(work_dir, f"{output_name}.gro")
            out_xyz = os.path.join(work_dir, f"{output_name}.xyz")
            ap.write_pdb(all_atoms, final_box, out_pdb, write_conect=(output_format == "none"))
            ap.write_gro(all_atoms, final_box, out_gro)
            ap.write_xyz(all_atoms, ap.Box_dim2Cell(final_box), out_xyz)

            # Format-specific optional outputs
            if output_format == "namd":
                try:
                    out_psf = os.path.join(work_dir, f"{output_name}.psf")
                    ap.write_psf(all_atoms, final_box, out_psf)
                except Exception as exc:
                    warnings.append(f"PSF generation failed: {exc}")
            elif output_format == "lammps":
                try:
                    out_data = os.path.join(work_dir, f"{output_name}.data")
                    ap.write_lmp(all_atoms, Box=final_box, file_path=out_data)
                except Exception as exc:
                    warnings.append(f"LAMMPS data generation failed: {exc}")
            elif output_format == "gromacs":
                try:
                    out_itp = os.path.join(work_dir, f"{output_name}.itp")
                    ap.write_itp(all_atoms, final_box, out_itp)
                except Exception as exc:
                    import traceback
                    warnings.append(f"ITP generation failed: {exc}\n{traceback.format_exc()}")
            elif output_format == "none":
                pass  # Skip topologies

            summary = {
                "n_atoms": len(all_atoms),
                "box": ap.Box_dim2Cell(final_box),
                "components": component_meta,
                "warnings": warnings,
            }
            summary_path = os.path.join(work_dir, "build_summary.json")
            with open(summary_path, "w", encoding="utf-8") as fh:
                json.dump(_json_compatible(summary), fh, indent=2)

            # Zip all generated outputs
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for fname in sorted(os.listdir(work_dir)):
                    if fname.startswith("input_"):
                        continue
                    path = os.path.join(work_dir, fname)
                    if os.path.isfile(path):
                        zf.write(path, arcname=fname)
            memory_file.seek(0)

            return send_file(
                memory_file,
                mimetype="application/zip",
                as_attachment=True,
                download_name=f"{output_name}_bundle.zip",
            )

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            ),
            500,
        )


# Global cache for build results to support async downloads (now disk-based)
from collections import OrderedDict
BUILD_RESULTS_CACHE = OrderedDict()
MAX_CACHE_SIZE = 5  # Store fewer results on disk to save space

@app.route("/api/download-result/<token>")
def download_result(token):
    res_data = BUILD_RESULTS_CACHE.get(token)
    if not res_data or not os.path.exists(res_data["path"]):
        return jsonify({"error": "Result not found or expired. Please build again."}), 404
    
    return send_file(
        res_data["path"],
        mimetype="application/zip",
        as_attachment=True,
        download_name=res_data["filename"]
    )

@app.route("/api/build-stream", methods=["POST"])
def build_stream():
    try:
        payload = _parse_payload()
        script_code = payload.get("script", "")
        workflow_data = payload.get("workflow")
        script_artifacts = _extract_script_artifacts(payload)
        
        if not script_code:
            return jsonify({"error": "No script provided."}), 400

        # Helper to format SSE data
        class SSE:
            @staticmethod
            def status(msg): return SSE._fmt("status", {"message": msg})
            @staticmethod
            def progress(node_id, index): return SSE._fmt("progress", {"nodeId": node_id, "index": int(index)})
            @staticmethod
            def log(line): return SSE._fmt("log", {"message": line})
            @staticmethod
            def visualize(node_id, data): return SSE._fmt("visualize", {"nodeId": node_id, "data": data})
            @staticmethod
            def complete(token, success): return SSE._fmt("complete", {"token": token, "success": success})
            @staticmethod
            def _fmt(t, d): return f"data: {json.dumps({'type': t, **d})}\n\n"

        def generate():
            with tempfile.TemporaryDirectory(prefix="atomipy_stream_") as work_dir:
                # 1. Setup Environment (Same as execute_script)
                ap = get_ap()
                ap_data_dir = os.path.dirname(ap.__file__)
                potential_dirs = [
                    os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
                    os.path.join(BASE_DIR, "UC_conf"),
                    os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
                ]
                uc_conf_src = next((d for d in potential_dirs if os.path.exists(d)), None)
                if uc_conf_src:
                    os.symlink(uc_conf_src, os.path.join(work_dir, "UC_conf"))
                
                uploads_src = os.path.join(BASE_DIR, "uploads")
                if os.path.exists(uploads_src):
                    os.symlink(uploads_src, os.path.join(work_dir, "uploads"))

                script_path = os.path.join(work_dir, "build_script.py")
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(script_code)

                for artifact_name, artifact_content in script_artifacts.items():
                    artifact_path = os.path.join(work_dir, artifact_name)
                    with open(artifact_path, "w", encoding="utf-8") as f:
                        f.write(artifact_content)
                
                if workflow_data:
                    with open(os.path.join(work_dir, "workflow.json"), "w", encoding="utf-8") as f:
                        json.dump(workflow_data, f, indent=2)

                yield SSE.status('Build initializing (Locked Mode)...')

                # 2. Execute In-Process via Thread (Saves ~150MB RAM over Subprocess)
                log_queue = queue.Queue()
                
                def run_build_in_process():
                    # Acquire lock to ensure we don't double-dip on RAM for large systems
                    with BUILD_LOCK:
                        old_cwd = os.getcwd()
                        # Use a custom writer to bridge stdout to our SSE stream
                        class QueueWriter:
                            def __init__(self, q): self.q = q
                            def write(self, s):
                                if s: self.q.put(s)
                            def flush(self): pass
                        
                        writer = QueueWriter(log_queue)
                        try:
                            os.chdir(work_dir)
                            gc.collect() # Clear memory before starting
                            with contextlib.redirect_stdout(writer), contextlib.redirect_stderr(writer):
                                # Execute the modeling script in the current environment
                                # Passing ap and other modules explicitly
                                exec_globals = {
                                    "__name__": "__main__",
                                    "ap": get_ap(),
                                    "os": os,
                                    "sys": sys,
                                    "json": json,
                                }
                                exec(script_code, exec_globals)
                            
                            log_queue.put("__FINISH__:0")
                        except Exception as e:
                            writer.write(f"\nFATAL BUILD ERROR: {str(e)}\n{traceback.format_exc()}\n")
                            log_queue.put("__FINISH__:1")
                        finally:
                            os.chdir(old_cwd)
                            gc.collect() # Clear memory after finish

                thread = threading.Thread(target=run_build_in_process, daemon=True)
                thread.start()

                log_path = os.path.join(work_dir, "execution_stdout.txt")
                curr_line = ""
                success = False
                
                with open(log_path, "w", encoding="utf-8") as log_f:
                    while True:
                        try:
                            content = log_queue.get(timeout=15)
                            if content.startswith("__FINISH__"):
                                success = content.endswith(":0")
                                break
                            
                            # Log and process characters
                            for char in content:
                                log_f.write(char)
                                if char in ('\n', '\r'):
                                    if curr_line.strip():
                                        if "__NODE_START__:" in curr_line:
                                            try:
                                                parts = curr_line.strip().split(":")
                                                yield SSE.progress(parts[1], parts[2])
                                            except: pass
                                        elif "__VISUALIZE_" in curr_line:
                                            try:
                                                # Format: __VISUALIZE_node_id__:<pdb_data_with_escaped_newlines>
                                                parts = curr_line.strip().split("__:", 1)
                                                node_id = parts[0].replace("__VISUALIZE_", "")
                                                pdb_data = parts[1].replace("\\n", "\n")
                                                yield SSE.visualize(node_id, pdb_data)
                                            except: pass
                                        elif "__CHARGES_" in curr_line:
                                            try:
                                                # Format: __CHARGES_node_id__:[json_array]
                                                parts = curr_line.strip().split("__:", 1)
                                                node_id = parts[0].replace("__CHARGES_", "")
                                                charges_json = parts[1]
                                                yield f"data: {json.dumps({'type': 'charges', 'nodeId': node_id, 'data': json.loads(charges_json)})}\n\n"
                                            except: pass
                                        else:
                                            yield SSE.log(curr_line)
                                    curr_line = ""
                                else:
                                    curr_line += char
                                    
                        except queue.Empty:
                            # 15s pulse to keep Render connection alive
                            yield SSE.log(" ") 
                            continue

                # 3. Package Results to Disk Cache
                token = str(uuid4())
                zip_path = os.path.join(CACHE_DIR, f"result_{token}.zip")
                
                summary = {
                    "success": success,
                    "message": "Build succeeded." if success else "Build failed.",
                }
                
                with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    for fname in os.listdir(work_dir):
                        if fname in {"UC_conf", "uploads"}: continue
                        path = os.path.join(work_dir, fname)
                        if os.path.isfile(path):
                            zf.write(path, arcname=fname)
                    zf.writestr("build_summary.json", json.dumps(summary, indent=2))

                BUILD_RESULTS_CACHE[token] = {
                    "path": zip_path,
                    "filename": "atomipy_system_bundle.zip",
                    "timestamp": time.time()
                }
                
                while len(BUILD_RESULTS_CACHE) > MAX_CACHE_SIZE:
                    old_token, old_data = BUILD_RESULTS_CACHE.popitem(last=False)
                    if os.path.exists(old_data["path"]):
                        try: os.remove(old_data["path"])
                        except: pass

                yield SSE.complete(token, success)
                gc.collect() # Final cleanup

        import time
        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
        )

    except Exception as exc:
        return jsonify({"error": str(exc), "traceback": traceback.format_exc()}), 500


@app.route("/api/execute-script", methods=["POST"])
def execute_script():
    try:
        payload = _parse_payload()
        script_code = payload.get("script", "")
        script_artifacts = _extract_script_artifacts(payload)
        if not script_code:
            return jsonify({"error": "No script provided."}), 400

        with tempfile.TemporaryDirectory(prefix="atomipy_") as work_dir:
            # Create symlink to UC_conf by checking potential locations
            ap = get_ap()
            ap_data_dir = os.path.dirname(ap.__file__)
            potential_dirs = [
                os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
                os.path.join(BASE_DIR, "UC_conf"),
                os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
            ]
            
            uc_conf_src = None
            for d in potential_dirs:
                if os.path.exists(d):
                    uc_conf_src = d
                    break
            
            if uc_conf_src:
                os.symlink(uc_conf_src, os.path.join(work_dir, "UC_conf"))

            uploads_src = os.path.join(BASE_DIR, "uploads")
            uploads_dst = os.path.join(work_dir, "uploads")
            if os.path.exists(uploads_src):
                os.symlink(uploads_src, uploads_dst)

            # Write the script
            script_path = os.path.join(work_dir, "build_script.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(script_code)

            for artifact_name, artifact_content in script_artifacts.items():
                artifact_path = os.path.join(work_dir, artifact_name)
                with open(artifact_path, "w", encoding="utf-8") as f:
                    f.write(artifact_content)
            
            # Save the workflow JSON for re-importing
            workflow_data = payload.get("workflow")
            if workflow_data:
                workflow_path = os.path.join(work_dir, "workflow.json")
                with open(workflow_path, "w", encoding="utf-8") as f:
                    json.dump(workflow_data, f, indent=2)

            import subprocess
            # Execute script in work_dir with the current python environment
            # We add atomipy to PYTHONPATH dynamically or let it rely on the env.
            env = os.environ.copy()
            env["PYTHONPATH"] = BASE_DIR
            
            result = subprocess.run(
                [sys.executable, "build_script.py"],
                cwd=work_dir,
                capture_output=True,
                text=True,
                env=env
            )

            success = result.returncode == 0
            summary = {
                "success": success,
                "exit_code": result.returncode,
                "message": "Build succeeded." if success else "Build failed. See execution logs.",
                "stdout_chars": len(result.stdout or ""),
                "stderr_chars": len(result.stderr or ""),
            }

            # Zip all generated files and execution artifacts (success and failure)
            memory_file = io.BytesIO()
            included_files = []
            with zipfile.ZipFile(memory_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for fname in os.listdir(work_dir):
                    if fname in {"UC_conf", "uploads"}:
                        continue
                    path = os.path.join(work_dir, fname)
                    if os.path.isfile(path):
                        zf.write(path, arcname=fname)
                        included_files.append(fname)
                
                # Write stdout/stderr
                zf.writestr("execution_stdout.txt", result.stdout)
                zf.writestr("execution_stderr.txt", result.stderr)
                if "build_errors.log" not in included_files:
                    zf.writestr("build_errors.log", "")
                summary["included_files"] = sorted(included_files)
                zf.writestr("build_summary.json", json.dumps(summary, indent=2))

            memory_file.seek(0)
            status_code = 200 if success else 400

            response = send_file(
                memory_file,
                mimetype="application/zip",
                as_attachment=True,
                download_name="atomipy_system_bundle.zip",
            )
            return response, status_code

    except Exception as exc:
        return jsonify({"error": str(exc), "traceback": traceback.format_exc()}), 500


import time

def prune_cache_loop():
    """Background thread to delete result files older than 1 hour."""
    while True:
        try:
            now = time.time()
            cutoff = now - 3600 # 1 hour
            if os.path.exists(CACHE_DIR):
                for f in os.listdir(CACHE_DIR):
                    p = os.path.join(CACHE_DIR, f)
                    if os.path.getmtime(p) < cutoff:
                        with contextlib.suppress(Exception):
                            if os.path.isfile(p):
                                os.remove(p)
                            elif os.path.isdir(p):
                                import shutil
                                shutil.rmtree(p)
        except Exception as e:
            print(f"Error in pruning thread: {e}")
        time.sleep(1800) # Run every 30 mins

# Start the pruning thread
threading.Thread(target=prune_cache_loop, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)

# Triggering reload for atomipy core changes
