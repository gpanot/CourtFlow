# CourtFlow Codebase Overview

Generated reference for the full repository structure, data models, routes, and configuration.

> **Regenerate file tree:** `find . -type f | grep -v node_modules | grep -v .git | grep -v .next > file-tree.txt`  
> **Full Prisma schema:** [`prisma/schema.prisma`](prisma/schema.prisma) (1,254 lines — source of truth)

---

## Stack Summary

| Layer | Technology |
|-------|------------|
| PWA | Next.js 16, React 19, Tailwind 4 |
| Mobile | React Native / Expo (`mobile/`) |
| Database | PostgreSQL + Prisma 6.5 |
| Auth | Custom JWT (staff + player) + next-auth v5 (Google/Apple OAuth only) |
| Realtime | Socket.io |
| Face | AWS Rekognition |
| Push | Firebase Admin (FCM) + web-push |
| Payments | PayOS, Sepay, VietQR |

---

## 1. File Tree

**Total files (excluding `node_modules`, `.git`, `.next`):** ~24,989

### Top-level directories

```
CourtFlow/
├── mobile/              # React Native / Expo app
│   ├── android/
│   ├── src/screens/
│   ├── src/components/
│   └── src/lib/
├── src/                 # Next.js PWA
│   ├── app/             # App Router pages + API routes
│   ├── components/
│   ├── lib/
│   ├── modules/
│   ├── i18n/
│   └── stores/
├── prisma/              # Schema + migrations
├── public/              # Static assets, PWA manifests
├── scripts/             # Dev/ops scripts
├── uploads/             # Runtime uploads (players, proofs, venues)
├── fastapi/             # Python sidecar
├── cron/                # Scheduled jobs
├── docs/                # Documentation
├── dist/                # Compiled Express/Socket server
└── coverage/            # Vitest coverage output
```

### Key paths

| Path | Purpose |
|------|---------|
| `server.ts` | Dev/production server (Express + Socket.io + Next) |
| `Dockerfile` | Railway deployment |
| `prisma/migrations/` | 50+ migration folders |
| `src/app/(admin)/admin/` | Admin panel pages |
| `src/app/(staff)/staff/` | Staff PWA pages |
| `src/app/(book)/book/` | Player booking portal |
| `src/app/api/` | All API route handlers |
| `mobile/src/` | RN screens mirroring PWA staff/player flows |

---

## 2. Prisma Schema

**File:** `prisma/schema.prisma`  
**Provider:** PostgreSQL

### Enums

| Enum | Values |
|------|--------|
| `SkillLevel` | beginner, intermediate, advanced, pro |
| `Gender` | male, female, other |
| `CourtStatus` | idle, warmup, active, maintenance |
| `GameType` | men, women, mixed |
| `SessionStatus` | open, closed |
| `SessionType` | open_play, competition |
| `CourtBlockType` | private_competition, private_event, maintenance, open_play, competition |
| `QueueStatus` | waiting, assigned, playing, on_break, left |
| `GroupStatus` | forming, active, disbanded |
| `GamePreference` | no_preference, same_gender |
| `StaffRole` | staff, manager, superadmin |
| `PlayerAppAuthMethod` | face_pwa, wristband, phone_otp |
| `PaymentStatus` | UNPAID, PAID |
| `MembershipStatus` | active, suspended, expired, cancelled |
| `MembershipPaymentStatus` | UNPAID, PAID, OVERDUE |
| `BookingStatus` | confirmed, cancelled, completed, no_show |
| `SubscriptionStatus` | active, exhausted, expired, cancelled |
| `LessonType` | private, group |
| `CoachLessonStatus` | confirmed, completed, cancelled, no_show |

### Models by domain

#### Core venue & sessions

- `Venue` — venue settings, contact, billing status, portal config
- `Court` — court labels, status, bookable flag
- `Session` — open/closed sessions, Reclub roster, warmup mode
- `QueueEntry` — player queue state per session
- `PlayerGroup` — group codes for queue grouping
- `CourtAssignment` — active court games (warmup + real)
- `PlayerRanking` — staff-assigned ranking deltas per game
- `AuditLog` — staff action audit trail

