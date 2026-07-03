# CourtFlow — Replit Setup Guide

> **Purpose:** Reconstruct and run the CourtFlow Next.js project in **dev mode** on Replit from scratch, using only this document and the codebase.  
> **Repo:** [github.com/gpanot/CourtFlow](https://github.com/gpanot/CourtFlow)  
> **Last verified against codebase:** July 2026

---

## 1. Project Overview

**CourtFlow** is a real-time pickleball court management platform for venues. It automates player queues, skill-aware court rotations, session lifecycle (open/close, warm-up, end-game), and live TV displays. Staff manage courts from a tablet PWA; players join queues, receive court assignments via push notifications, and can re-queue or take breaks after each game.

Beyond live rotation, CourtFlow includes **CourtPay** (face/phone check-in kiosk, VietQR payments, subscription passes), **AI sticker kiosk** (player photo → generated sticker packs), a public **balance page** (`/my-balance`) for session/subscription status, **CourtPass** player booking portal (court bookings, open play, coach lessons), admin analytics, venue SaaS billing, and staff payroll. One Next.js codebase serves four PWA surfaces: Player, Staff, TV, and Super Admin.

**Target environment for this guide:** Replit running the **custom Express + Next.js dev server** (`npm run dev`) on port **3000**, connected to PostgreSQL (Replit Postgres or external Railway instance).

### Key modules

| Module | Routes / entry | What it does |
|--------|----------------|--------------|
| **Rotation system** | `/staff`, `/tv`, `/api/queue/*`, `/api/courts/*`, `/api/sessions/*` | Queue, groups, court assignments, warm-up, end-game → auto-rotate |
| **Face check-in** | `/admin/courtpay`, `/tv-queue/[venueId]`, `/api/kiosk/*`, `/api/courtpay/*` | AWS Rekognition face match + phone fallback at kiosk/tablet |
| **Sticker kiosk** | `/sticker-kiosk`, `/admin/kiosk-shop`, `/api/kiosk/sticker-*` | AI sticker generation (WaveSpeed/OpenAI), PayOS payment, pack download |
| **CourtPay kiosk** | `src/modules/courtpay/components/CourtPayKiosk.tsx` | Self check-in, packages, VietQR, Sepay webhook confirmation |
| **Balance page** | `/my-balance`, `/api/balance/*` | Player identifies by phone/face; views subscription balance, sticker purchase |
| **CourtPass portal** | `/book/*` (host: `courtpass.*`) | Player bookings, coach credits, open play, OAuth login |
| **Admin** | `/admin/*` | Venues, players, billing, analytics, sticker shop config |
| **Real-time** | Socket.io via `server.ts` | `venue:{id}` and `player:{id}` rooms for live UI updates |

> **Note:** There is no separate “drinks kiosk” in the codebase. “Kiosk shop” (`/admin/kiosk-shop`) is the **sticker commerce** admin panel (pricing, templates, analytics).

---

## 2. Tech Stack

### Core framework

| Technology | Version (from `package.json`) |
|------------|-------------------------------|
| **Next.js** | 16.1.6 (App Router) |
| **React** | 19.2.3 |
| **React DOM** | 19.2.3 |
| **TypeScript** | ^5 |
| **Node.js** | 20.x recommended (matches `Dockerfile`) |

### Custom server & real-time

| Library | Version | Role |
|---------|---------|------|
| **Express** | ^5.1.0 | HTTP server wrapping Next.js |
| **Socket.io** | ^4.8.0 | WebSocket real-time (court/queue/session events) |
| **socket.io-client** | ^4.8.0 | Client-side Socket.io |
| **tsx** | ^4.19.0 | Run `server.ts` in dev without pre-compile |

### Database & ORM

| Library | Version |
|---------|---------|
| **PostgreSQL** | 14+ (hosted on Railway in production; Replit Postgres or local PG for dev) |
| **Prisma** | ^6.5.0 |
| **@prisma/client** | ^6.5.0 |

### UI & state

| Library | Version |
|---------|---------|
| **Tailwind CSS** | ^4 |
| **@tailwindcss/postcss** | ^4 |
| **lucide-react** | ^0.488.0 |
| **zustand** | ^5.0.0 |
| **clsx** | ^2.1.1 |
| **tailwind-merge** | ^3.2.0 |
| **recharts** | ^3.8.1 |
| **@dnd-kit/core** | ^6.3.1 |
| **@dnd-kit/sortable** | ^10.0.0 |
| **@dnd-kit/utilities** | ^3.2.2 |
| **qrcode.react** | ^4.2.0 |

### Auth & security

| Library | Version | Role |
|---------|---------|------|
| **jsonwebtoken** | ^9.0.2 | Staff + player JWT |
| **jose** | ^5.10.0 | Magic-link tokens |
| **bcryptjs** | ^2.4.3 | Staff password hashing |

### External service SDKs

| Library | Version | Service |
|---------|---------|---------|
| **@aws-sdk/client-rekognition** | ^3.1018.0 | Face enrollment & search |
| **@payos/node** | ^2.0.5 | Sticker pack payments (Vietnam) |
| **openai** | ^6.37.0 | AI sticker image edit (`gpt-image-1`) |
| **wavespeed** | ^0.2.3 | Alternative sticker generation pipeline |
| **firebase-admin** | ^13.8.0 | Staff FCM push (mobile app) |
| **web-push** | ^3.6.7 | Player/staff web push (VAPID) |
| **resend** | ^6.14.0 | Transactional email |
| **sharp** | ^0.34.5 | Image processing (thumbnails, stickers) |
| **@modelcontextprotocol/sdk** | ^1.29.0 | MCP server (`POST /mcp`) |

### i18n & utilities

| Library | Version |
|---------|---------|
| **i18next** | ^25.10.9 |
| **react-i18next** | ^16.6.5 |
| **i18next-browser-languagedetector** | ^8.2.1 |
| **date-fns-tz** | ^3.2.0 |
| **adm-zip** | ^0.5.17 |
| **archiver** | ^8.0.0 |

### Dev & test

| Library | Version |
|---------|---------|
| **eslint** | ^9 |
| **eslint-config-next** | 16.1.6 |
| **vitest** | ^3.2.4 |
| **@vitest/coverage-v8** | ^3.2.4 |
| **@testing-library/react** | ^16.3.2 |
| **jsdom** | ^27.0.1 |
| **dotenv** | ^16.6.1 |

### External APIs & services (not npm packages)

| Service | Used for | Config |
|---------|----------|--------|
| **AWS Rekognition** | Face enrollment, kiosk check-in, duplicate detection | `AWS_*` env vars |
| **VietQR** (`img.vietqr.io`) | Static QR image URLs for bank transfers | Venue bank BIN/account in DB; no API key |
| **SePay** | Webhook auto-confirmation of VietQR bank transfers | `SEPAY_WEBHOOK_SECRET`, webhook at `/api/webhooks/sepay` |
| **PayOS** | Sticker pack online payment | `PAYOS_*` env vars |
| **WaveSpeed** | AI sticker generation | `WAVESPEED_API_KEY` |
| **OpenAI** | Sticker `images.edit` fallback | `OPENAI_API_KEY` |
| **FapiHub** | Background removal / blur on registration photos | `FAPIHUB_API_KEY` |
| **Resend** | Booking/lesson confirmation emails | `RESEND_API_KEY` |
| **DeepSeek** | Admin AI chat widget | `DEEPSEEK_API_KEY` |
| **Google OAuth** | CourtPass login + coach Google Calendar sync | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Apple OAuth** | CourtPass Apple login | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` |
| **Firebase Admin** | Staff mobile push notifications | `FIREBASE_SERVICE_ACCOUNT_JSON` (single JSON blob) |
| **Reclub API** | Roster import (`api.reclub.co`) | Hard-coded club list + public API headers in `src/lib/reclub.ts` |
| **ThumbmarkJS** | Staff login device fingerprinting | `THUMBMARKJS_API_KEY` |

### Railway-specific config

| File / setting | Purpose |
|----------------|---------|
| `railway.toml` | `releaseCommand = "npx prisma migrate deploy"` before traffic switch |
| `Dockerfile` | Production build: `npm ci` → `next build` → `node dist/server.js` |
| `RAILWAY_PUBLIC_DOMAIN` | Auto-set; used for QR URLs, sticker image reachability |
| `RAILWAY_GIT_COMMIT_SHA` | Build ID for cache busting |
| Persistent volume at `/app/uploads` | Face photos, payment proofs (production only) |

**Auth note:** OAuth is implemented via **custom routes** under `src/app/api/auth/` — there is **no** `next-auth` package in `package.json`.

### Mobile (out of scope for Replit dev, but in repo)

`mobile/` is a separate **React Native / Expo** app mirroring staff CourtPay flows. It is **not** required to run the Next.js PWA on Replit.

---

## 3. Folder Structure

Annotated tree of the **Next.js web app** (excluding `node_modules`, `.next`, `dist`, `mobile/android` build artifacts):

```
CourtFlow/
├── server.ts                    # Dev/prod entry: Express + Socket.io + Next.js handler
├── mcp-handler.ts               # MCP bearer-protected coach-availability tools (POST /mcp)
├── instrumentation.ts           # Next.js startup hook (queue status recovery)
├── next.config.ts               # Standalone output, CourtPass host rewrites, dev CSP
├── tsconfig.json                # Next.js / app TypeScript config
├── tsconfig.server.json         # Compiles server.ts + selected lib files → dist/
├── vitest.config.ts             # Unit test config
├── railway.toml                 # Railway deploy: migrate on release
├── Dockerfile                   # Production container (Node 20 Alpine)
├── package.json                 # Dependencies and scripts
├── package-lock.json            # Lockfile (commit with package.json)
│
├── prisma/
│   ├── schema.prisma            # ★ Source of truth for all DB models (PostgreSQL)
│   ├── seed.ts                  # Demo venue, courts, superadmin + staff accounts
│   └── migrations/              # 50+ timestamped SQL migration folders
│
├── public/                      # Static PWA assets (manifest, icons, sounds refs)
│   ├── manifest.json            # Staff/player PWA manifest
│   └── manifest-tv.json         # TV display manifest
│
├── uploads/                     # Runtime file storage (gitignored; created on boot)
│   ├── players/                 # Face photos, avatars
│   ├── proofs/                  # Payment proof uploads
│   └── coaches/photos/          # Coach profile photos
│
├── sounds/                      # UI sound effects served by /api/sounds/*
│
├── scripts/                     # Ops / dev utilities (not run in normal dev)
│   ├── seed-bots.ts             # Simulate player check-ins via HTTP
│   ├── seed-demo.ts             # Rich demo data (bookings, lessons) for existing venue
│   ├── reenroll-mock-players.ts # Re-index faces in AWS Rekognition
│   └── verify-groups-not-split.ts
│
├── cron/
│   └── sticker-worker.mjs       # External cron: polls sticker job queue endpoint
│
├── docs/                        # Feature docs (billing, face recognition, CourtPay, etc.)
│
├── src/
│   ├── middleware.ts            # Site gate, CourtPass /book redirect on main domain
│   │
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # Landing → onboarding or /staff redirect
│   │   ├── layout.tsx           # Root layout, fonts, providers
│   │   ├── gate/page.tsx        # Site password gate UI
│   │   ├── signup/page.tsx      # Superadmin self-signup (password-gated)
│   │   ├── my-balance/          # Public balance + sticker purchase flow
│   │   │   ├── page.tsx         # identify → venue pick → balance screen
│   │   │   ├── IdentifyState.tsx
│   │   │   └── BalanceScreen.tsx
│   │   │
│   │   ├── (admin)/admin/       # Super Admin / Manager panel (~25 pages)
│   │   │   ├── layout.tsx       # Sidebar nav, role-based access
│   │   │   ├── page.tsx         # Overview dashboard
│   │   │   ├── venues/          # Venue CRUD
│   │   │   ├── players/         # CourtFlow player roster + face photos
│   │   │   ├── courtpay/        # CourtPay kiosk preview + settings
│   │   │   ├── courtpay-players/
│   │   │   ├── courtpay-billing/
│   │   │   ├── kiosk-shop/      # Sticker shop admin (pricing, templates, analytics)
│   │   │   ├── bookings/        # Court booking management
│   │   │   ├── coaching/        # Coach packages & lessons
│   │   │   └── ...
│   │   │
│   │   ├── (staff)/staff/       # Staff PWA
│   │   │   ├── page.tsx         # Staff home (sessions, CourtPay, sticker kiosk links)
│   │   │   ├── session/[sessionId]/  # Live session: courts, queue, payments
│   │   │   ├── dashboard/boss/  # Venue owner revenue dashboard
│   │   │   ├── subscriptions/   # Subscription management + balance link share
│   │   │   └── profile/         # Staff profile, Reclub club, push prefs
│   │   │
│   │   ├── (player)/player/     # Player PWA (queue, notifications)
│   │   │
│   │   ├── (tv)/                # TV & kiosk full-screen UIs
│   │   │   ├── tv/              # Court rotation TV display
│   │   │   ├── tv-queue/        # TV queue join + face check-in kiosk
│   │   │   └── sticker-kiosk/   # AI sticker dispensing kiosk
│   │   │
│   │   ├── (book)/book/         # CourtPass player booking portal
│   │   │   ├── intro/           # Landing for courtpass host
│   │   │   ├── login/           # Email + OAuth
│   │   │   ├── bookings/        # My bookings
│   │   │   ├── coaches/         # Coach browse & credit purchase
│   │   │   ├── open-play/       # Open play registration
│   │   │   └── account/         # Profile, credits, venue link
│   │   │
│   │   └── api/                 # ~283 REST API route handlers
│   │       ├── admin/           # Admin CRUD, analytics, stickers, billing
│   │       ├── auth/            # Staff login, OTP, OAuth callbacks
│   │       ├── balance/         # /my-balance identify + data
│   │       ├── courtpay/        # Check-in, packages, boss dashboard
│   │       ├── courts/          # Court state, end-game, warmup
│   │       ├── cron/            # Scheduled jobs (Bearer CRON_SECRET)
│   │       ├── kiosk/           # Face check-in + sticker kiosk APIs
│   │       ├── public/          # CourtPass unauthenticated/authed APIs
│   │       ├── queue/           # Queue join, groups, walk-ins
│   │       ├── sessions/        # Session open/close, stats
│   │       ├── staff/           # Payments, push, boss billing
│   │       ├── webhooks/        # payos, sepay
│   │       └── ...
│   │
│   ├── components/              # Shared React components
│   │   ├── admin/               # Admin modals, tables, sticker tabs
│   │   ├── balance/             # Balance page UI pieces
│   │   ├── rotation/            # Court rotation UI
│   │   ├── queue/               # Queue list, group chips
│   │   ├── courtpay/            # CourtPay-specific wrappers
│   │   ├── staff-dashboard/     # Staff session UI
│   │   └── ui/                  # Buttons, modals, form primitives
│   │
│   ├── modules/
│   │   └── courtpay/            # CourtPay feature module
│   │       ├── components/CourtPayKiosk.tsx   # Main check-in kiosk UI
│   │       └── lib/sepay.ts, payment-reference.ts
│   │
│   ├── lib/                     # Server + shared business logic
│   │   ├── db.ts                # Prisma singleton
│   │   ├── auth.ts              # Staff JWT verify/sign
│   │   ├── face-recognition.ts  # AWS Rekognition + mock fallback
│   │   ├── vietqr.ts            # VietQR URL builder + bank list
│   │   ├── payos.ts             # PayOS client
│   │   ├── push.ts              # Web push (VAPID)
│   │   ├── staff-push.ts        # Firebase Admin FCM
│   │   ├── email/               # Resend client + templates
│   │   ├── reclub.ts            # Reclub API client + club list
│   │   └── sticker-job-processor.ts
│   │
│   ├── stores/                  # Zustand stores (session, venue, locale)
│   ├── hooks/                   # React hooks (socket, auth, venue)
│   ├── contexts/                # React context providers
│   ├── config/clients.ts        # CourtFlow vs CourtPay PWA skin selection
│   └── i18n/                    # en/vi/th locale JSON files
│
└── mobile/                      # React Native Expo app (separate deploy)
    ├── App.tsx
    └── src/screens/             # Staff tablet, CourtPay check-in, coach portal
```

---

## 4. Environment Variables

Copy this block to Replit **Secrets** (or a local `.env` file). Values marked **Required** must be set for a working dev server. Others have dev fallbacks or can be skipped.

```dotenv
# ─── Core (REQUIRED for dev) ───────────────────────────────────────────────
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/courtflow"   # Required
JWT_SECRET="generate-a-random-32+-char-string"                  # Required (staff JWT)
NODE_ENV="development"                                          # Required
PORT="3000"                                                     # Optional (default 3000)

# ─── App URLs (set on Replit) ──────────────────────────────────────────────
APP_URL="https://YOUR-REPL-NAME.YOUR-USERNAME.repl.co"         # Recommended — QR links, upload proxy
NEXT_PUBLIC_WEBSOCKET_URL="wss://YOUR-REPL-NAME.YOUR-USERNAME.repl.co"  # Recommended — Socket.io client
NEXT_PUBLIC_VENUE_ID="demo-venue-1"                           # Recommended — matches prisma seed
# COURTFLOW_VENUE_ID="demo-venue-1"                           # Optional alias for scripts

# ─── Site gate (optional in dev — leave OFF) ─────────────────────────────────
SITE_GATE_ENABLED="false"                                       # Optional — "true" locks entire app
# SITE_PASSWORD="CourtFlow2026!"                                # Optional — default if unset

# ─── AWS Rekognition (optional in dev — uses MOCK without keys) ──────────────
AWS_ACCESS_KEY_ID=""                                            # Optional in dev
AWS_SECRET_ACCESS_KEY=""                                        # Optional in dev
AWS_REGION="ap-southeast-1"                                     # Optional (default ap-southeast-1)
AWS_REKOGNITION_COLLECTION="courtflow-players-staging"          # Optional — use *-staging in dev
# AWS_REKOGNITION_FACE_MATCH_THRESHOLD="85"                       # Optional (default 85 in code)

# ─── Background removal (optional) ───────────────────────────────────────────
FAPIHUB_API_KEY=""                                              # Optional — skip bg removal if empty

# ─── Web Push / VAPID (optional — push disabled without) ─────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""                                 # Optional
VAPID_PRIVATE_KEY=""                                            # Optional
# Generate: npx web-push generate-vapid-keys

# ─── SePay webhook (optional in dev) ─────────────────────────────────────────
SEPAY_WEBHOOK_SECRET=""                                         # Optional in dev
SEPAY_SKIP_VALIDATION="true"                                    # Recommended for local/Replit dev

# ─── PayOS sticker payments (optional) ───────────────────────────────────────
PAYOS_CLIENT_ID=""                                              # Optional
PAYOS_API_KEY=""                                                # Optional
PAYOS_CHECKSUM_KEY=""                                           # Optional

# ─── AI stickers (optional) ──────────────────────────────────────────────────
OPENAI_API_KEY=""                                               # Optional
WAVESPEED_API_KEY=""                                            # Optional
STICKER_KIOSK_SECRET="dev-kiosk-secret-change-me"               # Optional — kiosk API auth header

# ─── Email (optional) ────────────────────────────────────────────────────────
RESEND_API_KEY="re_placeholder"                                 # Optional

# ─── CourtPass / player portal OAuth (optional for core CourtFlow dev) ───────
NEXT_PUBLIC_COURTPASS_URL="http://courtpass.localhost:3000"     # Optional — local CourtPass host
AUTH_SECRET=""                                                  # Optional — OAuth state signing
GOOGLE_CLIENT_ID=""                                             # Optional
GOOGLE_CLIENT_SECRET=""                                         # Optional
# APPLE_CLIENT_ID="com.courtflow.web"                           # Optional
# APPLE_CLIENT_SECRET=""                                        # Optional — JWT from .p8 key

# ─── Player JWT (optional — falls back to JWT_SECRET) ────────────────────────
# PLAYER_JWT_SECRET=""                                          # Optional

# ─── Firebase staff push (optional) ──────────────────────────────────────────
# FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'  # Optional — full JSON blob

# ─── Cron / internal secrets (optional in dev) ───────────────────────────────
# CRON_SECRET=""                                                # Optional — protects /api/cron/*
# INTERNAL_CRON_SECRET=""                                       # Optional — sticker queue processor
# MCP_SERVER_SECRET=""                                          # Optional — POST /mcp (open in dev if unset)

# ─── Misc integrations (optional) ────────────────────────────────────────────
# DEEPSEEK_API_KEY=""                                           # Optional — admin AI chat
# THUMBMARKJS_API_KEY=""                                        # Optional — staff login fingerprinting
# NEXT_PUBLIC_CLIENT_ID="courtflow_default"                     # Optional — force PWA skin locally

# ─── HTTPS local dev only (not needed on Replit) ─────────────────────────────
# HTTPS="true"
# SSL_CRT_FILE="./certs/cert.pem"
# SSL_KEY_FILE="./certs/key.pem"

# ─── Bot/simulation scripts (not needed for normal dev) ──────────────────────
# COURTFLOW_BASE_URL="http://localhost:3000"
# COURTFLOW_GATE_COOKIE="cf-site-access=granted"
# COURTFLOW_BOT_MEN_PERCENT=60

# ─── Railway auto-injected (do NOT set manually on Replit) ───────────────────
# RAILWAY_PUBLIC_DOMAIN=
# RAILWAY_GIT_COMMIT_SHA=
# RAILWAY_DEPLOYMENT_ID=
```

### Variable reference

| Variable | Required (dev) | Purpose |
|----------|----------------|---------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string for Prisma |
| `JWT_SECRET` | **Yes** | Signs staff session tokens |
| `NODE_ENV` | **Yes** | `development` enables mock face recognition, relaxed CSP |
| `PORT` | No | Server listen port (default `3000`) |
| `APP_URL` | Recommended | Public base URL for QR codes, calendar ICS, upload proxy |
| `NEXT_PUBLIC_WEBSOCKET_URL` | Recommended | Socket.io client endpoint (`ws://` or `wss://`) |
| `NEXT_PUBLIC_VENUE_ID` | Recommended | Default venue for TV/kiosk when not selected in UI |
| `SITE_GATE_ENABLED` | No | `true` = password wall on every page |
| `SITE_PASSWORD` | No | Site gate + signup password (default `CourtFlow2026!`) |
| `AWS_*` | No | Without keys, face recognition runs in **mock mode** |
| `SEPAY_SKIP_VALIDATION` | No | `true` = accept SePay webhooks without secret (dev only) |
| `SEPAY_WEBHOOK_SECRET` | No | HMAC validation for `/api/webhooks/sepay` |
| `PAYOS_*` | No | Sticker pack PayOS checkout |
| `OPENAI_API_KEY` / `WAVESPEED_API_KEY` | No | AI sticker generation |
| `STICKER_KIOSK_SECRET` | No | Shared secret for `/api/kiosk/*` sticker endpoints |
| `NEXT_PUBLIC_VAPID_*` / `VAPID_PRIVATE_KEY` | No | Browser web push |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | Staff mobile FCM push |
| `RESEND_API_KEY` | No | Booking confirmation emails |
| `GOOGLE_*` / `APPLE_*` | No | CourtPass OAuth only |
| `AUTH_SECRET` | No | OAuth CSRF/state tokens |
| `NEXT_PUBLIC_COURTPASS_URL` | No | CourtPass custom domain for rewrites |
| `CRON_SECRET` | No | Bearer auth for `/api/cron/*` |
| `INTERNAL_CRON_SECRET` | No | Sticker queue worker endpoint |
| `MCP_SERVER_SECRET` | No | Bearer auth for `POST /mcp` |
| `DEEPSEEK_API_KEY` | No | Admin AI chat widget |
| `FAPIHUB_API_KEY` | No | Photo background removal |
| `THUMBMARKJS_API_KEY` | No | Staff login device fingerprint API |

---

## 5. Database Setup

### Source of truth

The complete schema lives in **`prisma/schema.prisma`** (~1,400 lines). Apply it with:

```bash
npx prisma generate
npx prisma migrate deploy    # production / fresh DB
# OR for quick local schema sync without migration history:
npx prisma db push
```

Migration files: `prisma/migrations/` (50+ folders, chronological).

### PostgreSQL connection

**Option A — Replit Postgres (recommended on Replit)**

1. In Replit: **Tools → Database → PostgreSQL**
2. Copy the connection string into `DATABASE_URL`
3. Replit Postgres is reachable from the same repl without external networking

**Option B — Railway PostgreSQL (shared with production)**

1. Railway dashboard → your Postgres service → **Connect** → copy `DATABASE_URL`
2. Paste into Replit Secrets
3. ⚠️ You will share data with production/staging — use only for read-only exploration or a dedicated staging DB

**Option C — Local PostgreSQL in Replit shell**

```bash
# If using Nix PostgreSQL (see replit.nix below)
createdb courtflow
export DATABASE_URL="postgresql://postgres@localhost:5432/courtflow"
```

### Seed data (required for dev login)

```bash
npx prisma db seed
```

This creates (from `prisma/seed.ts`):

| Entity | ID / identifier | Notes |
|--------|-----------------|-------|
| **Venue** | `demo-venue-1` | "Downtown Pickleball Club", 6 courts (A–F) |
| **Courts** | `demo-court-court-a` … `demo-court-court-f` | Status `idle` |
| **Super Admin** | Phone `+10000000000` | Password `Cf!Adm1n#2026xQ9`, role `superadmin` |
| **Staff** | Phone `+10000000001` | Password `Cf!Staff#2026mR7`, role `staff` |

Set `NEXT_PUBLIC_VENUE_ID=demo-venue-1` to match.

**Optional richer demo** (requires existing venue with players):

```bash
npx tsx scripts/seed-demo.ts
```

### Schema summary — all tables

Prisma maps models to snake_case SQL tables via `@@map()`. Below: model name → SQL table → key columns.

#### Enums

`SkillLevel`, `Gender`, `CourtStatus`, `GameType`, `SessionStatus`, `SessionType`, `CourtBlockType`, `QueueStatus`, `GroupStatus`, `GamePreference`, `StaffRole`, `PlayerAppAuthMethod`, `PaymentStatus`, `MembershipStatus`, `MembershipPaymentStatus`, `BookingStatus`, `SubscriptionStatus`, `LessonType`, `CoachLessonStatus`

#### Core venue & sessions

| Model | Table | Key fields |
|-------|-------|------------|
| `Organization` | `organizations` | id, name, slug (unique), country, payment_region, currency |
| `Venue` | `venues` | id, name, slug, settings (JSON), organization_id, owner_id, timezone, bank_*, contact_*, portal_enabled, sport_type |
| `Court` | `courts` | id, venue_id, label, status, active_in_session, is_bookable, skip_warmup_after_maintenance |
| `Session` | `sessions` | id, venue_id, staff_id, status, type, warmup_mode, intro_warmup_complete, reclub_* JSON fields |
| `QueueEntry` | `queue_entries` | session_id, player_id, group_id, status, break_until, queue_number — unique(session_id, player_id) |
| `PlayerGroup` | `player_groups` | session_id, code, status — unique(session_id, code) |
| `CourtAssignment` | `court_assignments` | court_id, session_id, player_ids[], group_ids[], game_type, is_warmup, started_at, ended_at |
| `PlayerRanking` | `player_rankings` | player_id, court_id, session_id, staff_id, position, score_delta |
| `AuditLog` | `audit_logs` | venue_id, staff_id, action, target_id, metadata (JSON) |

#### People

| Model | Table | Key fields |
|-------|-------|------------|
| `PlayerIdentity` | `player_identities` | Unified identity linking portal + CourtPay players |
| `Player` | `players` | phone (unique), face_subject_id, face_photo_path, ranking_score, registration_venue_id |
| `StaffMember` | `staff_members` | phone (unique), password_hash, role, is_coach, google_refresh_token, reclub_group_id |
| `StaffVenueAssignment` | `staff_venue_assignments` | staff_id, venue_id, app_access[] — unique(staff_id, venue_id) |
| `PlayerAccount` | `player_accounts` | OAuth/email credentials for CourtPass |
| `PlayerAppAuthLog` | `player_app_auth_logs` | Login method audit |
| `PushSubscription` | `push_subscriptions` | Web push endpoints per player |
| `StaffPushToken` | `staff_push_tokens` | FCM tokens per staff |
| `StaffAuthLog` | `staff_auth_logs` | Login IP, fingerprint, VPN flags |
| `OtpCode` | `otp_codes` | Phone OTP for player login |

#### Payments & face

| Model | Table | Key fields |
|-------|-------|------------|
| `PendingPayment` | `pending_payments` | venue_id, session_id, amount, payment_ref (unique), type, status, party_count |
| `FaceAttempt` | `face_attempts` | Kiosk check-in attempts, confidence, phone fallback |
| `FaceRecognitionLog` | `face_recognition_logs` | Live match scores for threshold tuning |
| `PlayerCustomPrice` | `player_custom_prices` | Per-player staff discounts |
| `SignupDuplicateLog` | `signup_duplicate_logs` | Face duplicate during registration |

#### Bookings & scheduling

| Model | Table | Key fields |
|-------|-------|------------|
| `Booking` | `bookings` | court_id, player_id, date, start/end_time, payment_ref (unique), hold_expires_at |
| `CourtBlock` | `court_blocks` | Blocked court time slots |
| `OpenPlayRegistration` | `open_play_registrations` | Open play slot sign-ups |

#### Memberships

| Model | Table | Key fields |
|-------|-------|------------|
| `MembershipTier` | `membership_tiers` | venue_id, price_value, sessions_included |
| `Membership` | `memberships` | player_id, venue_id, tier_id, status — unique(player_id, venue_id) |
| `MembershipPayment` | `membership_payments` | Period billing per membership |

#### Coaching

| Model | Table | Key fields |
|-------|-------|------------|
| `CoachPackage` | `coach_packages` | coach_id, venue_id, lesson_type, price_value, min/max_players |
| `CoachLesson` | `coach_lessons` | Scheduled lessons, payment_ref, google_event_id |
| `CoachAvailability` | `coach_availabilities` | Weekly slots |
| `CoachHoliday` | `coach_holidays` | Date ranges |
| `PlayerCoachCredit` | `player_coach_credits` | Prepaid session credits |
| `CreditTransaction` | `credit_transactions` | Credit usage ledger |
| `PlayerMagicToken` | `player_magic_tokens` | One-time login tokens |
| `EmailLog` | `email_logs` | Resend delivery audit |
| `PlayerNote` | `player_notes` | Staff notes per player per venue |

#### CourtPay check-in

| Model | Table | Key fields |
|-------|-------|------------|
| `CheckInPlayer` | `check_in_players` | phone + venue_id (unique) |
| `SubscriptionPackage` | `subscription_packages` | Pass definitions (sessions/days, price) |
| `PlayerSubscription` | `player_subscriptions` | Active passes |
| `SubscriptionUsage` | `subscription_usages` | Check-in consumption log |
| `CheckInRecord` | `check_in_records` | Individual check-in events |

#### SaaS billing (venues pay CourtFlow)

| Model | Table | Key fields |
|-------|-------|------------|
| `BillingConfig` | `billing_config` | Global defaults (singleton id=`default`) |
| `VenueBillingRate` | `venue_billing_rates` | Per-venue rates, monthly vs per_payment model |
| `BillingInvoice` | `billing_invoices` | Weekly/monthly invoices |
| `BillingLineItem` | `billing_line_items` | Per-check-in line items |
| `ManualBillingInvoice` | `manual_billing_invoices` | Manual PDF invoices |

#### Payroll

| Model | Table | Key fields |
|-------|-------|------------|
| `StaffPayment` | `staff_payments` | Weekly host payroll — unique(staff_id, week_start) |

#### Stickers & kiosk

| Model | Table | Key fields |
|-------|-------|------------|
| `PlayerStickerPhoto` | `player_sticker_photos` | Source photos — unique(player_id, slot_index) |
| `PlayerStickerResult` | `player_sticker_results` | Generated AI images |
| `PlayerStickerPack` | `player_sticker_packs` | 4-sticker packs, payment_code, payos_order_code |
| `StickerPaymentLog` | `sticker_payment_logs` | PayOS confirmation log |
| `StickerSession` | `sticker_sessions` | Kiosk session tokens |
| `StickerTemplate` | `sticker_templates` | Male/female AI prompts |
| `StickerJobQueue` | `sticker_job_queue` | Async generation queue |
| `KioskSettings` | `kiosk_settings` | Global sticker price, bank, chroma key (singleton) |
| `KioskDevice` | `kiosk_devices` | Registered kiosk devices |

#### Indexes (high-traffic)

Notable indexes beyond PKs: `venues(organization_id)`, `players(registration_venue_id)`, `queue_entries` unique session+player, `pending_payments(venue_id, status)`, `check_in_records(venue_id, checked_in_at)`, `billing_invoices(venue_id, status)`, `sticker_job_queue(status, created_at)`, `face_recognition_logs(venue_id, created_at)`.

For exact column types and constraints, always read `prisma/schema.prisma`.

---

## 6. Replit-Specific Setup Steps

### Step 1 — Import the repo

1. Go to [replit.com](https://replit.com) → **Create Repl**
2. Choose **Import from GitHub**
3. URL: `https://github.com/gpanot/CourtFlow`
4. Template: **Node.js** (20.x if selectable)
5. Click **Import**

### Step 2 — Create `.replit` and `replit.nix`

These files are **not** in the repo today. Create them at the project root:

**`.replit`**

```ini
run = "npm run dev"
entrypoint = "src/app/page.tsx"
hidden = ["node_modules", ".next", "dist"]
modules = ["nodejs-20"]

[nix]
channel = "stable-24_05"

[deployment]
run = ["sh", "-c", "npm run build && npm run start"]
build = ["npm", "run", "build"]

[[ports]]
localPort = 3000
externalPort = 80

[env]
PORT = "3000"
```

**`replit.nix`** (optional — adds PostgreSQL client tools)

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.postgresql
  ];
}
```

### Step 3 — Install dependencies

In the Replit shell:

```bash
npm install
```

`postinstall` runs `prisma generate` automatically.

> **Do not** use `npm install --legacy-peer-deps` — it can produce incomplete lockfiles.

### Step 4 — Configure Secrets

In Replit: **Tools → Secrets** (lock icon). Add at minimum:

| Secret | Example value |
|--------|---------------|
| `DATABASE_URL` | Your Postgres connection string |
| `JWT_SECRET` | `openssl rand -base64 32` output |
| `NODE_ENV` | `development` |
| `NEXT_PUBLIC_VENUE_ID` | `demo-venue-1` |
| `APP_URL` | Your repl's public URL (see below) |
| `NEXT_PUBLIC_WEBSOCKET_URL` | Same URL but `wss://` instead of `https://` |
| `SEPAY_SKIP_VALIDATION` | `true` |
| `SITE_GATE_ENABLED` | `false` |

