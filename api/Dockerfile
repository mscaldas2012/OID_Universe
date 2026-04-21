FROM python:3.12-slim

# curl for healthcheck; clean apt cache in the same layer
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install dependencies before copying source (layer cache)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# Copy application source
COPY src/ ./src/
COPY alembic.ini ./

# Switch to non-root
USER appuser

EXPOSE 8000

# Run migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port 8000"]
