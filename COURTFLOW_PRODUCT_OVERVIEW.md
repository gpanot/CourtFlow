# CourtFlow — Product Overview

**Version 4.0 · July 21, 2026**
**Tagline:** The all-in-one court management platform for pickleball venues.

---

## What is CourtFlow?

CourtFlow started as a real-time rotation system for 200+ player open-play sessions. It has evolved into a **complete court management and payment platform** that handles everything a pickleball venue needs — from live session management and automated matchmaking to court bookings, memberships, staff payroll, coaching, on-site check-in payments, automated bank reconciliation, and structured training programs with class pass management.

The platform now has **three distinct products** that share the same backend:

| Product | Form Factor | Primary Use |
|---------|-------------|-------------|
| **CourtFlow** | Web app (PWA) | Court operations, rotation, admin, analytics |
| **CourtPay** | Mobile app (iOS / Android) | On-site check-in and payment collection |
| **CourtPass** | Mobile app (iOS / Android) | Player-facing program enrollment and class pass management |

---

## Interfaces

| Interface | Users | Purpose |
|-----------|-------|---------|
| **Admin Panel** (web) | Venue owners, managers | Full venue operations: bookings, memberships, programs, payments, staff, analytics |
| **Staff Dashboard** (web) | Front-desk staff, session managers | Run live sessions, manage queue, assign courts, create bookings |
| **Player App** (web PWA) | Members, walk-in players | Join queue, view courts, manage profile, book courts, browse and enroll in programs |
| **TV Display** (web) | Public screens at venue | Show live court status, queue, and venue branding |
| **CourtPay Mobile** (RN) | Staff on the floor, venue owners, tablet kiosks | Check-in, collect payments, view earnings on the go |
| **CourtPass Mobile** (RN) | Players | Browse training programs, manage class passes, track session attendance |

All web interfaces are **PWA-ready** (Progressive Web App) with web push notifications and work on any device.

---

## Roles

| Role | Access |
|------|--------|
| `staff` | Staff Dashboard (web) + CourtPay Mobile (staff tabs) |
| `manager` | Staff app + Admin panel (scoped to their venues) |
| `superadmin` | Full access: all venues, all admin panel sections, billing, platform config |

**App access scoping** — A manager's admin panel navigation is filtered based on the `appAccess` field of their venue assignments. If a manager's venues only include CourtPay venues, they only see CourtPay sections in the nav and vice versa.

---

## Core Modules

### 1. Real-Time Session Management (Open Play & Competitions)

The original heart of CourtFlow. Staff opens a session, players join a queue, and the system handles rotation across courts automatically.

**How it works:**
- Staff opens a session at a venue and activates courts
- Players scan a QR code or use the app to join the queue
- The matchmaking algorithm forms balanced groups based on skill level, gender preference, and game type (men's, women's, mixed)
- Groups are assigned to courts with optional warmup periods
- After a game ends, players are automatically requeued
- Players can go on timed breaks and return to the queue

**Key features:**
- Real-time updates via WebSocket (Socket.io) across all connected devices
- Automatic group formation with configurable skill gap tolerance
- Warmup mode (manual or auto-fill)
- Break system with configurable durations (5, 10, 15, 20, 30 min)
- GPS-based join radius to prevent remote queue joins
- Session statistics, player history, and feedback collection
- TV Display mode for public screens
- **Auto-close** — sessions open for more than 4 hours are automatically closed by a Railway cron job (hourly, so effective window is 4h–5h)

**Session Types:**
- **Open Play** — standard drop-in rotation (queue-based)
- **Competition** — same mechanics, labeled distinctly for competitive events

---

### 2. Court Booking System

A calendar-based booking system where players reserve specific courts at specific times.

**Admin capabilities:**
- **Day Planner Grid** — vertical timeline with courts as columns and time slots as rows, showing full daily occupancy at a glance
- **Multi-slot booking** — select one or multiple consecutive time slots and book them together
- **Multi-court selection** — select slots across multiple courts to block or schedule
- **Dynamic pricing** — different prices per day of week and hour range (e.g., weekday morning vs. weekend evening)
- **Booking management** — create, edit, cancel bookings; mark no-shows
- **Conflict detection** — prevents double-booking with real-time availability checks
- **Cancellation policy** — configurable hours-before-start cancellation window

