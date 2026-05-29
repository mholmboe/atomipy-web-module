from celery_app import app
from services import openmm_service

@app.task(bind=True)
def run_simulation_task(self, top_path: str, gro_path: str, output_prefix: str, params: dict):
    """
    Run an OpenMM simulation in the background.
    """
    self.update_state(state='PROGRESS', meta={'status': 'Starting simulation...'})
    
    try:
        result = openmm_service.run_from_gromacs(
            top_path=top_path,
            gro_path=gro_path,
            output_prefix=output_prefix,
            timestep_fs=params.get("timestep_fs", 2.0),
            temperature_K=params.get("temperature_K", 300.0),
            pressure_bar=params.get("pressure_bar", 1.0),
            n_steps=params.get("n_steps", 500000),
            barostat=params.get("barostat", "isotropic"),
        )
        return {"status": "COMPLETED", "result": result}
    except Exception as e:
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise e
