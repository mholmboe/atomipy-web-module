import io
import json
import subprocess
import sys
import textwrap
import time
import traceback
import zipfile
from urllib import error as urlerror
from urllib import request as urlrequest


def wait_for_server(url: str, retries: int = 20, delay_s: float = 1.5) -> bool:
    for attempt in range(1, retries + 1):
        try:
            req = urlrequest.Request(url, method="GET")
            with urlrequest.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        print(f"Waiting for server... ({attempt}/{retries})")
        time.sleep(delay_s)
    return False


def post_json(url: str, payload: dict, timeout: int = 180) -> tuple[int, bytes]:
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=timeout) as response:
            return response.status, response.read()
    except urlerror.HTTPError as exc:
        return exc.code, exc.read()
    except Exception as exc:
        raise RuntimeError(f"POST failed: {exc}") from exc


def dump_failure_bundle(content: bytes) -> None:
    try:
        zip_data = io.BytesIO(content)
        with zipfile.ZipFile(zip_data) as zf:
            names = zf.namelist()
            print("Failure bundle files:", sorted(names))
            if "execution_stderr.txt" in names:
                print("--- execution_stderr.txt ---")
                print(zf.read("execution_stderr.txt").decode("utf-8", errors="replace"))
            if "execution_stdout.txt" in names:
                print("--- execution_stdout.txt ---")
                print(zf.read("execution_stdout.txt").decode("utf-8", errors="replace"))
    except Exception as exc:
        print(f"Could not extract failure bundle: {exc}")


