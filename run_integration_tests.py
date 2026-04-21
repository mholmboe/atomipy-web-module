import subprocess
import time
import requests
import json
import os
import zipfile
import io
import sys

def run_test():
    print("Starting backend server...")
    # Use sys.executable to ensure we use the same environment
    server_process = subprocess.Popen([sys.executable, "app.py"], cwd=".")
    
    # Wait for server to be ready
    max_retries = 10
    url = "http://127.0.0.1:5002/health"
    ready = False
    for i in range(max_retries):
        try:
            r = requests.get(url, timeout=2)
            if r.status_code == 200:
                ready = True
                break
        except:
            pass
        print(f"Waiting for server... ({i+1}/{max_retries})")
        time.sleep(2)
    
    if not ready:
        print("Server failed to start.")
        server_process.terminate()
        return False
    
    try:
        # Prepare Comprehensive Mock Workflow Script
        # This mocks the output of VisualBuilder's generatePythonCode for the new nodes
        script = """
import atomipy as ap
import json
import os
import numpy as np

# 1. Grid Creation
print("__NODE_START__:grid_0:0")
grid_atoms_0, grid_box_0 = ap.create_grid('Na', 0.1, [0, 0, 0, 20, 20, 20])

# 2. Triclinic Box Definition (matching new BoxNode box_dim mode)
print("__NODE_START__:box_1:1")
# Test 9-component Box_dim representation [lx, ly, lz, 0, 0, xy, 0, xz, yz]
# For a 10x10x10 cube with 70.5 deg alpha,beta,gamma
lx, ly, lz = 10.0, 10.0, 10.0
xy, xz, yz = 5.0, 5.0, 5.0
box_dim_9 = [lx, ly, lz, 0.0, 0.0, xy, 0.0, xz, yz]
triclinic_box = box_dim_9
triclinic_atoms = ap.wrap(grid_atoms_0, triclinic_box)

# 3. Cell to Box_dim conversion (matching BoxNode cell mode)
print("__NODE_START__:box_2:2")
cell_params = [15.0, 15.0, 15.0, 90.0, 100.0, 90.0] # Monoclinic
cell_box = ap.Cell2Box_dim(cell_params)
cell_atoms = ap.wrap(triclinic_atoms, cell_box)

# 4. Composite Node: Transform (Bend)
print("__NODE_START__:transform_3:3")
transformed_atoms = ap.bend(cell_atoms, 50)

# 5. Composite Node: PBC (Condense)
print("__NODE_START__:pbc_4:4")
condensed_atoms, condensed_box = ap.condense(transformed_atoms, cell_box)

# 6. Analysis (Extended)
print("__NODE_START__:analysis_5:5")
unwrapped_atoms = ap.unwrap_coordinates(condensed_atoms, condensed_box)
# RDF
r_rdf, g_r = ap.calculate_rdf(unwrapped_atoms, condensed_box, typeA='Na', typeB='Na', rmax=8.0)
with open('rdf_results.json', 'w') as f: 
    json.dump({"bins": r_rdf.tolist(), "rdf": g_r.tolist()}, f)
# Stats
ap.get_structure_stats(unwrapped_atoms, Box=condensed_box, log_file='stats.log')

# 7. Exports
print("__NODE_START__:export_6:6")
ap.write_pdb(unwrapped_atoms, condensed_box, 'final_system.pdb')
ap.write_gro(unwrapped_atoms, condensed_box, 'final_system.gro')
ap.write_poscar(unwrapped_atoms, condensed_box, 'final_system.poscar')
"""
        
        workflow = {
            "nodes": [
                {"id": "grid_0", "type": "grid"}, 
                {"id": "box_1", "type": "box"},
                {"id": "analysis_5", "type": "analysis"}
            ],
            "edges": []
        }
        
        payload = {
            "script": script,
            "workflow": workflow
        }
        
        print("Submitting test workflow...")
        response = requests.post("http://127.0.0.1:5002/api/execute-script", json=payload)
        
        if response.status_code != 200:
            print(f"ERROR: Response status {response.status_code}")
            try:
                zip_data = io.BytesIO(response.content)
                with zipfile.ZipFile(zip_data) as zf:
                    if "execution_stderr.txt" in zf.namelist():
                        print("--- execution_stderr.txt ---")
                        print(zf.read("execution_stderr.txt").decode("utf-8"))
                    if "execution_stdout.txt" in zf.namelist():
                        print("--- execution_stdout.txt ---")
                        print(zf.read("execution_stdout.txt").decode("utf-8"))
            except Exception as e:
                print(f"Could not extract logs from response: {e}")
                print(response.text[:1000])
            return False
            
        print("Download successful. Verifying bundle content...")
        zip_data = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_data) as zf:
            files = zf.namelist()
            print("Files in bundle:", sorted(files))
            
            # Assertions
            expected = [
                'final_system.pdb', 'final_system.gro', 'final_system.poscar',
                'rdf_results.json', 'stats.log', 'execution_stdout.txt', 
                'build_summary.json', 'workflow.json'
            ]
            
            missing = [f for f in expected if f not in files]
            if missing:
                print(f"MISSING FILES: {missing}")
                return False
                
            # Extra validation for Stats log
            stats_content = zf.read('stats.log').decode('utf-8')
            if "Unique Atom Types" not in stats_content:
                print("INVALID STATS LOG: 'Unique Atom Types' not found")
                return False
                
            print("ALL INTEGRATION TESTS PASSED (including new BoxNode & Composite logic)!")
            return True
            
    except Exception as e:
        print(f"Test script error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        print("Terminating backend server...")
        server_process.terminate()
        server_process.wait()

if __name__ == "__main__":
    success = run_test()
    if not success:
        sys.exit(1)
    sys.exit(0)