**Booking configuration (per venue):**
- Operating hours (start/end)
- Slot duration (default 60 min)
- Default price + per-day/hour pricing rules
- Cancellation policy hours

---

### 3. Weekly Schedule (Recurring Open Play & Competitions)

Venues can configure recurring weekly schedules for Open Play and Competition sessions that automatically appear in the booking calendar.

**How it works:**
- Admin defines schedule entries per venue: type, title, days of week, time range, courts
- Entries repeat every week automatically — no need to create individual records
- Scheduled slots appear as colored blocks in the day planner
- Walk-in bookings cannot overlap with scheduled times

---

### 4. Court Blocks (On-Demand Time Blocking)

For one-off events that don't fit the recurring schedule, admins can block court time directly from the booking grid.

**Block types:**

| Type | Description |
|------|-------------|
| **Open Play** | One-off open play session |
| **Competition** | One-off competition event |
| **Private Event** | Company events, private parties |
| **Private Competition** | Invitation-only tournaments |
| **Maintenance** | Court resurfacing, repairs |

---

### 5. Membership System

Tiered membership plans with session tracking, payment management, and perks. This is the CourtFlow **open-play membership** system (distinct from the CourtPass program-pass system — see Module 11).

**Membership Tiers:**
- Admin creates tiers per venue (e.g., Basic — 5 sessions/month, Premium — unlimited)
- Each tier has: name, price, included sessions per cycle, cycle length (days), and perks
- Perks are configurable text items (e.g., "-10% Coffee Shop", "Priority Tournament Registration")

**Member Management:**
- Activate / suspend / cancel memberships
- Track session usage (x/5 used) with inline editing for admin adjustments
- Change tier mid-cycle with automatic payment adjustment
- Automatic cycle renewal with session count reset
- Automatic expiration of overdue memberships

**Payment Tracking:**
- Payment records auto-generated each billing cycle
- Admin confirms payment with: amount, method (cash/bank transfer/other), date, proof image upload, notes
- Payment history drawer per member
- Monthly payment summary dashboard (collected, unpaid, overdue)

---

### 6. Coaching Module

**Coach Management:**
- Admin creates coach profiles per venue with name, photo, bio, hourly rate, specializations, and availability windows
- Coaches can be active or inactive per venue

**Lesson Packages:**
- Admin creates packages (e.g., "5 Private Lessons $200")
- Package pricing, session count, duration per lesson, and validity days
- Packages can be active or inactive

**Lesson Scheduling:**
- Book individual lessons: select coach, date, time, court, player, package
- Lessons appear on the booking grid alongside court bookings
- View lessons per coach or per venue

---

### 7. Staff & Payroll

**Staff Management:**
- Create staff accounts with roles: `staff`, `manager`, `superadmin`
- Venue assignment — staff can be assigned to multiple venues
- Manager role grants admin panel access scoped to their venues
- Password management with reset capability
- When a staff member is promoted to manager, `onboardingCompleted` is automatically set to `true`

**Payroll:**
- Automatic hours tracking based on session open/close times
- Weekly payroll view: hours worked, sessions closed, amount
- Mark payments as paid with method, date, and notes
- Export payroll data to CSV
- Manager pays staff; superadmin oversees across all venues

---

### 8. Player Directory

Player management is split across two admin pages, scoped by product:

**CourtFlow Players** (`/admin/players` — CourtFlow Social section):
- Add, edit, delete player profiles for rotation / open-play
- View player stats and session history
- Set skill level, gender, game type preference
- Filter by skill level, gender, game preference
- Search by name or phone
- Face photo management (for face recognition check-in)

**CP Players** (`/admin/courtpay-players` — CourtPay section):
- Mirrors the mobile boss dashboard player roster
- KPIs: total players, new this week, active subscriptions, avg return, return rate (15d)
- Searchable, sortable player list with face thumbnails
- Player detail drawer: visit history, subscription status, package history, check-in history, Reclub link
- Inline edit modal for name, gender, skill level
- Credit add/deduct actions

---

### 9. Analytics

