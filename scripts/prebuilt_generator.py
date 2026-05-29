#!/usr/bin/env python3
"""
Prebuilt generator script for MINFF/CLAYFF topologies.

This script runs `atomipy` locally to generate standard prebuilt mineral systems
(e.g., Kaolinite and Montmorillonite). It saves the OpenMM/GROMACS topology
files and the per-triplet `angles.json` sidecar to the `backend/core/data/prebuilt`
cache directory.

These prebuilts serve as a fast cache for the topology loading and are required
for the CI energy round-trip validation tests.

**Staleness Warning**: If MINFF parameters or forcefields are updated, you must
re-run this script (e.g., via `make prebuilt`) to regenerate the cache.
Otherwise, the backend will use stale parameters for prebuilt systems.
"""
import os
import sys

# Ensure backend/core is in the path so we can import services
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/core')))

from services import atomipy_service

PREBUILT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/core/data/prebuilt'))

def generate_kaolinite():
    mineral = "kaolinite"
    out_dir = os.path.join(PREBUILT_DIR, "kaolinite_minff")
    os.makedirs(out_dir, exist_ok=True)

    print(f"Generating {mineral} in {out_dir} ...")
    
    # Valid prebuilt definition for Kaolinite
    # Supercell: 4x4x1
    # No charge substitutions for standard kaolinite
    paths = atomipy_service.build_min(
        mineral=mineral,
        cell_params={"nx": 4, "ny": 4, "nz": 1},
        substitutions={},
        forcefield="minff",
        output_dir=out_dir
    )
    print(f"Success. Topology saved to {paths['top']}")

def generate_montmorillonite():
    mineral = "montmorillonite"
    out_dir = os.path.join(PREBUILT_DIR, "montmorillonite_minff")
    os.makedirs(out_dir, exist_ok=True)

    print(f"Generating {mineral} in {out_dir} ...")
    
    # Valid prebuilt definition for Montmorillonite
    # Supercell: 4x4x1
    # Charge balanced with standard octahedral Mg/Al substitutions and Na+ interlayer
    # Assuming standard substitutions map format handled by atomipy_service
    substitutions = {
        "octahedral_Al_to_Mg": 0.125  # 1/8th of Al substituted by Mg
    }
    
    paths = atomipy_service.build_min(
        mineral=mineral,
        cell_params={"nx": 4, "ny": 4, "nz": 1},
        substitutions=substitutions,
        forcefield="minff",
        output_dir=out_dir
    )
    print(f"Success. Topology saved to {paths['top']}")

if __name__ == "__main__":
    print(f"Writing prebuilt topologies to {PREBUILT_DIR}")
    try:
        generate_kaolinite()
        generate_montmorillonite()
        print("Prebuilt generation complete.")
    except Exception as e:
        print(f"Failed to generate prebuilts: {e}")
        sys.exit(1)
