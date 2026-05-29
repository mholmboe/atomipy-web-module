import os
import uuid
import zipfile
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from services import (
    simulation_tasks
)

router = APIRouter()

class SimulationParams(BaseModel):
    timestep_fs: float = 2.0
    temperature_K: float = 300.0
    pressure_bar: float = 1.0
    n_steps: int = 500000
    barostat: str = 'isotropic'

class MixRequest(BaseModel):
    min_system: str
    min_ff: str
    smiles_list: List[str]
    n_molecules: List[int]
    organic_ff: str
    targets: List[str]
    run_simulation: bool = False
    simulation_params: Optional[SimulationParams] = None
    generate_cross_terms: bool = False

@router.get("/openff-status")
def get_openff_status():
    """Proxy the status from the openff-worker."""
    import requests
    try:
        worker_url = os.environ.get("OPENFF_WORKER_URL", "http://127.0.0.1:8001")
        resp = requests.get(f"{worker_url}/status", timeout=2)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"available": False, "error": "worker unreachable", "details": str(e)}

@router.get("/jobs/{task_id}/status")
def get_job_status(task_id: str):
    """Poll Celery task status."""
    from celery_app import app as celery_app
    res = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": res.status,
        "result": res.result if res.ready() else None
    }

@router.get("/jobs/{job_id}/files")
def download_job_files(job_id: str):
    """Download job outputs as a ZIP archive."""
    out_dir = f"/tmp/outputs/{job_id}"
    if not os.path.exists(out_dir):
        raise HTTPException(status_code=404, detail="Job not found")
        
    zip_path = f"/tmp/outputs/{job_id}.zip"
    if not os.path.exists(zip_path):
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(out_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, out_dir)
                    zf.write(file_path, arcname)
                    
    from fastapi.responses import FileResponse
    return FileResponse(zip_path, media_type="application/zip", filename=f"{job_id}.zip")

@router.post("/mix")
async def mix_systems(request: MixRequest):
    """
    Deprecated: The standalone /mix endpoint has been superseded by the 
    graph execution engine in execution.py, which uses pure-Python N-way 
    topology merging without GMSO/ParmEd.
    """
    raise HTTPException(
        status_code=501, 
        detail="This endpoint is deprecated. Please use the graph execution engine."
    )
