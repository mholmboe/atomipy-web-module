import os
import sys
import traceback
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(BASE_DIR))
import atomipy as ap
import atomipy.import_conf as ic

def main():
    slab_path = os.path.join(BASE_DIR, "UC_conf", "Pyrophyllite_GII_0.071.pdb")
    atoms, box = ic.import_pdb(slab_path)
    atoms, box, _ = ap.replicate_system(atoms, box, replicate=[6, 4, 1])
    try:
        from atomipy.write_top import itp
        itp(atoms, box, "test_out.itp")
        print("Success without solvation!")
    except Exception as e:
        print("Failed without solvation:")
        traceback.print_exc()

main()
