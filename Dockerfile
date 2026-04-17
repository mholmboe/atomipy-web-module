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

# Install atomipy from GitHub
RUN pip install git+https://github.com/mholmboe/atomipy.git

# Copy the built frontend from the first stage
COPY --from=frontend-build /app/dist ./dist

# Copy the backend code and local data folders
COPY app.py .
COPY atomipy/ ./atomipy/

# Set environment variables
ENV PORT=5002
ENV FLASK_ENV=production

EXPOSE 5002

# Run the app using gunicorn with threaded workers and 5-min timeout
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5002} --workers 1 --worker-class gthread --threads 4 --timeout 300 app:app"]
