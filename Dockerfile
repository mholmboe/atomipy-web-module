# --- Stage 1: Build the React frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app

# Copy dependency files first for caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Only copy frontend-related source files (avoids bloat from UC_conf/atomipy)
COPY src ./src
COPY public ./public
COPY index.html ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY components.json ./
COPY postcss.config.js ./

# Build the frontend
RUN npm run build

# --- Stage 2: Final image with Python backend ---
FROM python:3.11-slim

# Install git needed for atomipy installation
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install atomipy dependencies (Note: atomipy is copied locally as a folder)
# We rely on requirements.txt for all underlying libraries (numpy, scipy, etc.)

# Copy the built frontend from the first stage
COPY --from=frontend-build /app/dist ./dist

# Copy the backend code and local library/data folders
COPY app.py .
COPY atomipy ./atomipy

# Set environment variables
ENV PORT=5002
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV MALLOC_ARENA_MAX=2
ENV OMP_NUM_THREADS=1

# Expose is documentation only for Cloud Run, but helpful for Render
EXPOSE 5002

# Run the app using gunicorn
# Note: Cloud Run uses $PORT, Render can use $PORT or a fixed one.
# We bind to 0.0.0.0 and the PORT environment variable.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 1 --worker-class gthread --threads 4 --timeout 300 app:app"]