**Venue Analytics:**
- Sessions, players, games played, revenue over configurable date ranges (7d, 30d, 90d, 1y, custom)
- Booking revenue breakdown
- Membership revenue
- Coaching revenue
- Player retention metrics
- Court utilization

**CourtPay Analytics:**
- Per-venue payment analytics: monthly and weekly breakdowns
- Session-level drill-down with payment details per player
- KPIs: total revenue, payment count, unique players (full venue roster count — same definition as CP Players), sessions, avg revenue/session, cancelled count
- **CSV Export:**
  - Monthly / weekly breakdown → session-consolidated format (matches mobile boss dashboard): Date, Session start/end, Duration, Staff, Initial price, Total revenue, Total payments, QR/Cash/Subs count, Reclub (Expected), Total players. Sessions with zero revenue are excluded.
  - Session drill-down → payment-per-row format: Confirmed At, Player, Phone, Skill Level, Amount, Method, Status, etc.
  - Selective export — "Export" button per section enables checkbox row selection and exports only selected rows

---

### 10. Billing (CourtFlow SaaS)

CourtFlow bills venues on a **usage-based or flat-monthly SaaS model**.

**Billing models (per venue):**

| Model | Invoice cadence | Amount |
|-------|-----------------|--------|
| **Per payment** (default) | Weekly (every Monday) | Check-ins × base rate + subscription addon + Sepay addon |
| **Monthly** | 1st of each month | Flat monthly rate (VND); first invoice pro-rated from start date |

**How it works:**
- Weekly invoices auto-generated every Monday for `per_payment` venues
- Monthly invoices auto-generated on the 1st for `monthly` venues
- Venue pays via bank transfer; superadmin marks invoice as paid
- Overdue invoices (>7 days unpaid) automatically escalate
- Venues overdue >14 days are suspended

**Monthly subscription lifecycle:**
- Superadmin sets billing model, flat rate, start date, and optional end date per venue (CourtPay Billing → venue detail)
- Status: `active` | `cancelled` | `inactive`
- Cancel flow — admin cancels; cron auto-reverts venue to `per_payment` on next invoice run
- Expired subscriptions (end date passed) — cron auto-reverts to `per_payment`
- Managers see their active monthly plan in **My Billing** (rate, status, start/end dates, recent invoices)

**Admin billing features:**
- Invoice list per venue with status (pending / paid / overdue / suspended)
- Billing configuration per venue: bank details, rates, billing contact, billing model
- VND amount inputs display with comma separators (e.g. 5,000) via `AmountInput`
- Admin can mark invoices paid manually (with method, ref, notes)

---

## CourtPay Module

CourtPay is the mobile-app layer for on-site check-in and payment. It uses the same backend APIs as CourtFlow.

### Staff App (CourtPay Mobile — 3-tab interface)

| Tab | Description |
|-----|-------------|
| **Session** | Open / close sessions, view active session stats, session history |
| **Check-In** | Face recognition or manual check-in of players, payment status view |
| **Payment** | View pending/confirmed/cancelled payments, manual confirm, QR display |

**Additional staff screens:**
- **Boss Dashboard** — earnings summary with weekly/monthly revenue charts, revenue export (session-consolidated CSV)
- **Subscriptions** — list of active player subscriptions per venue
- **Payment Settings** — configure session fee, bank details, payment methods, auto-payment status display
- **Player Detail** — individual player profile, photo, subscription status, payment history
- **Session History** — closed sessions list with revenue summary per session

### Kiosk Mode (Tablet)

Self-service tablet station at the venue entrance — no staff required:
- **Venue select → Mode select → Check-In or Pay**
- **Face recognition check-in** — player looks at the camera → face matched → auto check-in with VietQR payment generated
- **QR code check-in** — player scans a personalized QR from their phone
- **Wristband check-in** — NFC/QR on wristband
- **PayOS sticker kiosk** — scan a sticker, pay via PayOS QR
- On-screen payment display with real-time confirmation (socket event drives status update)

### Payments

**Payment methods:**
- **VietQR** — generate a bank transfer QR code; player scans with their banking app and amount goes directly to venue's bank account
- **Cash** — staff marks payment as cash; tracked in the system
- **Subscription** — deduct from player's active membership; no bank transfer

