import sys
import atomipy as ap

# Let's test if ap.write_pdb causes this error when atomname/fftype/type is None
atoms = [{'index': 1, 'x': 0, 'y': 0, 'z': 0}]
try:
    ap.write_pdb(atoms, [10,10,10], "test_fail.pdb")
except Exception as e:
    print("Test 1 error:", type(e), e)

atoms2 = [{'index': 1, 'x': 0, 'y': 0, 'z': 0, 'fftype': None}]
try:
    ap.write_pdb(atoms2, [10,10,10], "test_fail2.pdb")
except Exception as e:
    print("Test 2 error:", type(e), e)
