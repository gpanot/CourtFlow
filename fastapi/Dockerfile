FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 && rm -rf /var/lib/apt/lists/*

COPY fastapi/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY fastapi/main.py .

# Pre-download the birefnet-general model so the first request isn't slow
RUN python3 -c "from rembg import new_session; new_session('birefnet-general')" 2>/dev/null || true

EXPOSE 8000
ENV PORT=8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