**Payment confirmation:**
- **Manual** — staff taps confirm in the app
- **Auto (Sepay)** — when enabled, Sepay webhook receives the bank transfer, matches it to the pending payment reference (`CF-SES-XXXXXX`), and auto-confirms without staff action. Supports bank-specific reference formatting (MB Bank strips hyphens/adds spaces — handled via regex normalization)

**Display configuration (per venue, in CourtPay Settings → Config tab):**
- Applies to all venue display surfaces: tablet kiosk, TV display, and phone waiting screens
- Venue logo upload/remove, spinning logo toggle
- Waiting screen custom text (multi-line)
- Display language (English / Vietnamese) with live preview

**Sepay configuration (per venue, in CourtPay Settings → Auto-payment tab):**
- Toggle: Auto-payment confirmation ON/OFF
- Gateway: Sepay (active) or PayOS (coming soon)
- Bank account, phone, CCCD
- Test QR — generate a test payment showing both CourtFlow VietQR and Sepay QR side-by-side with real-time debug status panel

### Reclub Integration

- Staff can load Reclub event rosters into a session
- Roster players are pre-identified at check-in by face or QR
- Reclub snapshot captured at session close: expected vs. matched vs. walk-in counts
- Used for Reclub billing reconciliation

### Face Recognition (AWS Rekognition)

- Players register their face photo at check-in
- Face recognition used to identify returning players instantly
- Duplicate face detection prevents double registration
- Face search with similarity threshold
- Admin can view face stats and run face recognition tests
- **Face thumbnails** — 96×96 WebP generated at enrollment (`sharp`); served via `/api/uploads/players/thumbs/{playerId}` with on-demand disk cache; used in CP Players, boss player lists (PWA + mobile); backfill script (`npm run backfill:face-thumbs`) for existing photos

### Push Notifications (FCM — Firebase Cloud Messaging)

- Staff receive push notifications for check-in events, payment confirmations, and session alerts
- Supported on both iOS and Android via `@react-native-firebase/messaging`
- Background message handling persisted to AsyncStorage for debug inspection
- FCM Debug Screen in the mobile app: displays token, permission status, log of all message events (foreground / background / tapped / quit state), with "Send Test PNS" button

---

## Program Passes & CourtPass

The Program Passes system is CourtFlow's **structured training & class management layer**, complementing the open-play rotation and court-booking modules. It is surfaced in three places: the Admin Panel, the Player PWA (book portal), and the dedicated **CourtPass mobile app**.

### Concepts

| Concept | Description |
|---------|-------------|
| **Pass Type** | A named training program offered by the venue (e.g., "Beginner Bootcamp", "Advanced Drills"). Defines price, sessions included, level, age range, skill tags, description, cover image, and assigned coaches. |
| **Program Run** | A specific scheduled cohort of a Pass Type — with start date, weekly recurrence (hour + duration), total session count or end date, court assignment, capacity limit, and run-level coaches. |
| **Class Instance** | Each individual class session auto-generated from a Program Run's recurrence rules. Holds `startAt`, `endAt`, and an optional topic. |
| **Program Pass** | A player's enrollment ticket for a specific Program Run. Tracks `sessionsUsed` and status (`active` / `expired` / `cancelled`). |
| **Class Check-In** | Records that a Program Pass holder attended a Class Instance. Enforces capacity and session-budget limits atomically. |
| **Payment** | Each Program Pass generates a payment record (UNPAID → PAID). Players can upload a payment proof; admins confirm manually or via auto-reconciliation. |

### Admin Capabilities (Program Passes page)

**Pass Types tab:**
- Create, edit, deactivate pass types per venue
- Upload a cover image per pass type
- Assign one or more coaches to a pass type
- View active pass count per type

**Program Runs tab:**
- Create Program Runs: link to a pass type, set dates, recurrence (start hour, duration in minutes), total sessions or end date, capacity, court assignment, coaches
- Auto-generate all Class Instances from recurrence rules (`POST /api/admin/program-runs/{id}/generate`)
- Manage run status: `upcoming` → `in_progress` → `completed`
- Add, edit, or delete individual Class Instances (topic, time overrides)

