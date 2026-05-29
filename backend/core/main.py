from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import forcefield, execution

app = FastAPI(title="Atomipy Core Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forcefield.router, prefix="/api/forcefield", tags=["forcefield"])
app.include_router(execution.router, prefix="/api", tags=["execution"])

@app.get("/health")
def health():
    return {"status": "ok"}
