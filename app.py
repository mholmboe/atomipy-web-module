import io
import json
import os
import sys
import tempfile
import time
import traceback
import zipfile
from collections import OrderedDict
from uuid import uuid4
from typing import Any, Union

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
CACHE_LOCK = threading.Lock()

# Atomipy Web Module Backend
# Build Trigger Refresh: 2026-04-30
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

# Disable browser caching of frontend static assets permanently
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Persistent directory for build results cache (moved from RAM to disk for Render stability)
CACHE_DIR = os.environ.get("ATOMIPY_CACHE_DIR", "/tmp/atomipy_results_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
BUILD_RESULTS_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
MAX_CACHE_SIZE = 50  # Store more results to prevent race conditions

# Serve the frontend
@app.route("/")
def serve_index():
    return send_file(os.path.join(app.static_folder or "dist", "index.html"))

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/") or request.path == "/build_system":
        return jsonify({"error": "Not found"}), 404
    # This ensures that React Router works by redirecting 404s to index.html
    return send_file(os.path.join(app.static_folder or "dist", "index.html"))

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


def _get_or_create_session_id() -> str:
    sid = request.cookies.get("atomipy_session")
    return sid if sid else str(uuid4())


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


def _existing_uc_conf_dir() -> str | None:
    ap = get_ap()
    ap_data_dir = os.path.dirname(ap.__file__)
    potential_dirs = [
        os.path.join(ap_data_dir, "structures", "minerals", "UC_conf"),
        os.path.join(BASE_DIR, "UC_conf"),
        os.path.join(BASE_DIR, "atomipy", "structures", "minerals", "UC_conf"),
    ]
    return next((path for path in potential_dirs if os.path.exists(path)), None)


def _safe_symlink(src: str, dst: str) -> None:
    if os.path.lexists(dst):
        return
    os.symlink(src, dst)


def _prepare_execution_workspace(work_dir: str, session_id: str | None = None) -> None:
    uc_conf_src = _existing_uc_conf_dir()
    if uc_conf_src:
        _safe_symlink(uc_conf_src, os.path.join(work_dir, "UC_conf"))

    if session_id:
        session_uploads = os.path.join(BASE_DIR, "uploads", session_id)
        if os.path.exists(session_uploads):
            _safe_symlink(session_uploads, os.path.join(work_dir, "uploads"))
    else:
        uploads_src = os.path.join(BASE_DIR, "uploads")
        if os.path.exists(uploads_src):
            _safe_symlink(uploads_src, os.path.join(work_dir, "uploads"))


def _write_execution_inputs(
    work_dir: str,
    script_code: str,
    script_artifacts: dict[str, str],
    workflow_data: Any | None = None,
) -> None:
    with open(os.path.join(work_dir, "build_script.py"), "w", encoding="utf-8") as f:
        f.write(script_code)

    for artifact_name, artifact_content in script_artifacts.items():
        with open(os.path.join(work_dir, artifact_name), "w", encoding="utf-8") as f:
            f.write(artifact_content)

    if workflow_data:
        with open(os.path.join(work_dir, "workflow.json"), "w", encoding="utf-8") as f:
            json.dump(workflow_data, f, indent=2)


def _iter_regular_work_dir_files(work_dir: str, excluded_names: set[str] | None = None):
    excluded = excluded_names or set()
    for fname in sorted(os.listdir(work_dir)):
        if fname in excluded:
            continue
        path = os.path.join(work_dir, fname)
        if os.path.isfile(path):
            yield fname, path


def _get_cached_result(token: str) -> dict[str, Any] | None:
    with CACHE_LOCK:
        data = BUILD_RESULTS_CACHE.get(token)
        if data:
            return dict(data)
    
    expected_path = os.path.abspath(os.path.join(CACHE_DIR, f"result_{token}.zip"))
    print(f"DEBUG: Looking for cached result {token} at {expected_path}")
    if os.path.exists(expected_path):
        print(f"DEBUG: Found file on disk for token {token}")
        return {
            "path": expected_path,
            "filename": "atomipy_system_bundle.zip",
            "timestamp": os.path.getmtime(expected_path)
        }
    print(f"DEBUG: Cache miss (memory and disk) for token {token}")
    return None


def _remember_cached_result(token: str, path: str, filename: str, session_id: str | None = None) -> None:
    with CACHE_LOCK:
        BUILD_RESULTS_CACHE[token] = {
            "path": path,
            "filename": filename,
            "timestamp": time.time(),
            "session_id": session_id,
        }

        while len(BUILD_RESULTS_CACHE) > MAX_CACHE_SIZE:
            _, old_data = BUILD_RESULTS_CACHE.popitem(last=False)
            old_path = old_data.get("path")
            if isinstance(old_path, str):
                with contextlib.suppress(Exception):
                    os.remove(old_path)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No selected file"}), 400

    original_name = secure_filename(file.filename)
    if "." not in original_name:
        return jsonify({"error": "Uploaded file must include an extension."}), 400

    stem, ext = os.path.splitext(original_name)
    ext = ext.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported extension '.{ext}'"}), 400

    session_id = _get_or_create_session_id()
    filename = f"{stem}_{uuid4().hex[:12]}.{ext}"
    upload_dir = os.path.join(BASE_DIR, "uploads", session_id)
    os.makedirs(upload_dir, exist_ok=True)

    file.save(os.path.join(upload_dir, filename))

    resp = jsonify({
        "status": "success",
        "filename": filename,
        "originalName": original_name,
        "path": f"uploads/{filename}",
    })
    resp.set_cookie("atomipy_session", session_id, httponly=True, samesite="Strict")
    return resp



@app.route("/api/presets", methods=["GET"])
def list_presets():
    uc_conf_dir = _existing_uc_conf_dir()
    if uc_conf_dir:
        print(f"Found preset structures in: {uc_conf_dir}")
    else:
        print("FAILED to find preset structures.")
            
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
    disable_sim = os.environ.get("DISABLE_SIMULATION", "false").lower() == "true"
    return jsonify({
        "presets": sorted(presets, key=lambda x: x["name"]),
        "disableSimulation": disable_sim
    })



@app.route("/build_system", methods=["POST"])
def build_system():
    try:
        payload = _parse_payload()
        slabs = payload.get("slabs", [])
        if not slabs:
            return jsonify({"error": "No slabs provided."}), 400

        ap = get_ap()
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
        final_box = ap.Cell2Box_dim(final_box_raw)

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
                    preset_id_str = str(preset_id)
                    preset_basename = os.path.basename(preset_id_str)
                    if preset_basename != preset_id_str or ".." in preset_id_str or preset_id_str.startswith("/") or preset_id_str.startswith("\\"):
                        raise ValueError(f"Invalid preset ID (potential path traversal path): {preset_id_str}")
                    slab_path = os.path.join(BASE_DIR, "UC_conf", preset_basename)
                    if not os.path.exists(slab_path):
                        rel = get_preset_slabs().get(preset_basename)
                        if rel:
                            slab_path = rel
                        else:
                            raise ValueError(f"Preset file not found: {preset_basename}")

                slab_atoms, slab_box = _import_structure(slab_path)
                rep = slab.get("replicate", {})
                nx = int(rep.get("x", 1))
                ny = int(rep.get("y", 1))
                nz = int(rep.get("z", 1))
                if nx > 15 or ny > 15 or nz > 15:
                    raise ValueError(f"Replication grid dimensions cannot exceed 15x15x15. Got {nx}x{ny}x{nz}.")
                if nx <= 0 or ny <= 0 or nz <= 0:
                    raise ValueError(f"Replication grid dimensions must be positive integers. Got {nx}x{ny}x{nz}.")
                
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
                    final_box = ap.Cell2Box_dim(final_box_raw)

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
                count = int(ion.get("count", 0))
                if not ion_type or count <= 0:
                    continue
                if count > 10000:
                    raise ValueError(f"Maximum ion count limit of 10000 exceeded. Got {count}.")
                if count < 0:
                    raise ValueError(f"Ion count cannot be negative. Got {count}.")
                
                wrapped_solute = ap.wrap(all_atoms, final_box) if all_atoms else []
                limits = _normalize_limits(ion.get("limits"), final_box)
                min_distance = float(ion.get("minDistance", 3.0))
                if min_distance <= 0:
                    raise ValueError(f"Ion minimum distance must be positive. Got {min_distance}.")
                if min_distance > 20.0:
                    raise ValueError(f"Ion minimum distance is abnormally large: {min_distance}. Must be <= 20.0.")
                
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
                    val_max_solvent = region.get("maxSolvent", solvation_cfg.get("maxSolvent", "max"))
                    max_solvent: Union[str, int] = val_max_solvent if isinstance(val_max_solvent, (int, str)) else "max"
                    val_min_dist = region.get("minDistance", solvation_cfg.get("minDistance", 2.0))
                    min_distance = float(val_min_dist) if isinstance(val_min_dist, (int, float, str)) else 2.0
                    if min_distance <= 0:
                        raise ValueError(f"Solvation minimum distance must be positive. Got {min_distance}.")
                    if min_distance > 20.0:
                        raise ValueError(f"Solvation minimum distance is abnormally large: {min_distance}. Must be <= 20.0.")
                    
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
                for fname, path in _iter_regular_work_dir_files(work_dir):
                    if fname.startswith("input_"):
                        continue
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


@app.route("/api/download-result/<token>")
def download_result(token):
    requester_session = request.cookies.get("atomipy_session")
    res_data = _get_cached_result(token)
    if not res_data:
        return jsonify({"error": "Result not found or expired. Please build again."}), 404
    stored_session = res_data.get("session_id")
    if stored_session is not None and stored_session != requester_session:
        return jsonify({"error": "Result not found or expired. Please build again."}), 404
    try:
        return send_file(
            res_data["path"],
            mimetype="application/zip",
            as_attachment=True,
            download_name=res_data["filename"],
        )
    except (FileNotFoundError, OSError):
        return jsonify({"error": "Result not found or expired. Please build again."}), 404

@app.route("/api/debug-cache")
def debug_cache():
    """Diagnostic route to check the state of the results cache."""
    try:
        files = []
        if os.path.exists(CACHE_DIR):
            for f in os.listdir(CACHE_DIR):
                path = os.path.join(CACHE_DIR, f)
                files.append({
                    "name": f,
                    "size": os.path.getsize(path),
                    "mtime": time.ctime(os.path.getmtime(path))
                })
        
        return jsonify({
            "cache_dir": CACHE_DIR,
            "memory_cache_tokens": list(BUILD_RESULTS_CACHE.keys()),
            "disk_files": files,
            "total_files": len(files)
        })
    except Exception as e:
        return jsonify({"error": str(e)})

import requests

BACKEND_URL = os.environ.get("BACKEND_URL", "http://backend:8000")

@app.route("/api/upload", methods=["POST"])
def proxy_upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    
    files = {"file": (file.filename, file.read(), file.content_type)}
    resp = requests.post(f"{BACKEND_URL}/api/upload", files=files)
    return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("content-type"))