**Passes tab (paginated list view):**
- Filter by pass type, payment status (pending / proof submitted / paid / overdue), and date range
- Search by player name or phone
- Per-pass actions: activate, suspend, cancel, re-activate
- Payment management: confirm payment, add payment note, download invoice
- Payment status badges: `pending`, `proof_submitted`, `overdue`, `paid`
- Bulk payment request send (via PaymentRequestButton)

**Check-In:**
- Staff manually checks a player in to a class instance from the admin panel
- Validates: pass is active, sessions not exhausted, class not at capacity, not already checked in
- Returns `sessionsUsed` and `sessionsIncluded` for live UI update
- Concurrency safe (serialized transaction with one retry on conflict)

### Player Portal (PWA — `/book/programs`)

- Browse upcoming and in-progress Program Runs filtered by skill level (beginner / intermediate / advanced / pro)
- View program details: coach names and photos, schedule, capacity, price
- Enroll directly from the browser: creates a Program Pass and a pending payment record
- Upload payment proof image
- **My Progress page** (`/book/programs/{id}/progress`): see all class instances, attendance status per session, sessions used vs. total
- **Program Pay page** (`/book/pay/program/{id}`): payment flow with QR or bank transfer reference
- Waitlist: join a waitlist when a run is full; admin can promote waitlisted players

### CourtPass Mobile App (`mobile-courtpass/`)

A dedicated React Native (Expo) app for players, separate from CourtPay:

| Tab | Description |
|-----|-------------|
| **Home** | Dashboard — upcoming classes, quick stats (coming soon) |
| **Programs** | Browse active Program Runs for the player's venue |
| **My Pass** | View active CourtPass enrollments and session attendance |
| **Profile** | Account settings, logout |

**Tech details:**
- Bundle ID: `com.thecourtflow.courtpass`
- Package: `com.thecourtflow.courtpass`
- Auth: custom JWT, token stored in `expo-secure-store` under `courtpass_player_token`
- Notifications: `expo-notifications` with channel `courtpass_default`
- Theme: deep green (`#052e16`) — distinct from CourtPay's dark theme
- Navigation: React Navigation bottom tabs + stack navigator

### Payment Flow (Program Passes)

1. Player enrolls → Program Pass created with status `active`, payment record created with status `UNPAID` and a unique payment reference
2. Player uploads bank transfer proof via the portal or CourtPass app
3. Admin reviews proof in the Passes list and confirms payment (marks `PAID`, records method and date)
4. Pass remains `active` through the run; check-ins decrement the sessions budget

---

## Admin Panel Sections

| Section | Description |
|---------|-------------|
| **Live** | Real-time monitor of all venues' court and session status |
| **Bookings** | Day planner grid, booking management, schedule config, pricing rules |
| **Coaching** | Coaches, lesson packages, lesson scheduling |
| **Memberships** | CourtFlow membership tiers, member activation, payment tracking |
| **Program Passes** | Pass types, program runs, class instances, player enrollments, payment management, check-in |
| **Players** | CourtFlow player directory — skill, stats, face photo management (CourtFlow Social section) |
| **CP Players** | CourtPay player roster — KPIs, detail drawer, subscriptions, check-in history, face thumbnails |
| **Staff** | Staff accounts, roles, venue assignments |
| **Payroll** | Weekly staff payroll tracking and export |
| **Venues** | Venue config: courts, billing config, active/inactive |
| **Venue Analytics** | Usage statistics, bookings, coaching, player metrics |
| **Membership CourtPay** | CourtPay subscription packages, subscribers, payments |
| **CourtPay Analytics** | Session/payment analytics with drill-down and CSV export |
| **CourtPay Settings** | Tablet/TV/Phone display (logo, waiting screen text, locale), payment config, Sepay auto-payment, branding |
| **CourtPay Billing** | SaaS invoice management per venue |
| **Kiosk Shop** | PayOS sticker configuration and kiosk payment settings |
| **My Billing** | Manager's own billing dashboard |

**Navigation scoping:** Managers only see sections relevant to their assigned venues' `appAccess` (CourtFlow sections hidden if no CourtFlow venues; CourtPay sections hidden if no CourtPay venues).