**Finding your Replit URL:** After first run, Replit shows `https://<repl-name>.<username>.repl.co`. Use that for `APP_URL`.

### Step 5 — Initialize the database

```bash
npx prisma migrate deploy
npx prisma db seed
```

If migrations fail on a brand-new empty DB, try:

```bash
npx prisma db push
npx prisma db seed
```

### Step 6 — Run the dev server

```bash
npm run dev
```

**Important:** Use `npm run dev` (runs `tsx server.ts`), **not** `npm run dev:next`. The custom Express server is required for:

- Socket.io WebSockets
- Static `/uploads` serving
- MCP endpoint at `POST /mcp`

The server binds to **`0.0.0.0:3000`** (see `server.ts`).

Open the Replit webview or your repl URL. Default flow:

1. Landing page → onboarding (first visit) or redirect to `/staff`
2. Staff login: phone `+10000000000`, password `Cf!Adm1n#2026xQ9`
3. Admin: navigate to `/admin`

### Step 7 — Replit / Next.js gotchas

| Issue | Fix |
|-------|-----|
| **Port binding** | Server already uses `0.0.0.0` and `PORT` env — Replit maps port 3000 automatically |
| **`NEXT_PUBLIC_*` vars** | In dev, Next.js reads them at runtime. After changing Secrets, **restart** the repl |
| **WebSocket failures** | Set `NEXT_PUBLIC_WEBSOCKET_URL` to `wss://<your-repl-url>` (no trailing slash) |
| **Camera / face on webview** | Replit webview may block camera — test on external browser or use phone fallback |
| **Uploads ephemeral** | `uploads/` is wiped on repl restart unless you use Replit Object Storage or external S3 — face photos won't persist across repl cycles |
| **Sharp native binary** | `npm install` on Replit usually works; if sharp fails, run `npm rebuild sharp` |
| **CourtPass local testing** | Add `127.0.0.1 courtpass.localhost` to `/etc/hosts` isn't possible on Replit — use `NEXT_PUBLIC_COURTPASS_URL` pointing to your repl and test `/book/*` paths directly |
| **HTTPS** | Replit provides HTTPS termination — do not set `HTTPS=true` locally on Replit |
| **Production build on Replit** | `npm run build` + `npm run start` works but Socket.io + uploads need persistent storage for full fidelity |
| **Prisma binary** | Schema includes `binaryTargets = ["native", "debian-openssl-3.0.x"]` — Replit Linux is covered by `native` |