#### People

- `Player` — player profile, face photo, ranking, walk-in flag
- `StaffMember` — staff/coach profile, role, Reclub group
- `StaffVenueAssignment` — staff ↔ venue with `appAccess` (courtflow/courtpay)
- `PlayerAccount` — OAuth/email credentials for booking portal
- `PlayerAppAuthLog` — player app login method log
- `PushSubscription` — web push endpoints
- `StaffPushToken` — FCM tokens for staff mobile
- `StaffAuthLog` — staff login audit (IP, fingerprint)

#### Payments & sessions

- `PendingPayment` — session check-in payments (VietQR, cash, grouped pay)
- `FaceAttempt` — kiosk face check-in attempts
- `FaceRecognitionLog` — live face match scores for threshold tuning
- `PlayerCustomPrice` — per-player discounts set by staff

#### Bookings & scheduling

- `Booking` — court bookings with payment hold/proof
- `CourtBlock` — blocked court time slots
- `OpenPlayRegistration` — open-play slot registrations

#### Memberships

- `MembershipTier` — tier definitions per venue
- `Membership` — player membership per venue
- `MembershipPayment` — monthly membership payment records

#### Coaching

- `CoachPackage` — lesson packages per coach/venue
- `CoachLesson` — scheduled lessons with payment tracking
- `CoachAvailability` — weekly availability slots
- `CoachHoliday` — coach holiday blocks
- `PlayerCoachCredit` — prepaid coach session credits

#### CourtPay (check-in module)

- `CheckInPlayer` — CourtPay-specific player records (phone + venue)
- `SubscriptionPackage` — pass packages (sessions/days)
- `PlayerSubscription` — active subscriptions
- `SubscriptionUsage` — check-in usage log
- `CheckInRecord` — individual check-in events

#### Billing (SaaS invoicing venues)

- `BillingConfig` — global billing defaults + bank info
- `VenueBillingRate` — per-venue rates (per_payment or monthly model)
- `BillingInvoice` — weekly/monthly invoices
- `BillingLineItem` — per-check-in line items on invoices

#### Payroll

- `StaffPayment` — weekly staff host payments

#### Stickers / Kiosk

- `PlayerStickerPhoto` — source photos for AI stickers
- `PlayerStickerResult` — generated sticker images
- `PlayerStickerPack` — 4-sticker packs with PayOS payment
- `StickerPaymentLog` — PayOS payment confirmations
- `StickerSession` — kiosk session tokens
- `StickerTemplate` — AI prompt templates (male/female)
- `StickerJobQueue` — async sticker generation queue
- `KioskSettings` — global kiosk config (price, bank, chroma key)
- `KioskDevice` — registered kiosk devices
- `SignupDuplicateLog` — face duplicate detection during signup

#### Auth

- `OtpCode` — phone OTP codes

---

## 3. Page Routes

Route groups in parentheses `(admin)`, `(book)`, etc. do **not** appear in the URL.

**Total pages:** 59

### Admin — `/admin/*`