**Admin i18n:** Admin panel supports English and Vietnamese (`admin-i18n`, locale files in `src/i18n/locales/admin/`). Language preference is set in Admin Settings.

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14+ (App Router) |
| **Language** | TypeScript |
| **Database** | PostgreSQL (Railway-hosted) |
| **ORM** | Prisma |
| **Styling** | Tailwind CSS (dark theme) |
| **State** | Zustand (client sessions) |
| **Real-time** | Socket.io (WebSocket) |
| **Auth** | JWT + bcrypt + OTP (phone-based for players, password for staff) |
| **Web Push** | Web Push API (VAPID) |
| **CourtPay Mobile** | React Native (Expo) — iOS & Android — staff check-in and payment |
| **CourtPass Mobile** | React Native (Expo) — iOS & Android — player program & pass management |
| **Mobile Push (CourtPay)** | Firebase Cloud Messaging (FCM) via `@react-native-firebase/messaging` |
| **Mobile Push (CourtPass)** | Expo Notifications (`expo-notifications`) |
| **Face Recognition** | AWS Rekognition |
| **Payment Webhooks** | Sepay (auto-confirm bank transfers) + PayOS (kiosk sticker payments) |
| **Hosting** | Railway (API + DB) |
| **Icons** | Lucide React |

### Cron Jobs (Railway)

| Job | Schedule | Description |
|-----|----------|-------------|
| `auto-close-sessions` | Every hour (`0 * * * *`) | Closes sessions that have been open for more than 4 hours (effective window: 4h–5h) |
| `generate-invoices` | Every Monday 00:01 (`1 0 * * 1`) | Generates weekly invoices (`per_payment` venues); on the 1st of each month also generates monthly invoices, reverts cancelled/expired monthly subscriptions to `per_payment`; marks overdue, suspends unpaid venues |

Both jobs are secured with `CRON_SECRET` bearer token auth.

### Key Design Decisions

- **Venue-scoped data** — all data (courts, sessions, bookings, memberships, programs, payments) is scoped to a venue
- **JSON settings** — per-venue configuration (pricing rules, schedule, payment config, Sepay settings) stored as JSON in `Venue.settings` for flexibility without schema migrations
- **Three booking models** — Walk-in bookings (`Booking`), live sessions (`Session`), and time blocks (`CourtBlock`) are separate models that all feed into a unified availability API
- **Program Pass model** — `ProgramPassType` → `ProgramRun` → `ClassInstance` hierarchy separates the program template from its scheduled cohorts and individual classes; `ProgramPass` is the player's enrollment ticket; `ClassCheckIn` records attendance with serialized concurrency control
- **Shared venue picker** — `AdminVenuePicker` / `useAdminVenuePicker` is a single component + hook used across all admin pages, fetching from `/api/admin/venues` (auth-scoped) and persisting selection via `useAdminVenueStore` (localStorage)
- **Timezone** — server and all date/time logic runs in the venue's local timezone (`Asia/Saigon`, UTC+7); `setHours()` used throughout (never `setUTCHours`)
- **Payment reference parsing** — `extractPaymentRef` handles MB Bank's hyphen/space stripping variations (`CF-SES-XXXXXX`, `CFSESXXXXXX`, `CF SES XXXXXX`)

### Real-Time Architecture

```
Browser ←→ Socket.io ←→ Custom Express Server ←→ Next.js API
                ↓
         Push Notifications (Web Push / FCM)
```

Events flow through venue-scoped rooms (`venue:{id}`) and player-scoped rooms (`player:{id}`). Court updates, queue changes, session events, and payment confirmations are broadcast in real-time to all connected clients.

---

## User Flows

### Staff: Running an Open Play Session

1. Open CourtPay mobile → select venue → Session tab
2. Tap "Open Session" → session starts
3. Players arrive and check in at the kiosk (face/QR) or staff checks them in manually
4. Each player receives a VietQR payment QR; auto-confirmed via Sepay when payment is received
5. End of session → tap "Close Session" (or session auto-closes after 4h–5h if forgotten)
6. Session summary shows revenue, players, confirmed payments

### Admin: Monitoring CourtPay Revenue

1. Admin Panel → CourtPay Analytics → select venue
2. Monthly breakdown table shows revenue, sessions, players per month
3. Click a month → weekly breakdown
4. Click a week → session list for that week
5. Click a session → payment-by-payment detail with player info, skill level, method
6. Export selected months/weeks → session-consolidated CSV (matches boss dashboard format); zero-revenue sessions excluded

