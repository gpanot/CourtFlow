FROM node:20-alpine AS base

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
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist/server.js ./server.js
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/sounds ./sounds
RUN mkdir -p /app/uploads/players /app/uploads/players/avatars
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Railway mounts a persistent volume at /app/uploads. The volume is owned by
# root, so the container runs as root to guarantee write access for face photos
# and avatars. Sub-dirs are created at startup in case the volume is fresh.
CMD ["sh", "-c", "mkdir -p /app/uploads/players /app/uploads/players/avatars && node server.js"]
