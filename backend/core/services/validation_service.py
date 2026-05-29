# NOTE: gmso and parmed are no longer dependencies of the core atomipy stack.
# The gmso-based functions below are legacy stubs kept for reference only.

class IncompatibleCombiningRules(Exception):
    pass

class IncompatibleExportFormat(Exception):
    pass

COMBINING_RULES = {
    "minff":   "lorentz-berthelot",
    "clayff":  "lorentz-berthelot",
    "oplsaa":  "geometric",
    "trappe":  "lorentz-berthelot",
    "gaff":    "lorentz-berthelot",
    "gaff2":   "lorentz-berthelot",
    "sage":    "lorentz-berthelot",
}

def check_combining_rules(min_ff: str, organic_ff: str) -> None:
    """
    Warn or raise when combining rules are incompatible.
    OPLS-AA (geometric) + MINFF (LB) requires explicit cross-terms.
    """
    min_rule    = COMBINING_RULES.get(min_ff,    "lorentz-berthelot")
    organic_rule = COMBINING_RULES.get(organic_ff, "lorentz-berthelot")

    if min_rule != organic_rule:
        raise IncompatibleCombiningRules(
            f"{min_ff} uses {min_rule} combining rules but "
            f"{organic_ff} uses {organic_rule}. "
            f"Explicit nonbond_params cross-terms are required."
        )


def generate_lb_cross_terms(min_itp: dict, organic_itp: dict) -> dict:
    """
    Generate explicit Lorentz-Berthelot cross-terms for OPLS-AA + MINFF.
    Operates on native atomipy itp dicts (atomtypes section).
    Returns a dict suitable for insertion into a GROMACS [nonbond_params] section.
    """
    cross_terms = {}
    def _get_types(itp):
        at = itp.get('atomtypes', {})
        names  = at.get('name', [])
        sigmas = at.get('sigma', [])
        epsilons = at.get('epsilon', [])
        return {n: (float(s), float(e)) for n, s, e in zip(names, sigmas, epsilons)}

    min_types    = _get_types(min_itp)
    organic_types = _get_types(organic_itp)

    for min_name, (min_s, min_e) in min_types.items():
        for org_name, (org_s, org_e) in organic_types.items():
            sigma_ij   = (min_s + org_s) / 2.0
            epsilon_ij = (min_e * org_e) ** 0.5
            cross_terms[(min_name, org_name)] = {"sigma": sigma_ij, "epsilon": epsilon_ij}
    return cross_terms

FORMATS_WITH_TRIPLET_ANGLE_LOSS = {"amber", "namd", "charmm"}
FORCEFIELDS_WITH_PERTRIPLET_ANGLES = {"minff-tailored"}
FORCEFIELDS_K0_ANGLES = {"clayff", "minff-general"}


def has_active_pertriplet_angles(itp: dict) -> bool:
    """
    Return True if the itp dict carries angles with k > 0.
    For native atomipy itp dicts this is a simple heuristic check.
    """
    angles = itp.get('angles', {})
    ks = angles.get('c1', [])  # force constant column
    return any(float(k) > 0.0 for k in ks)


def check_export_compatibility(itp: dict,
                                targets: list) -> None:
    """
    Block AMBER/NAMD/CHARMM export when the topology contains MINFF tailored
    angle terms (k > 0) with per-triplet structural geometry.

    Export routing summary:
    ┌─────────────────────────────┬────────────────────────────────────────┐
    │ System type                 │ AMBER / NAMD / CHARMM allowed?         │
    ├─────────────────────────────┼────────────────────────────────────────┤
    │ CLAYFF only                 │ ✓  k=0 throughout                      │
    │ MINFF general only          │ ✓  k=0 for inorganic angles            │
    │ MINFF tailored (k>0)        │ ✗  per-triplet θ_eq lost in ParmEd    │
    │ MINFF tailored + organic    │ ✗  same                                │
    │ MINFF general + organic     │ ✓                                      │
    │ Pure organic (any FF)       │ ✓                                      │
    └─────────────────────────────┴────────────────────────────────────────┘
    """
    problematic = FORMATS_WITH_TRIPLET_ANGLE_LOSS & set(targets)
    if not problematic:
        return  # no restricted format requested

    if not has_active_pertriplet_angles(itp):
        return  # k=0 system or pure organic — safe to export

    raise IncompatibleExportFormat(
        f"This system contains MINFF tailored angle terms (k > 0) with "
        f"per-triplet equilibrium values derived from the experimental "
        f"crystal structure. The requested format(s) {problematic} store "
        f"angle parameters as type-indexed tables and cannot represent "
        f"structurally distinct angles with the same atom-type triple. "
        f"Geometry-preserving export formats: GROMACS, LAMMPS, OpenMM.\n"
        f"CLAYFF, MINFF general (k=0), and pure organic systems can be "
        f"exported to {problematic} freely."
    )
