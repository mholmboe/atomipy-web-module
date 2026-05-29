import pytest
import gmso
import unyt
import sys
import os

# Ensure backend/core is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/core')))
from services import gmso_service
import parmed as pmd

def test_merge_min_organic_connectivity():
    # 1. Create a minimal "mineral" GMSO topology
    min_top = gmso.Topology(name="Mineral")
    site1 = gmso.Site(name="Si1", position=[0, 0, 0] * unyt.nm)
    site2 = gmso.Site(name="O1", position=[0.1, 0, 0] * unyt.nm)
    min_top.add_site(site1)
    min_top.add_site(site2)
    min_bond = gmso.Bond(connection_members=[site1, site2])
    min_top.add_bond(min_bond)
    
    # 2. Create a minimal "organic" ParmEd structure
    org_struct = pmd.Structure()
    org_struct.add_atom(pmd.Atom(name="C1"), "RES", 1)
    org_struct.add_atom(pmd.Atom(name="C2"), "RES", 1)
    org_struct.positions = [[1,1,1], [1.1,1,1]]
    org_struct.bonds.append(pmd.Bond(org_struct.atoms[0], org_struct.atoms[1]))
    
    # 3. Merge them
    box_vectors = [1.0, 1.0, 1.0, 90.0, 90.0, 90.0]
    mixed_top = gmso_service.merge_min_organic(min_top, org_struct, box_vectors)
    
    # 4. Verify contents
    assert mixed_top.n_sites == 4
    assert mixed_top.n_bonds == 2
    
    # 5. Verify connectivity remapping was successful
    # The new bonds should strictly reference sites that are OWNED by mixed_top
    for bond in mixed_top.bonds:
        for member in bond.connection_members:
            assert member in mixed_top.sites, "Bond member points to a site not in the topology! (Orphan reference)"
            
def test_export_amber_gating():
    # AMBER export gating is handled by validation_service.check_export_compatibility
    from services.validation_service import check_export_compatibility, IncompatibleExportFormat
    
    # Mock a topology with MINFF patched angle
    mixed_top = gmso.Topology()
    site1 = gmso.Site(name="A")
    site2 = gmso.Site(name="B")
    site3 = gmso.Site(name="C")
    for s in (site1, site2, site3): mixed_top.add_site(s)
    
    angle = gmso.Angle(connection_members=[site1, site2, site3])
    angle.angle_type = gmso.AngleType()
    angle.angle_type._is_pertriplet_patched = True # MINFF tailored flag
    mixed_top.add_angle(angle)
    
    # GROMACS should pass
    check_export_compatibility(mixed_top, ["gromacs"])
    
    # AMBER should fail
    with pytest.raises(IncompatibleExportFormat):
        check_export_compatibility(mixed_top, ["amber"])
