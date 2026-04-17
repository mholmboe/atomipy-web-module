# --- Stage 1: Build the React frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# --- Stage 2: Final image with Python backend ---
FROM python:3.11-slim

# Install git needed for atomipy installation
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install atomipy from GitHub to ensure latest version
RUN pip install git+https://github.com/mholmboe/atomipy.git

# Copy the built frontend from the first stage
COPY --from=frontend-build /app/dist ./dist

# Copy the backend code and local data folders
COPY app.py .
COPY UC_conf/ ./UC_conf/
COPY atomipy/ ./atomipy/

# Set environment variables
ENV PORT=5002
ENV FLASK_ENV=production

# Expose the port
EXPOSE 5002

# Run the app using gunicorn for production
# We use the PORT environment variable provided by Render
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5002} app:app"]