| URL | Source file |
|-----|-------------|
| `/admin` | `(admin)/admin/page.tsx` |
| `/admin/venues` | `(admin)/admin/venues/page.tsx` |
| `/admin/bookings` | `(admin)/admin/bookings/page.tsx` |
| `/admin/memberships` | `(admin)/admin/memberships/page.tsx` |
| `/admin/coaching` | `(admin)/admin/coaching/page.tsx` |
| `/admin/staff` | `(admin)/admin/staff/page.tsx` |
| `/admin/venue-analytics` | `(admin)/admin/venue-analytics/page.tsx` |
| `/admin/my-billing` | `(admin)/admin/my-billing/page.tsx` |
| `/admin/settings` | `(admin)/admin/settings/page.tsx` |
| `/admin/live` | `(admin)/admin/live/page.tsx` |
| `/admin/payroll` | `(admin)/admin/payroll/page.tsx` |
| `/admin/analytics` | `(admin)/admin/analytics/page.tsx` |
| `/admin/players` | `(admin)/admin/players/page.tsx` |
| `/admin/courtpay` | `(admin)/admin/courtpay/page.tsx` |
| `/admin/courtpay-players` | `(admin)/admin/courtpay-players/page.tsx` |
| `/admin/courtpay-billing` | `(admin)/admin/courtpay-billing/page.tsx` |
| `/admin/courtpay-billing/venue/[venueId]` | `(admin)/admin/courtpay-billing/venue/[venueId]/page.tsx` |
| `/admin/kiosk-shop` | `(admin)/admin/kiosk-shop/page.tsx` |
| `/admin/courtpay-analytics` | `(admin)/admin/courtpay-analytics/page.tsx` |
| `/admin/courtpay-settings` | `(admin)/admin/courtpay-settings/page.tsx` |
| `/admin/logs` | `(admin)/admin/logs/page.tsx` |
| `/admin/face-recognition-test` | `(admin)/admin/face-recognition-test/page.tsx` |
| `/admin/log-errors` | `(admin)/admin/log-errors/page.tsx` |

### Staff — `/staff/*`

| URL | Source file |
|-----|-------------|
| `/staff` | `(staff)/staff/page.tsx` |
| `/staff/dashboard/boss` | `(staff)/staff/dashboard/boss/page.tsx` |
| `/staff/session/[sessionId]` | `(staff)/staff/session/[sessionId]/page.tsx` |
| `/staff/profile` | `(staff)/staff/profile/page.tsx` |
| `/staff/payment-settings` | `(staff)/staff/payment-settings/page.tsx` |
| `/staff/subscriptions` | `(staff)/staff/subscriptions/page.tsx` |

### Player booking portal — `/book/*`

| URL | Source file |
|-----|-------------|
| `/book` | `(book)/book/page.tsx` |
| `/book/login` | `(book)/book/login/page.tsx` |
| `/book/onboarding` | `(book)/book/onboarding/page.tsx` |
| `/book/intro` | `(book)/book/intro/page.tsx` |
| `/book/confirm` | `(book)/book/confirm/page.tsx` |
| `/book/bookings` | `(book)/book/bookings/page.tsx` |
| `/book/bookings/[id]` | `(book)/book/bookings/[id]/page.tsx` |
| `/book/coaches` | `(book)/book/coaches/page.tsx` |
| `/book/coaches/[coachId]` | `(book)/book/coaches/[coachId]/page.tsx` |
| `/book/coaches/[coachId]/buy-credits` | `(book)/book/coaches/[coachId]/buy-credits/page.tsx` |
| `/book/open-play/[id]` | `(book)/book/open-play/[id]/page.tsx` |
| `/book/open-play/confirm` | `(book)/book/open-play/confirm/page.tsx` |
| `/book/open-play/pay/[id]` | `(book)/book/open-play/pay/[id]/page.tsx` |
| `/book/pay/[id]` | `(book)/book/pay/[id]/page.tsx` |
| `/book/pay/credit/[id]` | `(book)/book/pay/credit/[id]/page.tsx` |
| `/book/pay/lesson/[id]` | `(book)/book/pay/lesson/[id]/page.tsx` |
| `/book/account` | `(book)/book/account/page.tsx` |
| `/book/account/edit` | `(book)/book/account/edit/page.tsx` |
| `/book/account/venue` | `(book)/book/account/venue/page.tsx` |
| `/book/account/credits` | `(book)/book/account/credits/page.tsx` |

### TV / Kiosk

