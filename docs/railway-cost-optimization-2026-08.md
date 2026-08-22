# Railway Cost Optimization — August 2026

## Problem

Monthly Railway cost was ~$9.02 despite almost zero activity. The bill was dominated by
**memory charges** ($8.78 / 97%) from four always-on services consuming ~853 MB combined.

## Root Cause

| Service | Memory (24/7) | Purpose | Needed? |
|---|---|---|---|
| courtflow (Next.js) | 256 MB | Main web app | Yes |
| **courtflow-fastapi** | **432 MB** | Background removal (rembg) for stickers | **No** — rarely used |
| **expire-holds-cron** | 31 MB | Fires HTTP cron calls every minute | **No** — can run inside courtflow |
| Postgres | 134 MB | Database | Yes |

`courtflow-fastapi` alone accounted for ~$4.30/month (half the bill) running an idle
Python + ML model (rembg) in RAM 24/7.

## Changes Made

### 1. Stopped `courtflow-fastapi` (saves ~$4.30/month)

- Removed from the `asia-southeast1-eqsg3a` region (0 replicas via Railway agent).
- Sleep mode enabled as a secondary measure.
- The service **is not deleted** — it can be re-enabled by setting replicas back to 1
  whenever sticker generation is needed.
- Sticker processing code (`src/lib/sticker-job-processor.ts`) is unchanged. If a sticker
  job is triggered while the service is down, it will fail gracefully after 3 retries
  and be marked as "failed" in `sticker_job_queue`.

### 2. Stopped `expire-holds-cron` and moved cron into `server.ts` (saves ~$0.30/month)

- The dedicated cron service (`cron/scheduler.mjs`) ran a Node.js process 24/7 just to
  call 4 HTTP endpoints on a schedule. This is now handled by a `setInterval` inside the
  main `server.ts` process (production only).
- Removed from the `asia-southeast1-eqsg3a` region (0 replicas via Railway agent).
- Sleep mode enabled as a secondary measure.
- The cron service **is not deleted** — it can be re-enabled if needed.

Inline cron schedules (unchanged from the original):

| Job | Schedule | Endpoint |
|---|---|---|
| expire-holds | Every minute | `/api/cron/expire-holds` |
| auto-close-sessions | Every hour at :00 | `/api/cron/auto-close-sessions` |
| open-bill-aging | Daily at 02:00 | `/api/cron/open-bill-aging` |
| generate-invoices | Monday at 00:01 | `/api/cron/generate-invoices` |

### 3. No changes to Postgres or the main courtflow service

These are the irreducible minimum to keep the app running.

## Cost Impact

| | Before | After |
|---|---|---|
| courtflow (Next.js) | ~$2.60 | ~$2.60 |
| courtflow-fastapi | ~$4.30 | **$0.00** |
| expire-holds-cron | ~$0.30 | **$0.00** |
| Postgres | ~$1.30 | ~$1.30 |
| Volume + Backup + Egress | ~$0.15 | ~$0.15 |
| CPU | ~$0.11 | ~$0.05 |
| **Total** | **~$9.02** | **~$4.10** |

**Estimated savings: ~55% (~$5/month)**

## How to Re-enable Stopped Services

### courtflow-fastapi (for sticker generation)

In Railway dashboard → courtflow project → courtflow-fastapi service → Settings:
1. Re-add the `asia-southeast1-eqsg3a` region with 1 replica
2. Redeploy

Or via Railway MCP / CLI, set `numReplicas: 1` for the region on service
`ec131284-3ff9-43b8-be1f-b54c0fe67e72`.

### expire-holds-cron (if inline cron is removed)

Same process on service `1c0f9a7c-7c1a-404f-b2c8-c3a047d5f08f`.
If the inline cron in `server.ts` is kept, this service should stay at 0 replicas
to avoid duplicate cron executions.

## Files Changed

- `server.ts` — added inline cron scheduler (production only, fires after server starts)

## Files NOT Changed

- `cron/scheduler.mjs` — kept for reference / rollback, but the service is stopped
- `fastapi/` — kept for reference / rollback, but the service is stopped
- `src/lib/sticker-job-processor.ts` — unchanged, will fail gracefully if fastapi is down
- `src/app/api/admin/players/[playerId]/sticker-photos/process/route.ts` — unchanged
