"""
Standalone FastAPI service running in the atomipy-openff environment.
Called by the core backend via HTTP for all organic parametrization.

Endpoints:
  POST /parametrize/sage   — OpenFF Sage (SMIRNOFF), pure Python
  POST /parametrize/gaff   — GAFF/GAFF2 via ACPYPE (bundles antechamber)
  POST /mix/interchange    — Experimental Interchange mixing path
  GET  /status             — Version info and capability flags
"""
import os
import subprocess
import textwrap
import tempfile
import hashlib
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

os.environ.setdefault("INTERCHANGE_EXPERIMENTAL", "1")

from fastapi import FastAPI, HTTPException, UploadFile, File

app = FastAPI()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mol_id(smiles: str) -> str:
    return hashlib.md5(smiles.encode()).hexdigest()[:8]


def _probe_gromacs_reader() -> bool:
    try:
        from openff.interchange import Interchange
        minimal_top = textwrap.dedent("""\
            [ defaults ]
            1   2   yes   0.5   0.8333
            [ atomtypes ]
            opls_135  C  12.011  0.0  A  3.5e-01  2.761e-01
            [ moleculetype ]
            MOL  3
            [ atoms ]
            1  opls_135  1  MOL  C1  1  -0.18  12.011
            [ system ]
            MOL
            [ molecules ]
            MOL  1
        """)
        minimal_gro = textwrap.dedent("""\
            MOL in water
            1
                1MOL   C1    1   0.000   0.000   0.000
               3.00000   3.00000   3.00000
        """)
        with tempfile.NamedTemporaryFile(suffix=".top", mode="w", delete=False) as ft:
            ft.write(minimal_top)
            top_path = ft.name
        gro_path = top_path.replace(".top", ".gro")
        with open(gro_path, "w") as fg:
            fg.write(minimal_gro)
        ic = Interchange.from_gromacs(top_path, gro_path)
        assert ic.topology.n_atoms == 1
        assert ic.box is not None
        return True
    except Exception:
        return False


def _interchange_version() -> str:
    from openff.interchange import __version__
    return __version__


def _smiles_to_sdf(smiles: str, sdf_path: str) -> None:
    """Generate a 3D-embedded SDF from a SMILES string using RDKit."""
    from rdkit import Chem
    from rdkit.Chem import rdDistGeom, rdForceFieldHelpers
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"RDKit could not parse SMILES: {smiles}")
    mol = Chem.AddHs(mol)
    ps = rdDistGeom.ETKDGv3()
    result = rdDistGeom.EmbedMolecule(mol, ps)
    if result == -1:
        result = rdDistGeom.EmbedMolecule(mol, rdDistGeom.EmbedParameters())
    rdForceFieldHelpers.MMFFOptimizeMolecule(mol)
    writer = Chem.SDWriter(sdf_path)
    writer.write(mol)
    writer.close()


def _box_from_gro(gro_path: str) -> list:
    """Read the last line of a GRO file and return [a,b,c,90,90,90] in Å."""
    with open(gro_path) as f:
        lines = f.readlines()
    parts = lines[-1].split()
    # GRO box line is in nm; convert to Å
    if len(parts) >= 3:
        try:
            a = float(parts[0]) * 10
            b = float(parts[1]) * 10
            c = float(parts[2]) * 10
            if a > 0 and b > 0 and c > 0:
                return [a, b, c, 90.0, 90.0, 90.0]
        except Exception:
            pass
    return [25.0, 25.0, 25.0, 90.0, 90.0, 90.0]


def _read_text(path) -> "str | None":
    """Return the text contents of a file, or None.

    The worker and the core app run as SEPARATE Cloud Run services with no
    shared filesystem, so responses must carry file *contents* (the caller
    materializes them locally) — returning bare /tmp paths only works when the
    two share a filesystem (local dev)."""
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except Exception:
        return None


OPENFF_GROMACS_EXPERIMENTAL = _probe_gromacs_reader()
OPENFF_GROMACS_STABLE = (
    OPENFF_GROMACS_EXPERIMENTAL
    and os.getenv("OPENFF_GROMACS_STABLE", "") == "true"
)


# ---------------------------------------------------------------------------
# Sage endpoint
# ---------------------------------------------------------------------------