| URL | Source file |
|-----|-------------|
| `/tv` | `(tv)/tv/page.tsx` |
| `/tv-queue` | `(tv)/tv-queue/page.tsx` |
| `/tv-queue/[venueId]` | `(tv)/tv-queue/[venueId]/page.tsx` |
| `/sticker-kiosk` | `(tv)/sticker-kiosk/page.tsx` |

### Other

| URL | Source file |
|-----|-------------|
| `/` | `page.tsx` |
| `/player` | `(player)/player/page.tsx` |
| `/gate` | `gate/page.tsx` |
| `/signup` | `signup/page.tsx` |
| `/onboarding` | `onboarding/page.tsx` |
| `/my-balance` | `my-balance/page.tsx` |
| `/privacy` | `privacy/page.tsx` |

---

## 4. API Routes

**Total endpoints:** 283  
Each path below maps to `/api/<path>` via `src/app/api/<path>/route.ts`.

<details>
<summary>All API paths (click to expand)</summary>

```
/api/admin/analytics
/api/admin/backfill-face-thumbs
/api/admin/billing/config
/api/admin/billing/overview
/api/admin/billing/revenue
/api/admin/billing/venue/[venueId]
/api/admin/billing/venue/[venueId]/backfill
/api/admin/billing/venue/[venueId]/invoices/[invoiceId]/mark-paid
/api/admin/billing/venue/[venueId]/invoices/[invoiceId]/mark-unpaid
/api/admin/billing/venue/[venueId]/invoices/[invoiceId]/payments
/api/admin/billing/venue/[venueId]/rates
/api/admin/billing/venue/[venueId]/week-payments
/api/admin/bookings/[id]/approve-payment
/api/admin/bookings/notifications
/api/admin/cleanup-mock-players
/api/admin/coach-lessons
/api/admin/coach-lessons/[id]
/api/admin/coach-packages
/api/admin/coach-packages/[id]
/api/admin/coaches
/api/admin/coaches/[coachId]
/api/admin/coaches/[coachId]/availability
/api/admin/coaches/[coachId]/photo
/api/admin/coaches/[coachId]/weekly-availability
/api/admin/court-blocks
/api/admin/court-blocks/[id]
/api/admin/courtpay-analytics
/api/admin/courtpay-payment-settings
/api/admin/courtpay-payment-test
/api/admin/courtpay-payments
/api/admin/courtpay-payments/[paymentId]/reclub-link
/api/admin/dashboard
/api/admin/face-stats
/api/admin/kiosk-settings
/api/admin/manager/billing
/api/admin/membership-payments
/api/admin/membership-payments/[id]
/api/admin/membership-tiers
/api/admin/membership-tiers/[id]
/api/admin/memberships
/api/admin/memberships/[id]
/api/admin/memberships/activate
/api/admin/open-play/[id]
/api/admin/open-play/[id]/approve-payment
/api/admin/open-play/registrations
/api/admin/payroll
/api/admin/payroll/[paymentId]/status
/api/admin/payroll/export
/api/admin/players
/api/admin/players/[playerId]
/api/admin/players/[playerId]/check-in-insights
/api/admin/players/[playerId]/face
/api/admin/players/[playerId]/remove-bg
/api/admin/players/[playerId]/sticker-photos
/api/admin/players/[playerId]/sticker-photos/[photoId]
/api/admin/players/[playerId]/sticker-photos/download-pack
/api/admin/players/[playerId]/sticker-photos/generate
/api/admin/players/[playerId]/sticker-photos/packs/[packId]
/api/admin/players/[playerId]/sticker-photos/process
/api/admin/players/[playerId]/sticker-photos/result
/api/admin/sessions
/api/admin/sessions/[sessionId]
/api/admin/sessions/[sessionId]/detail
/api/admin/setup-status
/api/admin/signup-duplicate-logs
/api/admin/staff
/api/admin/staff-auth-logs
/api/admin/staff/[staffId]
/api/admin/staff/[staffId]/hours
/api/admin/staff/[staffId]/hours/cumulative
/api/admin/staff/[staffId]/hours/export
/api/admin/staff/[staffId]/reset-password
/api/admin/sticker-explorer
/api/admin/sticker-purchases
/api/admin/sticker-purchases/[id]
/api/admin/sticker-stats
/api/admin/sticker-templates
/api/admin/sticker-templates/[id]
/api/admin/upload
/api/admin/venue-analytics
/api/admin/venues
/api/admin/venues/[id]/booking-config
/api/admin/venues/[id]/membership-config
/api/admin/venues/[id]/schedule-config
/api/ai-chat
/api/app-build
/api/auth/[...nextauth]
/api/auth/player-logout
/api/auth/register
/api/auth/send-otp
/api/auth/signup
/api/auth/staff-biometric-login
/api/auth/staff-login
/api/auth/staff-me
/api/auth/staff-refresh
/api/auth/validate-token
/api/auth/verify-otp
/api/balance/identify
/api/balance/identify-face
/api/bookings
/api/bookings/[id]
/api/bookings/availability
/api/bookings/mine
/api/courtpay/admin/overview
/api/courtpay/admin/packages
/api/courtpay/admin/payments
/api/courtpay/admin/subscribers
/api/courtpay/admin/subscribers/[id]
/api/courtpay/cash-payment
/api/courtpay/check-face
/api/courtpay/face-checkin
/api/courtpay/identify
/api/courtpay/packages/[venueCode]
/api/courtpay/pay-session
/api/courtpay/preview-face-presence
/api/courtpay/register
/api/courtpay/register-walk-in
/api/courtpay/staff/billing-status
/api/courtpay/staff/boss/history
/api/courtpay/staff/boss/player
/api/courtpay/staff/boss/players
/api/courtpay/staff/boss/session/[id]
/api/courtpay/staff/boss/sessions
/api/courtpay/staff/boss/today
/api/courtpay/staff/ensure-check-in-player
/api/courtpay/staff/packages
/api/courtpay/staff/packages/[id]
/api/courtpay/staff/packages/create-defaults
/api/courtpay/staff/subscribers
/api/courtpay/staff/subscribers/[id]
/api/courts
/api/courts/[courtId]
/api/courts/[courtId]/end-game
/api/courts/[courtId]/rank
/api/courts/[courtId]/replace-player
/api/courts/[courtId]/start-game
/api/courts/[courtId]/warmup-assign
/api/courts/[courtId]/warmup-autofill
/api/courts/state
/api/cron/auto-close-sessions
/api/cron/expire-holds
/api/cron/generate-invoices
/api/gate/logs
/api/gate/verify
/api/internal/process-sticker-queue
/api/kiosk/cancel-payment
/api/kiosk/cash-payment
/api/kiosk/check-existing-face
/api/kiosk/checkin-payment
/api/kiosk/enqueue-sticker
/api/kiosk/manual-resolve
/api/kiosk/phone-check-in
/api/kiosk/process-face
/api/kiosk/recent-checkin-stickers
/api/kiosk/recent-checkins
/api/kiosk/register
/api/kiosk/session
/api/kiosk/settings
/api/kiosk/staff-identify-face
/api/kiosk/sticker-config
/api/kiosk/sticker-face-identify
/api/kiosk/sticker-session
/api/kiosk/sticker-showcase
/api/manifest/player
/api/manifest/staff
/api/membership/mine
/api/membership/tiers
/api/onboarding/complete
/api/player/confirm-sticker-payment
/api/player/download-pack
/api/player/face-login
/api/player/me
/api/player/sticker-payment-status
/api/player/sticker-session
/api/player/wristband-login
/api/players/[playerId]
/api/players/[playerId]/avatar
/api/players/[playerId]/end-session
/api/players/[playerId]/history
/api/players/[playerId]/notifications
/api/players/[playerId]/sessions
/api/public/account
/api/public/account/avatar
/api/public/account/check-phone
/api/public/account/onboarding
/api/public/account/relink
/api/public/auth/login
/api/public/auth/signup
/api/public/availability
/api/public/bookings
/api/public/bookings/[id]
/api/public/bookings/[id]/proof
/api/public/coach-sessions
/api/public/coach-sessions/[id]
/api/public/coach-sessions/[id]/proof
/api/public/coaches
/api/public/coaches/[id]
/api/public/credits/[id]
/api/public/credits/[id]/proof
/api/public/open-play
/api/public/open-play/[id]
/api/public/open-play/[id]/proof
/api/public/open-play/my
/api/public/packages
/api/public/venue
/api/public/venues
/api/push/subscribe
/api/push/test
/api/push/unsubscribe
/api/push/vapid-public-key
/api/queue
/api/queue/analyze-face-quality
/api/queue/break
/api/queue/check-walk-in-phone
/api/queue/group/create
/api/queue/group/dissolve
/api/queue/group/join
/api/queue/group/leave
/api/queue/group/staff-create
/api/queue/last-game-feedback
/api/queue/leave
/api/queue/leave-warmup
/api/queue/requeue
/api/queue/return
/api/queue/staff-add-walk-in
/api/queue/staff-add-walk-in-with-face
/api/queue/staff-back-to-queue
/api/queue/staff-break
/api/queue/staff-remove
/api/queue/staff-replace
/api/reclub/clubs
/api/reclub/events
/api/reclub/fetch-roster
/api/reclub/link-player
/api/rekognition/diagnose
/api/rekognition/search
/api/sessions
/api/sessions/[sessionId]/close
/api/sessions/[sessionId]/feedback
/api/sessions/[sessionId]/game-type-mix
/api/sessions/[sessionId]/payments
/api/sessions/[sessionId]/player-stats
/api/sessions/[sessionId]/reclub-roster
/api/sessions/[sessionId]/reclub-snapshot
/api/sessions/[sessionId]/stats
/api/sessions/history
/api/sounds/[filename]
/api/staff/bookings
/api/staff/bookings/[id]
/api/staff/boss-dashboard/billing/current
/api/staff/boss-dashboard/billing/invoices
/api/staff/boss-dashboard/billing/invoices/[invoiceId]
/api/staff/boss-dashboard/billing/invoices/[invoiceId]/pay
/api/staff/boss-dashboard/billing/invoices/[invoiceId]/qr
/api/staff/boss-dashboard/billing/week-payments
/api/staff/cancel-paid-payment
/api/staff/cancel-payment
/api/staff/confirm-payment
/api/staff/paid-payments
/api/staff/payment-group
/api/staff/pending-payments
/api/staff/player-discounts
/api/staff/player-lookup
/api/staff/players-search
/api/staff/push/preferences
/api/staff/push/register
/api/staff/push/test
/api/staff/push/unregister
/api/staff/reclub-club
/api/staff/restore-paid-payment
/api/staff/update-payment-method
/api/staff/venue-payment-settings
/api/test-aws
/api/test-rekognition
/api/tv-queue/join
/api/tv-queue/join-by-number
/api/uploads/players/thumbs/[playerId]
/api/venues
/api/venues/[venueId]
/api/venues/[venueId]/courts
/api/venues/[venueId]/logo
/api/webhooks/payos
/api/webhooks/sepay
```

