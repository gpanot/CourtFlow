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
# Install dbmate + psql for schema migrations at container startup
RUN apk add --no-cache curl postgresql-client && \
    curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/download/v2.33.0/dbmate-linux-amd64 && \
    chmod +x /usr/local/bin/dbmate
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist/server.js ./server.js
COPY --from=builder /app/dist/mcp-handler.js ./mcp-handler.js
COPY --from=builder /app/dist/src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db
COPY --from=builder /app/sounds ./sounds
RUN mkdir -p /app/uploads/players /app/uploads/players/avatars /app/uploads/coaches/photos /app/uploads/proofs /app/uploads/manual-invoices /app/uploads/payment-proofs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Railway mounts a persistent volume at /app/uploads. The volume is owned by
# root, so the container runs as root to guarantee write access for face photos
# and avatars. Sub-dirs are created at startup in case the volume is fresh.
CMD ["sh", "-c", "mkdir -p /app/uploads/players /app/uploads/players/avatars /app/uploads/coaches/photos /app/uploads/proofs /app/uploads/manual-invoices /app/uploads/payment-proofs /app/uploads/signup-duplicates && psql $DATABASE_URL -c \"CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(255) PRIMARY KEY NOT NULL);\" && psql $DATABASE_URL -c \"DELETE FROM schema_migrations WHERE version IN ('20260704000001_baseline','20260704000002_rename_class_pass_to_program_pass');\" && psql $DATABASE_URL -c \"INSERT INTO schema_migrations (version) VALUES ('20260704000001') ON CONFLICT DO NOTHING;\" && psql $DATABASE_URL -c \"DROP TABLE IF EXISTS _prisma_migrations;\" && dbmate migrate && node server.js"]
