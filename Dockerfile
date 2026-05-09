FROM node:20-alpine AS base

# ── Python layer (shared across stages) ────────────────────────────────────
FROM base AS python-deps
RUN apk add --no-cache python3 py3-pip gcc musl-dev linux-headers libffi-dev
# Install sticker-processing dependencies into /opt/sticker-venv
COPY scripts/requirements-stickers.txt /tmp/requirements-stickers.txt
RUN python3 -m venv /opt/sticker-venv && \
    /opt/sticker-venv/bin/pip install --no-cache-dir -r /tmp/requirements-stickers.txt

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

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Python runtime (alpine packages, no build tools needed in runner)
RUN apk add --no-cache python3

# Copy the pre-built Python venv from the python-deps stage
COPY --from=python-deps /opt/sticker-venv /opt/sticker-venv

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
ENV STICKER_PYTHON_BIN="/opt/sticker-venv/bin/python3"
# Railway mounts a persistent volume at /app/uploads. The volume is owned by
# root, so the container runs as root to guarantee write access for face photos
# and avatars. Sub-dirs are created at startup in case the volume is fresh.
CMD ["sh", "-c", "npx prisma migrate deploy && mkdir -p /app/uploads/players /app/uploads/players/avatars && node server.js"]