</details>

### API prefix summary

| Prefix | Purpose |
|--------|---------|
| `/api/admin/*` | Admin panel CRUD, analytics, billing, stickers |
| `/api/courtpay/*` | CourtPay check-in, packages, boss dashboard |
| `/api/kiosk/*` | Sticker kiosk, face check-in |
| `/api/public/*` | Player booking portal |
| `/api/staff/*` | Staff session payments, push, boss billing |
| `/api/queue/*` | Queue management, groups, walk-ins |
| `/api/sessions/*` | Session lifecycle, stats, Reclub |
| `/api/courts/*` | Court state, warmup, games |
| `/api/auth/*` | Staff/player auth, OTP, NextAuth |
| `/api/player/*` | Player app (face, wristband, stickers) |
| `/api/players/*` | Player profile, history, notifications |
| `/api/bookings/*` | Booking CRUD |
| `/api/reclub/*` | Reclub integration |
| `/api/push/*` | Web push |
| `/api/webhooks/*` | PayOS, Sepay |
| `/api/cron/*` | Auto-close sessions, expire holds, generate invoices |

---

## 5. Admin Sidebar Navigation

**Defined in:** `src/app/(admin)/admin/layout.tsx`

Labels use i18n keys from admin locale files (`src/i18n/locales/admin/en.json`).