def run_test() -> bool:
    print("Starting backend server...")
    server_process = subprocess.Popen([sys.executable, "app.py"], cwd=".")

    if not wait_for_server("http://127.0.0.1:5002/health"):
        print("Server failed to start.")
        server_process.terminate()
        return False

    try:
        # Exercises new/extended capabilities with consolidated nodes:
        # - transform: Spatial Ops (Translate/Rotate)
        # - edit: Structural Edit (Molecule/Resname)
        # - chemistry: Chemistry Ops (BVS H-addition)
        # - solvent: Solvent Ops (Solvate)
        # - forcefield: MinFF typing
        # - xrd: XRD simulation
        # - analysis: RDF/CN/BVS summaries
        # - export: Final PDB/ITP/N2T
        script = textwrap.dedent(
            """
            import atomipy as ap
            import json

            print("__NODE_START__:grid_0:0")
            atoms_0, box_0 = ap.create_grid('Na', 0.5, [0, 0, 0, 6, 6, 6])

            print("__NODE_START__:transform_1:1")
            atoms_1 = ap.center(atoms_0, [3.0, 3.0, 3.0])
            atoms_1 = ap.rotate(atoms_1, box_0, angles=[45, 0, 0])
            box_1 = box_0

            print("__NODE_START__:edit_2:2")
            atoms_2 = ap.molecule(atoms_1, molid=1, resname='MIN')
            atoms_2 = ap.assign_resname(atoms_2, default_resname='MIN')
            box_2 = box_1

            print("__NODE_START__:chemistry_3:3")
            # Testing BVS addition (even if it adds 0 atoms to a simple Na grid, the call should work)
            atoms_3 = ap.add_hydrogens_bvs(atoms_2, box_2, delta_threshold=-0.5, max_additions=5)
            box_3 = box_2

            print("__NODE_START__:solvent_4:4")
            wrapped_4 = ap.wrap(atoms_3, box_3)
            solvent_4 = ap.solvate(limits=box_3, density=1000.0, min_distance=2.25, max_solvent='max', solute_atoms=wrapped_4, Box=box_3, solvent_type='spce', include_solute=False)
            atoms_4 = ap.update(atoms_3, solvent_4)
            box_4 = box_3

            print("__NODE_START__:forcefield_5:5")
            # MinFF typing
            atoms_5 = ap.forcefield.minff(atoms_4, Box=box_4, rmaxlong=2.45, rmaxH=1.2)
            box_5 = box_4

            print("__NODE_START__:analysis_6:6")
            # RDF
            r_rdf, g_r = ap.calculate_rdf(atoms_5, box_5, typeA='Na', typeB='OW', rmax=5.0, dr=0.1)
            with open('rdf_results.json', 'w') as fh:
                json.dump({"bins": r_rdf.tolist(), "rdf": g_r.tolist()}, fh)

            # BVS
            bvs_report = ap.analyze_bvs(atoms_5, box_5, csv_path='bvs_results.csv', top_n=10)
            with open('bvs_summary.log', 'w') as fh:
                fh.write(f"GII: {bvs_report.get('gii', 0.0):.6f}\\n")

            # Stats
            ap.get_structure_stats(atoms_5, Box=box_5, log_file='output.log')

            print("__NODE_START__:xrd_7:7")
            # XRD Simulation (lightweight settings for speed)
            ap.xrd(atoms_5, box_5, wavelength=1.54187, two_theta_range=(20.0, 40.0), angle_step=0.5, save_output=True, plot=False)

            print("__NODE_START__:export_8:8")
            ap.write_pdb(atoms_5, box_5, 'final_system.pdb', write_conect=True, write_element=True)
            ap.write_itp(atoms_5, box_5, 'final_system.itp', KANGLE=500)
            ap.write_n2t(atoms_5, Box=box_5, n2t_file='final_system.n2t')
            """
        ).strip()

        workflow = {
            "nodes": [
                {"id": "grid_0", "type": "grid"},
                {"id": "transform_1", "type": "transform"},
                {"id": "edit_2", "type": "edit"},
                {"id": "chemistry_3", "type": "chemistry"},
                {"id": "solvent_4", "type": "solvent"},
                {"id": "forcefield_5", "type": "forcefield"},
                {"id": "analysis_6", "type": "analysis"},
                {"id": "xrd_7", "type": "xrd"},
                {"id": "export_8", "type": "export"},
            ],
            "edges": [],
        }

        payload = {
            "script": script,
            "workflow": workflow,
            "artifacts": {
                "build_script_full.py": "# full script placeholder\\n",
                "build_script_strict_minimal.py": "# strict minimal placeholder\\n",
                "build_script_notebook.ipynb": json.dumps(
                    {
                        "cells": [],
                        "metadata": {},
                        "nbformat": 4,
                        "nbformat_minor": 5,
                    }
                ),
            },
        }

        print("Submitting integration payload...")
        status_code, response_body = post_json("http://127.0.0.1:5002/api/execute-script", payload, timeout=180)

        if status_code != 200:
            print(f"ERROR: Response status {status_code}")
            dump_failure_bundle(response_body)
            return False

        zip_data = io.BytesIO(response_body)
        with zipfile.ZipFile(zip_data) as zf:
            files = sorted(zf.namelist())
            print("Files in bundle:", files)

            expected_files = [
                "build_script.py",
                "build_summary.json",
                "execution_stderr.txt",
                "execution_stdout.txt",
                "workflow.json",
                "rdf_results.json",
                "bvs_results.csv",
                "bvs_summary.log",
                "output.log",
                "final_system.pdb",
                "final_system.itp",
                "final_system.n2t",
            ]

            missing = [f for f in expected_files if f not in files]
            if missing:
                print("MISSING FILES:", missing)
                return False

            stats_text = zf.read("output.log").decode("utf-8", errors="replace")
            if "Unique Atom Types" not in stats_text:
                print("INVALID output.log: missing 'Unique Atom Types'")
                return False

            itp_text = zf.read("final_system.itp").decode("utf-8", errors="replace").strip()
            if "[ moleculetype ]" not in itp_text:
                print("INVALID final_system.itp: missing '[ moleculetype ]'")
                return False

            for json_name in [
                "rdf_results.json",
            ]:
                try:
                    json.loads(zf.read(json_name).decode("utf-8"))
                except Exception as exc:
                    print(f"INVALID JSON in {json_name}: {exc}")
                    return False

        print("ALL INTEGRATION TESTS PASSED.")
        return True
    except Exception as exc:
        print(f"Test script error: {exc}")
        traceback.print_exc()
        return False
    finally:
        print("Terminating backend server...")
        server_process.terminate()
        server_process.wait()


if __name__ == "__main__":
    ok = run_test()
    sys.exit(0 if ok else 1)
