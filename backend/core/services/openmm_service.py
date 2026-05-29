"""
Run OpenMM simulations directly from GROMACS topology files.
This is the primary simulation path: no conversion required,
since OpenMM's GromacsTopFile reads .top/.gro natively.
"""
import openmm
import openmm.app as app
import openmm.unit as unit
from pathlib import Path


def run_from_gromacs(
        top_path: str,
        gro_path: str,
        output_prefix: str,
        # Integrator settings
        timestep_fs: float = 2.0,
        temperature_K: float = 300.0,
        pressure_bar: float = 1.0,
        # Run length
        n_steps: int = 500_000,          # 1 ns at 2 fs timestep
        output_freq: int = 1_000,        # write every 2 ps
        # Barostat type: 'none', 'isotropic', 'anisotropic', 'flexible'
        barostat: str = 'isotropic',
        # Nonbonded
        nonbonded_cutoff_nm: float = 1.2,
        constraints: str = 'HBonds',
) -> dict:
    """
    Full NVT or NPT simulation from a GROMACS topology + coordinate file.
    Returns paths to trajectory and log files.
    """
    # Load topology
    gro  = app.GromacsGroFile(gro_path)
    top  = app.GromacsTopFile(
        top_path,
        periodicBoxVectors=gro.getPeriodicBoxVectors(),
        includeDir='data/forcefields'   # for #include directives in .top
    )

    # Build system
    constraints_lower = str(constraints).lower()
    constraint_map = {
        'none':     None,
        'hbonds':   app.HBonds,
        'allbonds': app.AllBonds,
    }
    system = top.createSystem(
        nonbondedMethod=app.PME,
        nonbondedCutoff=nonbonded_cutoff_nm * unit.nanometer,
        constraints=constraint_map.get(constraints_lower, app.HBonds),
    )

    # Enable periodic boundaries for bonds, angles, and nonbonded exceptions (critical for periodic mineral systems!)
    for force in system.getForces():
        if force.__class__.__name__ in ('HarmonicBondForce', 'HarmonicAngleForce'):
            force.setUsesPeriodicBoundaryConditions(True)
        elif force.__class__.__name__ == 'NonbondedForce':
            force.setExceptionsUsePeriodicBoundaryConditions(True)

    # Add barostat
    if pressure_bar > 0 and barostat != 'none':
        if barostat == 'isotropic':
            system.addForce(openmm.MonteCarloBarostat(
                pressure_bar * unit.bar,
                temperature_K * unit.kelvin
            ))
        elif barostat == 'anisotropic':
            system.addForce(openmm.MonteCarloAnisotropicBarostat(
                openmm.Vec3(pressure_bar, pressure_bar, pressure_bar)
                    * unit.bar,
                temperature_K * unit.kelvin
            ))
        elif barostat == 'flexible':
            # MonteCarloFlexibleBarostat: allows full triclinic relaxation
            # Appropriate for clay systems where cell shape should relax
            system.addForce(openmm.MonteCarloFlexibleBarostat(
                pressure_bar * unit.bar,
                temperature_K * unit.kelvin
            ))

    # Integrator
    integrator = openmm.LangevinMiddleIntegrator(
        temperature_K * unit.kelvin,
        1.0 / unit.picosecond,          # friction coefficient
        timestep_fs * 0.001 * unit.picosecond
    )

    # Platform: prefer CUDA > OpenCL > CPU
    platform = _best_platform()

    simulation = app.Simulation(
        top.topology, system, integrator, platform
    )
    simulation.context.setPositions(gro.positions)
    simulation.context.setVelocitiesToTemperature(
        temperature_K * unit.kelvin
    )

    # Reporters
    traj_path = f"{output_prefix}.dcd"
    log_path  = f"{output_prefix}.csv"

    simulation.reporters.append(
        app.DCDReporter(traj_path, output_freq)
    )
    simulation.reporters.append(
        app.StateDataReporter(
            log_path, output_freq,
            step=True, time=True,
            potentialEnergy=True, kineticEnergy=True,
            totalEnergy=True, temperature=True,
            volume=True, density=True, progress=True,
            remainingTime=True, speed=True,
            totalSteps=n_steps
        )
    )

    # Energy minimization before production
    simulation.minimizeEnergy(maxIterations=1000)

    # Run
    simulation.step(n_steps)

    return {
        "trajectory": traj_path,
        "log": log_path,
        "n_steps": n_steps,
        "timestep_fs": timestep_fs,
        "total_time_ns": n_steps * timestep_fs / 1e6
    }


def single_point_energy(top_path: str, gro_path: str) -> dict:
    """
    Compute single-point potential energy for validation.
    Used after every mixing operation to detect bad topologies.
    """
    gro  = app.GromacsGroFile(gro_path)
    top  = app.GromacsTopFile(
        top_path,
        periodicBoxVectors=gro.getPeriodicBoxVectors(),
        includeDir='data/forcefields'
    )
    system = top.createSystem(
        nonbondedMethod=app.PME,
        nonbondedCutoff=1.2 * unit.nanometer,
        constraints=None
    )
    integrator = openmm.VerletIntegrator(0.001 * unit.picosecond)
    simulation = app.Simulation(top.topology, system, integrator)
    simulation.context.setPositions(gro.positions)

    state  = simulation.context.getState(getEnergy=True)
    energy = state.getPotentialEnergy().value_in_unit(
        unit.kilojoule_per_mole
    )

    # Breakdown by force group
    components = {}
    for i, force in enumerate(system.getForces()):
        for j, f in enumerate(system.getForces()):
            f.setForceGroup(j)
        state_i = simulation.context.getState(
            getEnergy=True, groups={i}
        )
        components[type(force).__name__] = (
            state_i.getPotentialEnergy()
                   .value_in_unit(unit.kilojoule_per_mole)
        )

    is_sane = -1e8 < energy < 1e7
    return {
        "potential_energy_kJ_mol": energy,
        "components": components,
        "is_sane": is_sane,
        "warning": (
            None if is_sane else
            f"Energy {energy:.2e} kJ/mol out of expected range — "
            f"check atom overlaps and combining rules"
        )
    }


def _best_platform() -> openmm.Platform:
    """Return the fastest available OpenMM platform."""
    for name in ('CUDA', 'OpenCL', 'CPU'):
        try:
            return openmm.Platform.getPlatformByName(name)
        except Exception:
            continue
    return openmm.Platform.getPlatformByName('CPU')