### Admin: Managing CourtPay Players

1. Admin Panel → CP Players → select venue
2. Review KPIs (total players, new this week, subscriptions, return rate)
3. Search or sort the player list; face thumbnails load from cached WebP thumbs
4. Click a player → detail drawer shows subscriptions, check-in history, Reclub link
5. Edit player profile or adjust credit balance inline

### Manager: Viewing Billing Plan

1. Admin Panel → My Billing
2. Per-venue card shows billing model (per-check-in rates or monthly flat rate)
3. For monthly venues: see active/cancelled status, start date, and optional end date
4. Scroll to recent invoices table (read-only)

### Player: Joining Open Play

1. Arrive at venue during scheduled Open Play
2. Scan QR code on the TV display
3. Automatically join the queue
4. Get matched into a group and assigned a court
5. Play → get requeued → repeat

---

## CourtFlow Suite — Value Proposition

CourtFlow is not a single-feature tool. It is a **full operating system for racket-sport venues**, built so every product layer amplifies the others. Below is a breakdown of the compounding value each product and module delivers.

### The Three Products — and Why They're Better Together

| Product | Standalone Value | Compounded Value |
|---------|-----------------|-----------------|
| **CourtFlow** (web PWA) | Eliminates clipboard chaos; live rotation engine, bookings, and analytics in one dashboard | Feeds player profiles and session history into CourtPay face recognition and CourtPass enrollment |
| **CourtPay** (mobile) | On-site check-in and bank-transfer auto-reconciliation; zero cash handling errors | Reuses the same player database built from CourtFlow open-play; Reclub integration bridges event operators |
| **CourtPass** (mobile) | Structured training program management; players self-manage their pass and attendance on their phone | Coaches assigned in the admin panel appear in both CourtPass and the coaching module; payments share the same reconciliation infrastructure |

### Revenue Unlocked Per Module

| Module | Revenue Mechanism |
|--------|------------------|
| **Real-Time Rotation** | More games per session → higher per-player spend; players stay longer and return more often |
| **Court Booking** | Monetizes every hour of court time, not just open-play windows |
| **Weekly Schedule** | Recurring revenue from structured open-play and competition slots |
| **Memberships** | Predictable monthly recurring revenue; reduces dependence on walk-in volume |
| **Coaching** | Premium revenue layer: private lessons and packages at higher margins than open-play |
| **Program Passes / CourtPass** | Upfront class-pass revenue; structured cohorts with committed enrollment; natural upsell from open-play to coaching programs |
| **CourtPay** | Captures every walk-in payment; Sepay auto-reconciliation eliminates missed or disputed payments |
| **Analytics** | Identifies peak hours, top players, underutilized courts — enables data-driven pricing and scheduling decisions |

### Operational Advantages

| Pain Point | CourtFlow Solution |
|------------|-------------------|
| Court downtime (15–20 min avg) | < 2 min with real-time matchmaking and WebSocket-driven court assignment |
| Manual payment tracking | Auto-confirmed via Sepay webhook; payment history per player; CSV export for accounting |
| Staff burnout on rotation | Staff taps one button to end a game; system assigns next group in < 3 seconds |
| No visibility across venues | Superadmin Live panel shows all venues' court status in real time |
| Player data silos | Single player profile shared across open play, CourtPay check-ins, bookings, and program enrollments |
| No structured training revenue | CourtPass program passes turn coaching into a recurring, scalable revenue stream |
| Membership payment chasing | Auto-generated billing cycles with payment proof upload and overdue escalation |
| Reporting overhead | Built-in analytics: session, booking, membership, and coaching revenue by period and venue |
| Staff payroll errors | Session-based automatic hours tracking; weekly payroll view with CSV export |

### Why Venues Don't Switch Away

1. **Data gravity** — Player profiles, session history, face recognition enrollments, and payment history accumulate over time and become increasingly valuable. Migrating away means losing this institutional knowledge.
2. **Operational dependency** — CourtFlow becomes the live nerve center of every open-play session. Removing it means reverting to clipboards and missed payments.
3. **Multi-product lock-in** — A venue that uses CourtFlow (rotation), CourtPay (payments), and CourtPass (programs) has three interdependent systems. Switching one requires switching all.
4. **Staff muscle memory** — Staff learn to operate in under 3 seconds per action. Retraining to a new system has real cost.
5. **Player expectations** — Players expect QR check-in, push notifications when their court is ready, and digital pass management. Removing this degrades the player experience.

