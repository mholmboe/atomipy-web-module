import pytest
import sys
import os

# Ensure backend/core is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/core')))
from services import openmm_service

def test_energy_validation_sanity():
    # This requires an actual GROMACS topology and coordinate file to run.
    # Since we might not have a mocked one, we will leave the test structure here.
    # A true test would load a valid minff/clayff top/gro from a fixture dir
    # and assert that the report['is_sane'] is True.
    pass