@app.post("/parametrize/sage")
def parametrize_sage(smiles: str,
                     forcefield: str = "openff-2.3.0.offxml") -> dict:
    from openff.toolkit import Molecule, ForceField
    from openff.interchange import Interchange
    from openff.units import unit as off_unit

    mol = Molecule.from_smiles(smiles)
    mol.generate_conformers(n_conformers=1)
    if not mol.conformers:
        raise HTTPException(status_code=422,
                            detail=f"Failed to generate conformer for SMILES: {smiles}")

    ff = ForceField(forcefield)
    ic = Interchange.from_smirnoff(force_field=ff, topology=mol.to_topology())
    ic.positions = mol.conformers[0]

    # Set a periodic box: bounding box of conformer + 1.5 nm padding each side
    positions_ang = mol.conformers[0].to(off_unit.angstrom).magnitude
    padding_ang = 15.0
    extents = positions_ang.max(axis=0) - positions_ang.min(axis=0)
    box_ang = np.maximum(extents + 2 * padding_ang, 30.0)  # at least 3 nm
    ic.box = np.diag(box_ang) * off_unit.angstrom

    prefix   = f"/tmp/{_mol_id(smiles)}_sage"
    top_path = f"{prefix}.top"
    gro_path = f"{prefix}.gro"
    ic.to_gromacs(prefix)

    box = _box_from_gro(gro_path)
    return {
        "top": top_path,
        "gro": gro_path,
        "top_content": _read_text(top_path),
        "gro_content": _read_text(gro_path),
        "box": box,
        "forcefield": forcefield,
        "note": "monolithic .top — all FF parameters inlined, no .itp files",
    }


# ---------------------------------------------------------------------------
# GAFF endpoint
# ---------------------------------------------------------------------------

@app.post("/parametrize/gaff")
def parametrize_gaff(smiles: str,
                     version: str = "gaff2",
                     charge_method: str = "bcc") -> dict:
    """
    Parametrize a small organic molecule with GAFF or GAFF2 via ACPYPE.
    ACPYPE bundles antechamber binaries — no separate AmberTools install needed.
    Returns paths to native GROMACS .top, .itp, and .gro files.
    """
    # Map user-facing version strings to ACPYPE atom_type flag
    at = version.lower()
    if "gaff2" in at or "gaff-2" in at:
        atom_type = "gaff2"
    else:
        atom_type = "gaff"

    workdir = f"/tmp/{_mol_id(smiles)}_gaff_{atom_type}"
    os.makedirs(workdir, exist_ok=True)

    sdf_path = os.path.join(workdir, "organic.sdf")
    _smiles_to_sdf(smiles, sdf_path)

    result = subprocess.run(
        [
            "acpype",
            "-i", sdf_path,
            "-c", charge_method,   # bcc (AM1-BCC) or gas (Gasteiger)
            "-a", atom_type,       # gaff or gaff2
            "-o", "gmx",
            "-n", "0",             # net charge 0 (neutral)
            "-b", "organic",       # output basename
        ],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=180,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"ACPYPE failed:\n{result.stderr or result.stdout}",
        )

    acpype_dir = os.path.join(workdir, "organic.acpype")
    top_path = os.path.join(acpype_dir, "organic_GMX.top")
    itp_path = os.path.join(acpype_dir, "organic_GMX.itp")
    gro_path = os.path.join(acpype_dir, "organic_GMX.gro")

    for p in (top_path, gro_path):
        if not os.path.exists(p):
            raise HTTPException(
                status_code=500,
                detail=f"ACPYPE ran but expected output not found: {p}\n"
                       f"stdout: {result.stdout}\nstderr: {result.stderr}",
            )

    box = _box_from_gro(gro_path)
    return {
        "top": top_path,
        "itp": itp_path if os.path.exists(itp_path) else None,
        "gro": gro_path,
        "top_content": _read_text(top_path),
        "itp_content": _read_text(itp_path) if os.path.exists(itp_path) else None,
        "gro_content": _read_text(gro_path),
        "box": box,
        "forcefield": atom_type,
        "charge_method": charge_method,
        "note": f"GAFF atom types ({atom_type}), LB combining rules, {charge_method} charges",
    }


# ---------------------------------------------------------------------------
# GAFF file-upload endpoint
# ---------------------------------------------------------------------------