---

## 7. External Services and API Keys

| Service | Role in app | Credentials needed | Skippable in dev? | Docs |
|---------|-------------|-------------------|-------------------|------|
| **PostgreSQL** | All data | `DATABASE_URL` | No | [Replit Postgres](https://docs.replit.com/cloud-services/storage-and-databases/sql-database) |
| **AWS Rekognition** | Face enroll/search at kiosk | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_REKOGNITION_COLLECTION` | **Yes** — mock mode auto-enables without keys | [AWS Rekognition](https://docs.aws.amazon.com/rekognition/) |
| **VietQR** | QR image URLs for bank transfer | Venue bank BIN + account in DB | **Yes** — QR renders if bank details set in admin | [img.vietqr.io](https://www.vietqr.io/) |
| **SePay** | Auto-confirm bank transfers via webhook | `SEPAY_WEBHOOK_SECRET` or `SEPAY_SKIP_VALIDATION=true` | **Yes** — use manual payment confirm in staff UI | See `docs/sepay-integration-report.md` |
| **PayOS** | Sticker pack checkout | `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | **Yes** — sticker pay flow fails gracefully | [payos.vn](https://pay.payos.vn/web4c/docs) |
| **WaveSpeed** | Primary AI sticker pipeline | `WAVESPEED_API_KEY` | **Yes** | Package `wavespeed` |
| **OpenAI** | Sticker `images.edit` | `OPENAI_API_KEY` | **Yes** | [OpenAI API](https://platform.openai.com/docs) |
| **FapiHub** | Photo background removal | `FAPIHUB_API_KEY` | **Yes** — originals used without removal | See `docs/aws-face-recognition.md` |
| **Resend** | Booking emails | `RESEND_API_KEY` | **Yes** — emails logged but not sent | [resend.com](https://resend.com/docs) |
| **Firebase Admin** | Staff mobile push | `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON) | **Yes** | See `mobile/docs/push-notifications.md` |
| **Web Push (VAPID)** | Player PWA notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **Yes** | `npx web-push generate-vapid-keys` |
| **Google OAuth** | CourtPass login + Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Yes** for CourtFlow staff/TV dev | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| **Apple OAuth** | CourtPass Apple login | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | **Yes** | [Apple Developer](https://developer.apple.com/) |
| **DeepSeek** | Admin AI chat | `DEEPSEEK_API_KEY` | **Yes** | `/api/ai-chat` returns 503 without key |
| **Reclub** | Roster import | None (public API + static club list) | **Yes** — manual roster entry works | `docs/RECLUB_ROSTER_API.md` |
| **ThumbmarkJS** | Staff login fingerprint | `THUMBMARKJS_API_KEY` | **Yes** — fingerprint fields null | Optional fraud signal |

### Mock / skip patterns for local dev

| Feature | How to disable/mock |
|---------|---------------------|
| Face recognition | Omit `AWS_ACCESS_KEY_ID` → `USE_MOCK_SERVICE=true` in `src/lib/face-recognition.ts` |
| SePay webhooks | `SEPAY_SKIP_VALIDATION=true` |
| PayOS payments | Leave `PAYOS_*` unset — admin sticker generate returns 503 |
| Web push | Leave VAPID keys unset — subscribe endpoints return errors; core app works |
| Site password gate | `SITE_GATE_ENABLED=false` (also hardcoded `SITE_GATE_TEMPORARILY_OFF=true` in middleware) |
| Sticker kiosk auth | Set `STICKER_KIOSK_SECRET` and pass `x-kiosk-secret` header from kiosk UI |

---

## 8. Known Issues and Dev Mode Limitations

### Features that need real credentials

| Feature | Without credentials |
|---------|---------------------|
| **Real face match** | Mock service returns synthetic matches — not suitable for production testing |
| **SePay auto-confirm** | Staff must manually confirm VietQR payments in session UI |
| **PayOS sticker checkout** | Payment buttons error; admin can still test generation if WaveSpeed key present |
| **OAuth CourtPass login** | Email/password login still works if player account exists |
| **Google Calendar sync** | Coach calendar features disabled |
| **FCM staff push** | Mobile app won't receive server pushes |
| **Resend emails** | No booking confirmation emails sent |
| **WaveSpeed/OpenAI stickers** | Sticker generation fails with 503 |

### Hard-coded / deployment-specific URLs to update for Replit

| Location | Default | Set on Replit |
|----------|---------|---------------|
| `APP_URL` | Falls back to `localhost:3000` | Your `https://*.repl.co` URL |
| `NEXT_PUBLIC_WEBSOCKET_URL` | `ws://localhost:3000` in `.env.example` | `wss://*.repl.co` |
| `NEXT_PUBLIC_COURTPASS_URL` | `https://courtpass.thecourtflow.com` | Your repl URL or skip CourtPass testing |
| `cron/sticker-worker.mjs` | Points to Railway production URL | Not used in dev — ignore or update `ENDPOINT_URL` |
| Upload proxy in `server.ts` | Proxies missing `/uploads` to `APP_URL` | Set `APP_URL` to production if you want prod face photos locally |

### Replit-specific limitations

- **No persistent `uploads/`** across repl restarts without external storage
- **Camera access** in embedded webview is unreliable — use external browser for kiosk/face testing
- **WebSocket through Replit proxy** generally works but adds latency; watch browser console for Socket.io connection errors
- **Railway volume paths** (`/app/uploads`) don't apply on Replit
- **Cron jobs** (`/api/cron/*`) don't run automatically — trigger manually with `curl -H "Authorization: Bearer $CRON_SECRET" https://your-repl/api/cron/expire-holds`

### Dev-mode behaviors (intentional)

- Face recognition mock logs `[FaceRecognition] Mode: MOCK` on startup
- Dev CSP allows `unsafe-eval` for Next.js HMR (`next.config.ts`)
- `server.ts` can proxy `/uploads` to production when `APP_URL` points at Railway
- Middleware site gate is **temporarily disabled** via `SITE_GATE_TEMPORARILY_OFF = true` in `src/middleware.ts` (as of codebase review)

---

## 9. Quick Start Summary

Run this exact sequence in a fresh Replit Node.js repl after importing the GitHub repo:

```bash
# 1. Create config files (copy content from Section 6 Step 2)
#    → .replit
#    → replit.nix (optional)

# 2. Set Replit Secrets (minimum):
#    DATABASE_URL, JWT_SECRET, NODE_ENV=development,
#    NEXT_PUBLIC_VENUE_ID=demo-venue-1,
#    APP_URL=https://YOUR-REPL.repl.co,
#    NEXT_PUBLIC_WEBSOCKET_URL=wss://YOUR-REPL.repl.co,
#    SEPAY_SKIP_VALIDATION=true, SITE_GATE_ENABLED=false

# 3. Install + database
npm install
npx prisma migrate deploy
npx prisma db seed

# 4. Start dev server (Express + Socket.io + Next.js)
npm run dev

# 5. Open in browser
#    → https://YOUR-REPL.repl.co
#    → Staff login: +10000000000 / Cf!Adm1n#2026xQ9
#    → Admin panel: /admin
#    → TV display: /tv
#    → Balance page: /my-balance
#    → Sticker kiosk: /sticker-kiosk
#    → CourtPay preview: /admin/courtpay
```

### Verify the stack is healthy

```bash
# DB connection
npx prisma studio          # Opens Prisma GUI on port 5555

# Face recognition mode (should say MOCK without AWS keys)
curl -s http://localhost:3000/api/test-aws | head

# Socket.io (check browser Network → WS tab after opening /staff)
```

### Useful dev URLs

| URL | Purpose |
|-----|---------|
| `/` | Landing / onboarding |
| `/staff` | Staff PWA home |
| `/admin` | Super Admin panel |
| `/tv` | TV court display |
| `/tv-queue/demo-venue-1` | TV queue + face kiosk |
| `/sticker-kiosk` | AI sticker kiosk |
| `/my-balance` | Player balance / sticker purchase |
| `/book/intro` | CourtPass portal (works without custom host in dev) |
| `/api/app-build` | Build metadata JSON |

---

## Appendix — npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | **Use this on Replit** — Express + Socket.io + Next dev |
| `npm run dev:next` | Next.js only (no Socket.io) — insufficient for full app |
| `npm run dev:https` | Local HTTPS with certs in `./certs/` |
| `npm run build` | `next build` + compile `server.ts` → `dist/` |
| `npm run start` | Production: `node dist/server.js` |
| `npm run db:seed` | Seed demo venue + accounts |
| `npm run db:migrate` | `prisma migrate dev` (creates migrations — dev only) |
| `npm run db:migrate:deploy` | Apply migrations (production / CI) |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Vitest single run |

---

## Appendix — Related documentation in repo

| File | Topic |
|------|-------|
| `README.md` | Minimal getting started |
| `CODEBASE_OVERVIEW.md` | Routes, API list, admin nav |
| `PRD_System_Overview.md` | Full product PRD |
| `CREDENTIALS.md` | Demo passwords (gitignored in prod setups) |
| `docs/aws-face-recognition.md` | AWS setup & thresholds |
| `docs/sepay-integration-report.md` | SePay webhook flow |
| `docs/billing-system.md` | Venue SaaS billing |
| `docs/sticker-system-context.md` | Sticker kiosk architecture |
| `docs/courtpay-flow-reference.md` | CourtPay check-in flows |

---

*This document is the single source of truth for Replit reconstruction. When the codebase changes, regenerate env var list with: `rg 'process\.env\.[A-Z0-9_]+' --no-filename -o | sort -u`*
