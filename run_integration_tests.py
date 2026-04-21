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
        # 2. Prepare Mock Workflow Script
        script = """
import atomipy as ap
import json
import os

print("__NODE_START__:grid_0:0")
grid_atoms_0, grid_box_0 = ap.create_grid('Na', 0.1, [0, 0, 0, 20, 20, 20])

print("__NODE_START__:bend_1:1")
bend_atoms_1 = ap.bend(grid_atoms_0, 40)

print("__NODE_START__:condense_2:2")
condense_atoms_2, condense_box_2 = ap.condense(bend_atoms_1, grid_box_0)

print("__NODE_START__:analysis_3:3")
unwrapped_atoms_3 = ap.unwrap_coordinates(condense_atoms_2, condense_box_2)
r_rdf, g_r = ap.calculate_rdf(unwrapped_atoms_3, condense_box_2, typeA='Na', typeB='Na', rmax=10.0)
with open('rdf_analysis_3.json', 'w') as f: json.dump({"bins": r_rdf.tolist(), "rdf": g_r.tolist()}, f)

print("__NODE_START__:export_4:4")
ap.write_pdb(unwrapped_atoms_3, condense_box_2, 'system.pdb')
ap.write_gro(unwrapped_atoms_3, condense_box_2, 'system.gro')
ap.write_pqr(unwrapped_atoms_3, condense_box_2, 'system.pqr')
ap.write_poscar(unwrapped_atoms_3, condense_box_2, 'system.poscar')
ap.write_sdf(unwrapped_atoms_3, 'system.sdf')
"""
        
        workflow = {
            "nodes": [{"id": "grid_0", "type": "grid"}, {"id": "analysis_3", "type": "analysis"}],
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
                # Backend returns the zip even on 400 so we can see what failed
                zip_data = io.BytesIO(response.content)
                with zipfile.ZipFile(zip_data) as zf:
                    print("--- execution_stderr.txt ---")
                    print(zf.read("execution_stderr.txt").decode("utf-8"))
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
                'system.pdb', 'system.gro', 
                'system.pqr', 'system.poscar', 'system.sdf',
                'rdf_analysis_3.json', 'execution_stdout.txt', 
                'build_summary.json', 'workflow.json'
            ]
            
            missing = [f for f in expected if f not in files]
            if missing:
                print(f"MISSING FILES: {missing}")
                return False
                
            # Check RDF content
            rdf_content = json.loads(zf.read('rdf_analysis_3.json'))
            if 'rdf' not in rdf_content or 'bins' not in rdf_content:
                print("INVALID RDF CONTENT: keys missing")
                return False
                
            if len(rdf_content['rdf']) == 0:
                print("INVALID RDF CONTENT: rdf list is empty")
                return False
                
            print("ALL INTEGRATION TESTS PASSED!")
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