### Competitive Differentiation

| Feature | CourtFlow | Generic booking tools | Court management spreadsheets |
|---------|-----------|----------------------|-------------------------------|
| Real-time skill-balanced matchmaking | Yes | No | No |
| Face recognition check-in | Yes | No | No |
| Bank transfer auto-reconciliation (Sepay) | Yes | No | No |
| Structured class program passes | Yes | Rarely | No |
| Player-facing mobile app (CourtPass) | Yes | Sometimes | No |
| Reclub event integration | Yes | No | No |
| Multi-venue single dashboard | Yes | Depends | No |
| Staff payroll tracking | Yes | No | No |
| TV display mode | Yes | No | No |
| 15-minute onboarding | Yes | No | No |

---

## Roadmap

| Module | Status | Description |
|--------|--------|-------------|
| **Sepay auto-payment** | Live | Bank transfer webhook auto-confirms CourtPay payments |
| **Coaching module** | Live | Coach profiles, lesson packages, scheduling |
| **Payroll** | Live | Staff hours tracking and payment management |
| **Face recognition kiosk** | Live | AWS Rekognition for self-service check-in |
| **Push notifications (FCM)** | Live | Staff and player mobile push notifications |
| **PayOS (kiosk stickers)** | Live | PayOS QR-based sticker kiosk payments |
| **Auto-close sessions** | Live | Automatic 4h–5h session timeout |
| **CourtPay analytics export** | Live | Session-consolidated CSV export for monthly/weekly data |
| **CP Players (admin)** | Live | CourtPay player roster page with KPIs, detail drawer, face thumbnails |
| **Monthly SaaS billing** | Live | Flat monthly subscription with start/end dates, cancel flow, pro-rated first invoice |
| **Admin panel i18n** | Live | English + Vietnamese for admin pages |
| **Face thumbnails** | Live | 96px WebP thumbs for fast player list avatars (PWA + mobile + CP Players) |
| **Program Passes (admin)** | Live | Pass types, program runs, class instances, enrollment management, payment tracking, check-in |
| **Program Passes (player PWA)** | Live | Browse programs, enroll, upload payment proof, track attendance progress |
| **CourtPass Mobile App** | Live (v1.0) | Dedicated iOS/Android player app: browse programs, manage passes, view attendance |
| **Waitlist (program runs)** | Live | Players join a waitlist when a program run is at capacity; admin can promote waitlisted entries |
| **PayOS (CourtPay gateway)** | Coming soon | PayOS as an alternative gateway for CourtPay auto-payment |
| **CourtPass push notifications** | Coming soon | Class reminders, payment confirmations, and waitlist promotions via Expo Notifications |
| **Capacity & Waitlist (bookings)** | Planned | When all courts are booked, players join a waitlist |
| **Tournament Module** | Planned | Bracket generation, seeding, scoring, and scheduling |

---

## Design System

- **Theme:** Dark mode only
- **Background:** `#0a0a0a` (neutral-950)
- **Surfaces:** `#171717` (neutral-900), `#262626` (neutral-800)
- **Typography:** System font stack, no custom fonts
- **Icons:** Lucide (outline style, 16–24px)
- **Corner radius:** 12px cards, 16px modals, full for badges/pills
- **Components:** Buttons, modals, drawers, badges, toggle pills, inline editable fields, floating action bars, grid calendars, data tables with selective export

### Booking Grid Color System

| Element | Color | Hex |
|---------|-------|-----|
| Walk-in Booking | Purple | `#7c3aed` |
| Open Play (schedule + block) | Emerald | `#10b981` |
| Competition (schedule + block) | Blue | `#3b82f6` |
| Private Event | Amber | `#f59e0b` |
| Private Competition | Orange | `#f97316` |
| Maintenance | Neutral Grey | `#737373` |
| Available Slot | Dashed border | `#262626` |
| Selected Slot | Purple ring | `#7c3aed` |
