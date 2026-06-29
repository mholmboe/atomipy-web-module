"""Runtime helpers injected into a build script's execution namespace.

Historically these were defined inline inside ``execution.py`` and added to the
``exec()`` globals when the generated build script ran *in-process*. To sandbox
execution (run the untrusted, client-supplied script in a separate process) the
same helpers must be available there, so they live here and are shared by:

  * ``build_runner.py`` — the subprocess entrypoint (the sandboxed path), and
  * (optionally) the in-process fallback.

``install_runtime()`` wires the helpers onto the ``atomipy`` module (monkey-patches
that preserve ``SystemList`` metadata, plus ``parametrize_*`` / ``mix_systems``)
and returns the dict of names to expose as script globals.
"""
import os
import sys
import json

import numpy as np

# NumPy 2.x compatibility: some callers pass copy=False, which raises on
# NumPy 2.x when a copy is unavoidable. Fall back to copy=True in that case.
_orig_array = np.array


def _compat_array(*args, **kwargs):
    if kwargs.get("copy") is False:
        try:
            return _orig_array(*args, **kwargs)
        except ValueError as e:
            if "Unable to avoid copy" in str(e):
                kwargs["copy"] = True
                return _orig_array(*args, **kwargs)
            raise
    return _orig_array(*args, **kwargs)


np.array = _compat_array


class SystemList(list):
    """A list of atoms that also carries the GROMACS ``itp`` and ``box`` metadata
    through atomipy calls, so topology/box info survives transformations."""

    def __init__(self, atoms, itp=None, box=None):
        super().__init__(atoms)
        self.itp = itp
        self.box = box


def install_runtime():
    """Wire the build-runtime helpers onto ``atomipy`` and return script globals.

    Returns a dict suitable for use as / merging into the ``exec`` globals of a
    generated build script.
    """
    import atomipy as ap
    import requests as _requests
    import shutil as _shutil

    def ap_plot(node_id, x, y, title="", xlabel="", ylabel=""):
        data = {
            "x": x.tolist() if hasattr(x, "tolist") else list(x),
            "y": y.tolist() if hasattr(y, "tolist") else list(y),
            "title": title,
            "xlabel": xlabel,
            "ylabel": ylabel,
        }
        print(f"__PLOT_{node_id}__:{json.dumps(data)}")

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
        "solvate", "ionize", "translate", "rotate", "scale", "bend", "center",
        "slice", "remove", "fuse_atoms", "assign_resname", "molecule", "wrap",
        "replicate_system", "update",
    ]:
        wrap_atomipy_function(func_name)

    def _materialize_ff_files(paths):
        """Write worker-returned FF files into the build dir.

        The OpenFF worker is a separate service with no shared filesystem, so it
        returns file *contents*; write them locally, preserving basenames so the
        .top's #include of the .itp resolves. Falls back to copying local paths
        when the worker shares /tmp (local dev). Returns local {top,gro,itp}."""
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

    def parametrize_organic_gaff(smiles, version="gaff-2.11", charge_method="bcc", basename="organic"):
        """Parametrize an organic molecule via ACPYPE on the OpenFF worker.
        ``basename`` becomes the GROMACS moleculetype/residue name. Returns
        (SystemList, box_vectors)."""
        worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
        v = version.lower()
        if "sage" in v or "openff" in v:
            resp = _requests.post(f"{worker_url}/parametrize/sage", params={"smiles": smiles}, timeout=120)
        elif "opls" in v:
            resp = _requests.post(f"{worker_url}/parametrize/oplsaa", params={"smiles": smiles}, timeout=120)
        else:
            resp = _requests.post(
                f"{worker_url}/parametrize/gaff",
                params={"smiles": smiles, "version": version, "charge_method": charge_method, "basename": basename},
                timeout=180,
            )
        resp.raise_for_status()
        paths = resp.json()
        local = _materialize_ff_files(paths)
        atoms, itp = ap.import_gaff_top(local.get("top") or paths.get("top"))
        ap.import_gro_coords(local.get("gro") or paths.get("gro"), atoms)
        box = paths.get("box", [50.0, 50.0, 50.0])
        return SystemList(atoms, itp=itp, box=box), box

    def parametrize_organic_file(filepath, version="gaff-2.11", charge_method="bcc", basename="organic"):
        """Parametrize an uploaded structure file via the OpenFF worker.
        ``basename`` becomes the GROMACS moleculetype/residue name. Returns
        (SystemList, box_vectors)."""
        worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
        with open(filepath, "rb") as fh:
            resp = _requests.post(
                f"{worker_url}/parametrize/gaff-file",
                files={"file": (os.path.basename(filepath), fh)},
                params={"version": version, "charge_method": charge_method, "basename": basename},
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
        """N-way topology merge for mixed mineral + organic systems. Each component
        may be a SystemList, a {'atoms',...} dict, or a plain atoms list. Returns a
        SystemList."""
        comp_dicts = []
        for c in components:
            if isinstance(c, SystemList):
                comp_dicts.append({"atoms": list(c), "itp": c.itp, "box": c.box})
            elif isinstance(c, dict) and "atoms" in c:
                comp_dicts.append(c)
            elif isinstance(c, list):
                b = box if box is not None else [50.0, 50.0, 50.0]
                comp_dicts.append({"atoms": c, "itp": None, "box": b})
            else:
                raise TypeError(f"mix_systems: unrecognized component type {type(c)}")
        import numpy as _np
        _out_box = box.tolist() if isinstance(box, _np.ndarray) else box
        atoms_merged, itp_merged, box_merged = ap.merge_top(*comp_dicts, output_box=_out_box)

        merged_itp = dict(itp_merged)
        source_idx = 1

        def _collect_sources(itp_dict):
            nonlocal source_idx
            if not itp_dict:
                return
            if itp_dict.get("_source_itp"):
                merged_itp[f"_source_itp_{source_idx}"] = itp_dict["_source_itp"]
                source_idx += 1
            for k, v in itp_dict.items():
                if k.startswith("_source_itp_"):
                    merged_itp[f"_source_itp_{source_idx}"] = v
                    source_idx += 1
            if itp_dict.get("_original_itps"):
                for orig in itp_dict["_original_itps"]:
                    _collect_sources(orig)

        for c in comp_dicts:
            _collect_sources(c.get("itp"))

        return SystemList(atoms_merged, itp=merged_itp, box=box_merged)

    setattr(ap, "parametrize_organic_gaff", parametrize_organic_gaff)
    setattr(ap, "parametrize_organic_file", parametrize_organic_file)
    setattr(ap, "mix_systems", mix_systems)

    return {
        "__name__": "__main__",
        "ap": ap,
        "os": os,
        "sys": sys,
        "json": json,
        "ap_plot": ap_plot,
    }