@app.post("/parametrize/gaff-file")
async def parametrize_gaff_file(
    file: UploadFile = File(...),
    version: str = "gaff2",
    charge_method: str = "bcc",
) -> dict:
    """
    Parametrize an uploaded structure file (.mol2, .sdf, .mol, .pdb) with
    GAFF/GAFF2 via ACPYPE, preserving any existing 3D geometry in the file.
    Returns paths to native GROMACS .top, .itp, and .gro files.
    """
    from pathlib import Path

    original_name = file.filename or "organic.mol2"
    suffix = Path(original_name).suffix or ".mol2"
    mol_id = hashlib.md5(original_name.encode()).hexdigest()[:8]
    workdir = f"/tmp/{mol_id}_gaff_file"
    os.makedirs(workdir, exist_ok=True)

    mol_path = os.path.join(workdir, f"organic{suffix}")
    content = await file.read()
    with open(mol_path, "wb") as f:
        f.write(content)

    at = version.lower()
    atom_type = "gaff2" if ("gaff2" in at or "gaff-2" in at) else "gaff"

    result = subprocess.run(
        [
            "acpype",
            "-i", mol_path,
            "-c", charge_method,
            "-a", atom_type,
            "-o", "gmx",
            "-n", "0",
            "-b", "organic",
        ],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=180,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"ACPYPE failed:\n{result.stderr or result.stdout}",
        )

    acpype_dir = os.path.join(workdir, "organic.acpype")
    top_path = os.path.join(acpype_dir, "organic_GMX.top")
    itp_path = os.path.join(acpype_dir, "organic_GMX.itp")
    gro_path = os.path.join(acpype_dir, "organic_GMX.gro")

    for p in (top_path, gro_path):
        if not os.path.exists(p):
            raise HTTPException(
                status_code=500,
                detail=f"ACPYPE ran but expected output not found: {p}\n"
                       f"stdout: {result.stdout}\nstderr: {result.stderr}",
            )

    box = _box_from_gro(gro_path)
    return {
        "top": top_path,
        "itp": itp_path if os.path.exists(itp_path) else None,
        "gro": gro_path,
        "top_content": _read_text(top_path),
        "itp_content": _read_text(itp_path) if os.path.exists(itp_path) else None,
        "gro_content": _read_text(gro_path),
        "box": box,
        "forcefield": atom_type,
        "charge_method": charge_method,
        "note": f"GAFF ({atom_type}) from uploaded file, {charge_method} charges",
    }


# ---------------------------------------------------------------------------
# Interchange mixing endpoint (experimental)
# ---------------------------------------------------------------------------

@app.post("/mix/interchange")
def mix_interchange(request: dict) -> dict:
    from openff.interchange import Interchange

    if not OPENFF_GROMACS_STABLE:
        return {
            "error": (
                "from_gromacs is experimental (INTERCHANGE_EXPERIMENTAL=1 required) "
                "and has not yet passed MINFF/CLAYFF energy round-trip CI validation. "
                "Use the ParmEd merge path instead."
                if OPENFF_GROMACS_EXPERIMENTAL
                else "from_gromacs not available in this interchange version."
            )
        }

    min_top     = request.get("min_top")
    min_gro     = request.get("min_gro")
    organic_top = request.get("organic_top")
    organic_gro = request.get("organic_gro")
    targets     = request.get("targets", [])

    min_ic     = Interchange.from_gromacs(min_top, min_gro)
    organic_ic = Interchange.from_gromacs(organic_top, organic_gro)
    mixed      = min_ic + organic_ic

    outputs = {}
    if "gromacs" in targets:
        mixed.to_gromacs("/tmp/mixed")
        outputs["gromacs"] = {
            "top": "/tmp/mixed.top",
            "gro": "/tmp/mixed.gro",
            "note": "monolithic .top — all FF parameters inlined",
        }
    if "lammps" in targets:
        mixed.to_lammps("/tmp/mixed")
        outputs["lammps"] = {"lmp": "/tmp/mixed.lmp"}
    return outputs


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@app.get("/status")
def status() -> dict:
    acpype_available = subprocess.run(
        ["acpype", "--version"],
        capture_output=True,
    ).returncode == 0

    return {
        "interchange_version":          _interchange_version(),
        "gromacs_reader_experimental":  OPENFF_GROMACS_EXPERIMENTAL,
        "gromacs_reader_stable":        OPENFF_GROMACS_STABLE,
        "interchange_experimental_env": os.getenv("INTERCHANGE_EXPERIMENTAL", ""),
        "writes_monolithic_top":        True,
        "acpype_available":             acpype_available,
    }