### Top nav

| href | i18n key |
|------|----------|
| `/admin` | `nav.overview` |
| `/admin/venues` | `nav.venues` |
| `/admin/bookings` | `nav.bookings` |
| `/admin/memberships` | `nav.memberships` |
| `/admin/coaching` | `nav.coaching` |
| `/admin/staff` | `nav.staff` |
| `/admin/venue-analytics` | `nav.venueAnalytics` |
| `/admin/my-billing` | `nav.myBilling` |
| `/admin/settings` | `nav.settings` |

### Section: CourtFlow Social (`requiresApp: "courtflow"`)

| href | i18n key | superadminOnly |
|------|----------|----------------|
| `/admin/live` | `nav.liveSessions` | |
| `/admin/payroll` | `nav.payrollHosts` | yes |
| `/admin/analytics` | `nav.analytics` | |
| `/admin/players` | `nav.players` | |

### Section: CourtPay Check-in (`requiresApp: "courtpay"`)

| href | i18n key | superadminOnly |
|------|----------|----------------|
| `/admin/courtpay` | `nav.courtpay` | |
| `/admin/courtpay-players` | `nav.cpPlayers` | |
| `/admin/courtpay-billing` | `nav.cpBilling` | yes |
| `/admin/kiosk-shop` | `nav.kioskShop` | yes |
| `/admin/courtpay-analytics` | `nav.cpAnalytics` | |
| `/admin/courtpay-settings` | `nav.cpSettings` | |

