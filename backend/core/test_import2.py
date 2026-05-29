import sys
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.append(BASE_DIR)

print("BASE_DIR is:", BASE_DIR)
import atomipy as ap
print("atomipy file:", ap.__file__)
print("hasattr import_gaff_top:", hasattr(ap, "import_gaff_top"))
