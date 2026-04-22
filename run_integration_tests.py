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
        # Exercises new/extended capabilities:
        # - atomProps-style calls (element / formal charge / mass / COM)
        # - coordFrame-style calls (cart<->frac + cell vectors)
        # - pbc unwrap with molid
        # - analysis outputs (rdf/cn/closest/occupancy JSON+CSV)
        # - bondAngle advanced kwargs (neighbor_element, dm_method)
        # - export + n2t
        script = textwrap.dedent(
            """
            import atomipy as ap
            import json

            print("__NODE_START__:grid_0:0")
            atoms_0, box_0 = ap.create_grid('Na', 0.5, [0, 0, 0, 6, 6, 6])

            print("__NODE_START__:atomProps_1:1")
            atoms_1 = ap.element(atoms_0)
            atoms_1 = ap.assign_formal_charges(atoms_1)
            atoms_1 = ap.set_atomic_masses(atoms_1)
            com_1 = ap.com(atoms_1, add_to_atoms=True)
            with open("com_report.json", "w") as fh:
                json.dump({"com": [float(com_1[0]), float(com_1[1]), float(com_1[2])]}, fh)

            print("__NODE_START__:coordFrame_2:2")
            _, atoms_2 = ap.cartesian_to_fractional(atoms=atoms_1, Box=box_0, add_to_atoms=True)
            _, atoms_3 = ap.fractional_to_cartesian(atoms=atoms_2, Box=box_0, add_to_atoms=True)
            cell_vectors = ap.get_cell_vectors(ap.Box_dim2Cell(box_0))
            with open("cell_vectors.json", "w") as fh:
                json.dump({"cell_vectors": cell_vectors.tolist()}, fh)

            print("__NODE_START__:pbc_3:3")
            atoms_3 = ap.molecule(atoms_3, molid=1, resname="MIN")
            atoms_4 = ap.unwrap_coordinates(atoms_3, box_0, molid=1)
            atoms_4 = ap.wrap(atoms_4, box_0)

            print("__NODE_START__:analysis_4:4")
            r_rdf, g_r = ap.calculate_rdf(atoms_4, box_0, typeA="Na", typeB="Na", rmax=4.0, dr=0.2)
            with open("rdf_results.json", "w") as fh:
                json.dump({"bins": r_rdf.tolist(), "rdf": g_r.tolist()}, fh)
            with open("rdf_results.csv", "w") as fh:
                fh.write("r,rdf\\n")
                for r_i, g_i in zip(r_rdf.tolist(), g_r.tolist()):
                    fh.write(f"{float(r_i):.6f},{float(g_i):.6f}\\n")

            cn_data = ap.coordination_number(atoms_4, box_0, typeA="Na", typeB="Na", cutoff=2.4)
            with open("cn_results.json", "w") as fh:
                json.dump({"coordination_number": cn_data}, fh)
            with open("cn_results.csv", "w") as fh:
                fh.write("index,coordination_number\\n")
                for i, cn_val in enumerate(cn_data, start=1):
                    fh.write(f"{i},{int(cn_val)}\\n")

            closest_data = ap.closest_atom(atoms_4, [0.0, 0.0, 0.0], Box=box_0)
            with open("closest_results.json", "w") as fh:
                json.dump({"closest_atom": closest_data}, fh)
            with open("closest_results.csv", "w") as fh:
                fh.write("index,type,element,x,y,z,charge\\n")
                if closest_data:
                    fh.write(
                        f"{closest_data.get('index', '')},{closest_data.get('type', '')},{closest_data.get('element', '')},"
                        f"{closest_data.get('x', '')},{closest_data.get('y', '')},{closest_data.get('z', '')},{closest_data.get('charge', '')}\\n"
                    )

            if hasattr(ap, "occupancy_atom"):
                atoms_5, occ = ap.occupancy_atom(atoms_4, box_0, rmax=1.1)
                occ_values = occ.tolist() if hasattr(occ, "tolist") else list(occ)
            else:
                dist, _, _, _ = ap.dist_matrix(atoms_4, box_0)
                occ_values = []
                for i in range(len(atoms_4)):
                    neigh = [d for d in dist[:, i] if d < 1.1]
                    occ_val = (1.0 / len(neigh)) if len(neigh) > 0 else 0.0
                    atoms_4[i]["occupancy"] = occ_val
                    occ_values.append(occ_val)
                atoms_5 = atoms_4
            with open("occupancy_results.json", "w") as fh:
                json.dump({"occupancy": occ_values}, fh)
            with open("occupancy_results.csv", "w") as fh:
                fh.write("index,occupancy\\n")
                for i, occ_val in enumerate(occ_values, start=1):
                    fh.write(f"{i},{float(occ_val):.6f}\\n")

            ap.get_structure_stats(atoms_5, Box=box_0, log_file="stats.log")

            print("__NODE_START__:bondAngle_5:5")
            bonded_atoms, bond_idx, angle_idx = ap.bond_angle(
                atoms_5,
                box_0,
                rmaxH=1.2,
                rmaxM=2.45,
                same_element_bonds=True,
                same_molecule_only=True,
                neighbor_element="Na",
                dm_method="direct",
            )
            with open("bonded_terms.log", "w") as fh:
                fh.write("Bonded Terms Report\\n")
                fh.write(f"bonds={len(bond_idx)} angles={len(angle_idx)}\\n")

            print("__NODE_START__:export_6:6")
            ap.write_pdb(bonded_atoms, box_0, "final_system.pdb", write_conect=True, write_element=True)
            ap.write_n2t(bonded_atoms, Box=box_0, n2t_file="final_system.n2t")
            """
        ).strip()

        workflow = {
            "nodes": [
                {"id": "grid_0", "type": "grid"},
                {"id": "atomProps_1", "type": "atomProps"},
                {"id": "coordFrame_2", "type": "coordFrame"},
                {"id": "pbc_3", "type": "pbc"},
                {"id": "analysis_4", "type": "analysis"},
                {"id": "bondAngle_5", "type": "bondAngle"},
                {"id": "export_6", "type": "export"},
            ],
            "edges": [],
        }

        payload = {
            "script": script,
            "workflow": workflow,
            "artifacts": {
                "build_script_full.py": "# full script placeholder\n",
                "build_script_strict_minimal.py": "# strict minimal placeholder\n",
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
                "build_script_full.py",
                "build_script_notebook.ipynb",
                "build_script_strict_minimal.py",
                "build_summary.json",
                "execution_stderr.txt",
                "execution_stdout.txt",
                "workflow.json",
                "com_report.json",
                "cell_vectors.json",
                "rdf_results.json",
                "rdf_results.csv",
                "cn_results.json",
                "cn_results.csv",
                "closest_results.json",
                "closest_results.csv",
                "occupancy_results.json",
                "occupancy_results.csv",
                "stats.log",
                "bonded_terms.log",
                "final_system.pdb",
                "final_system.n2t",
            ]

            missing = [f for f in expected_files if f not in files]
            if missing:
                print("MISSING FILES:", missing)
                return False

            stats_text = zf.read("stats.log").decode("utf-8", errors="replace")
            if "Unique Atom Types" not in stats_text:
                print("INVALID stats.log: missing 'Unique Atom Types'")
                return False

            n2t_text = zf.read("final_system.n2t").decode("utf-8", errors="replace").strip()
            if not n2t_text:
                print("INVALID final_system.n2t: file is empty")
                return False

            for json_name in [
                "com_report.json",
                "cell_vectors.json",
                "rdf_results.json",
                "cn_results.json",
                "closest_results.json",
                "occupancy_results.json",
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