### Section: Logs & Errors (`superadminOnly: true`)

| href | i18n key |
|------|----------|
| `/admin/logs` | `nav.logs` |
| `/admin/face-recognition-test` | `nav.faceRecognitionTest` |
| `/admin/log-errors` | `nav.logErrors` |

### Access control

- **Superadmins** see all items.
- **Managers** see items filtered by venue `appAccess` (`courtflow` / `courtpay`) from `GET /api/auth/staff-me`.
- Items with `superadminOnly: true` are hidden from managers.

---

## 6. package.json

```json
{
  "name": "courtflow",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx server.ts",
    "dev:https": "HTTPS=true SSL_CRT_FILE=./certs/cert.pem SSL_KEY_FILE=./certs/key.pem tsx server.ts",
    "dev:next": "next dev",
    "build": "next build && tsc --project tsconfig.server.json",
    "start": "node dist/server.js",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "next": "16.1.6",
    "react": "19.2.3",
    "@prisma/client": "^6.5.0",
    "next-auth": "^5.0.0-beta.30",
    "firebase-admin": "^13.8.0",
    "@aws-sdk/client-rekognition": "^3.1018.0",
    "@payos/node": "^2.0.5",
    "openai": "^6.37.0",
    "socket.io": "^4.8.0",
    "zustand": "^5.0.0"
  }
}
```

See [`package.json`](package.json) for the full dependency list and all scripts.

---

## Related docs

- [`COURTFLOW_PRODUCT_OVERVIEW.md`](COURTFLOW_PRODUCT_OVERVIEW.md) — product features
- [`BOOKING_PAYMENT_STATUSES.md`](BOOKING_PAYMENT_STATUSES.md) — booking payment states
- [`.cursor/rules/rn-pwa-consistency.mdc`](.cursor/rules/rn-pwa-consistency.mdc) — mobile ↔ PWA parity rules
