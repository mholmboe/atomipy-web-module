import sys
import os

if os.path.exists("/app") and os.access("/app", os.W_OK):
    BASE_DIR = "/app"
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

sys.path.append(BASE_DIR)

import atomipy as ap
print("atomipy file:", ap.__file__)
print("hasattr:", hasattr(ap, "import_gaff_top"))
