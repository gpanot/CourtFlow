FROM node:20-alpine AS base

# ── Python layer: use Debian (glibc) because onnxruntime has no musl wheels ──
FROM python:3.12-slim AS python-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && rm -rf /var/lib/apt/lists/*
COPY scripts/requirements-stickers.txt /tmp/requirements-stickers.txt
RUN pip install --no-cache-dir -r /tmp/requirements-stickers.txt

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# prisma/schema.prisma must exist before npm ci (postinstall runs prisma generate)
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Runner: Debian-slim for glibc compatibility with onnxruntime ──
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Python runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv libgomp1 && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from the python-deps stage
COPY --from=python-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/dist-packages
COPY --from=python-deps /usr/local/bin/rembg /usr/local/bin/rembg

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist/server.js ./server.js
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/sounds ./sounds
# Copy Python processing scripts
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/uploads/players /app/uploads/players/avatars
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# STICKER_PYTHON_BIN tells the process route which Python to use
ENV STICKER_PYTHON_BIN="/usr/bin/python3"
# PYTHONPATH so the system python3 can find the installed rembg/onnxruntime packages
ENV PYTHONPATH="/usr/local/lib/python3.12/dist-packages"
# Railway mounts a persistent volume at /app/uploads. The volume is owned by
# root, so the container runs as root to guarantee write access for face photos
# and avatars. Sub-dirs are created at startup in case the volume is fresh.
CMD ["sh", "-c", "npx prisma migrate deploy && mkdir -p /app/uploads/players /app/uploads/players/avatars && node server.js"]
