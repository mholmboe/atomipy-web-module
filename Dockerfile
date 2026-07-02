# =============================================================================
# atomipy web module — unified single-image deployment
#
# One image runs the FastAPI core backend AND serves the built React frontend,
# so there is exactly one process to deploy (Cloud Run) and one command to run
# on Colab. The OpenFF small-molecule worker is a *separate* image/service
# (see docker/Dockerfile.openff); this app reaches it via $OPENFF_WORKER_URL.
# =============================================================================

# --- Stage 1: Build the React frontend ---------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Only the frontend sources (avoids bloat from atomipy/UC_conf data)
COPY src ./src
COPY public ./public
COPY index.html ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY components.json ./
COPY postcss.config.js ./

RUN npm run build

# --- Stage 2: Python backend (conda env via micromamba) ----------------------
FROM mambaorg/micromamba:1.5

# git is occasionally needed by deps; libgl1 satisfies a few transitive libs.
#
# NOTE: we intentionally do NOT install an OpenCL driver (pocl). With no OpenCL
# device present, OpenMM auto-selects its robust native **CPU** platform for
# simulations/energy-minimization (the generated script creates Simulation()
# without an explicit platform). On a GPU host (Colab) the same script picks
# CUDA. Installing pocl here would make OpenMM prefer CPU-OpenCL, whose device
# detection is unreliable inside the Cloud Run sandbox.
USER root
RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    libgl1 && \
    rm -rf /var/lib/apt/lists/*
USER $MAMBA_USER

# Create the atomipy-core environment (openmm, fastapi, atomipy deps, ...). This env
# includes conda-forge `xdrfile` (libxdrfile), so the deployed app can read GROMACS
# .xtc/.trr trajectories: atomipy.xdrfile auto-discovers the shared lib under the env's
# lib dir (no ATOMIPY_XDRFILE needed). .dcd is handled by atomipy's pure-Python reader.
COPY --chown=$MAMBA_USER:$MAMBA_USER envs/atomipy-core.yml /tmp/env.yml
RUN micromamba install -y -n base -f /tmp/env.yml && \
    micromamba clean --all --yes
# Belt-and-suspenders: expose the env's lib dir so the loader (and any child process)
# can also find libxdrfile by SONAME, not only by the prefix glob.
ENV LD_LIBRARY_PATH=/opt/conda/lib:${LD_LIBRARY_PATH}

WORKDIR /app

# Backend code + the in-repo atomipy copy + the built frontend
COPY --chown=$MAMBA_USER:$MAMBA_USER backend/core /app
COPY --chown=$MAMBA_USER:$MAMBA_USER atomipy /app/atomipy
COPY --chown=$MAMBA_USER:$MAMBA_USER --from=frontend-build /app/dist /app/dist

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MALLOC_ARENA_MAX=2 \
    OMP_NUM_THREADS=1 \
    FRONTEND_DIST=/app/dist

# Documentation only; Cloud Run injects $PORT (defaults to 8080).
EXPOSE 8080

# micromamba's entrypoint activates the base env before running this command.
# Shell form so ${PORT} expands at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers ${WEB_CONCURRENCY:-1} --timeout-keep-alive 300"]