@app.route("/api/presets", methods=["GET"])
def proxy_list_presets():
    resp = requests.get(f"{BACKEND_URL}/api/presets")
    return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("content-type"))

@app.route("/api/download-result/<token>")
def proxy_download_result(token):
    resp = requests.get(f"{BACKEND_URL}/api/download-result/{token}", stream=True)
    return Response(resp.iter_content(chunk_size=1024), status=resp.status_code, content_type=resp.headers.get("content-type"))

@app.route("/api/build-stream", methods=["POST"])
def build_stream():
    try:
        payload = _parse_payload()
        script_code = payload.get("script", "")
        if not script_code:
            return jsonify({"error": "No script provided."}), 400

        # Proxy the request to the FastAPI backend
        response = requests.post(f"{BACKEND_URL}/api/build-stream", json=payload, stream=True)
        
        def generate():
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
                    
        return Response(
            stream_with_context(generate()), 
            content_type=response.headers.get("content-type", "text/event-stream"),
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
        workflow_data = payload.get("workflow")
        if not script_code:
            return jsonify({"error": "No script provided."}), 400

        if os.environ.get("DISABLE_SIMULATION", "false").lower() == "true" and "load_minff_into_openmm" in script_code:
            return jsonify({"error": "Simulation execution is disabled on this server instance. Run locally or in Google Colab to execute simulations."}), 403

        session_id = request.cookies.get("atomipy_session")
        with tempfile.TemporaryDirectory(prefix="atomipy_") as work_dir:
            _prepare_execution_workspace(work_dir, session_id)
            _write_execution_inputs(work_dir, script_code, script_artifacts, workflow_data)

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
            summary: dict[str, Any] = {
                "success": success,
                "exit_code": result.returncode,
                "message": "Build succeeded." if success else "Build failed. See execution logs.",
                "stdout_chars": len(result.stdout or ""),
                "stderr_chars": len(result.stderr or ""),
            }

            # Zip all generated files and execution artifacts (success and failure)
            memory_file = io.BytesIO()
            included_files = []
            
            # Copy executing script to run_openmm.py for absolute clarity in download bundle
            _script_src = os.path.join(work_dir, "build_script.py")
            if os.path.exists(_script_src):
                import shutil as _app_shutil
                _app_shutil.copy(_script_src, os.path.join(work_dir, "run_openmm.py"))

            with zipfile.ZipFile(memory_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for fname, path in _iter_regular_work_dir_files(work_dir, {"UC_conf", "uploads"}):
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

def prune_cache_loop():
    """Background thread to delete result files older than 1 hour."""
    while True:
        try:
            now = time.time()
            cutoff = now - 3600 # 1 hour
            deleted_paths = set()
            if os.path.exists(CACHE_DIR):
                for f in os.listdir(CACHE_DIR):
                    p = os.path.join(CACHE_DIR, f)
                    if os.path.getmtime(p) < cutoff:
                        with contextlib.suppress(Exception):
                            if os.path.isfile(p):
                                os.remove(p)
                                deleted_paths.add(p)
                            elif os.path.isdir(p):
                                import shutil
                                shutil.rmtree(p)
                                deleted_paths.add(p)

            if deleted_paths:
                with CACHE_LOCK:
                    for token, data in list(BUILD_RESULTS_CACHE.items()):
                        if data.get("path") in deleted_paths:
                            BUILD_RESULTS_CACHE.pop(token, None)
        except Exception as e:
            print(f"Error in pruning thread: {e}")
        time.sleep(1800) # Run every 30 mins

# Start the pruning thread
threading.Thread(target=prune_cache_loop, daemon=True).start()

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "1").lower() not in {"0", "false", "no"}
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5002")), debug=debug)

# Triggering reload for atomipy core changes - v1.0.1 (Cloud Run Optimized)
