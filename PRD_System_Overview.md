# CourtFlow — Complete System PRD

**Version:** 4.0 | **Date:** March 20, 2026
**Status:** Living Document — Full Platform Overview
**Product Type:** B2B SaaS — Multi-Venue Court Management Platform

---

## 1. Executive Summary

CourtFlow is a real-time court management platform purpose-built for pickleball facilities. It eliminates the chaos of manual court rotations by automating player queues, court assignments, skill-based matchmaking, and session management — across unlimited venues from a single platform.

Beyond live session management, CourtFlow is now a **complete venue operations platform** covering court bookings with dynamic pricing, recurring weekly schedules, membership management with payment tracking, staff payroll, private coaching, and on-demand court blocking for events and maintenance.

The system serves four user surfaces through a single PWA:

| Surface | Audience | Device |
|---------|----------|--------|
| **Player App** | Players at the venue | Mobile (PWA) |
| **Staff Dashboard** | Venue staff managing courts | Tablet / Phone |
| **TV Display** | Everyone in the venue | Any screen with a browser |
| **Admin Panel** | Venue owners / Super admins | Desktop / Tablet |

**One codebase. Four experiences. Zero app store friction.**

---

## 2. The Problem

Pickleball is the fastest-growing sport in North America, yet court management at facilities is stuck in the clipboard era.

| Pain Point | Impact |
|-----------|--------|
| **Courts sit idle between games** | Revenue lost, players frustrated |
| **Manual rotations are unfair** | Regulars hog courts, newcomers leave |
| **Staff overwhelmed** | Whiteboards, shouting names, tracking who's next |
| **No visibility** | Players can't see queue position, no play-time data |
| **Skill mismatches** | Beginners paired with pros, bad experience for everyone |
| **Groups can't play together** | Friends split across rotations, social friction |
| **Multi-venue operators blind** | No cross-location data, inconsistent player experience |

CourtFlow solves all of these with a single platform.

---

## 3. Design Philosophy

> **"The phone is a notification device. The TV is the game controller."**

### Player: 3 interactions per game cycle
1. **Join** — one tap on arrival
2. **Go play** — push notification tells them which court
3. **After game** — one tap: re-queue, break, or leave

No confirmation dialogs. No timers to manage. No mid-game phone use.

### Staff: Speed above everything
Watch courts physically. Tap "End Game" when a court empties. Rotation triggers automatically. Under 3 seconds, zero dialogs for routine actions.

### TV Display: Shared reference point
Everyone looks at the TV. Court labels match physical signs. Real-time court status, elapsed timers, and queue visible to all.

---

## 4. Architecture

### 4.1 Multi-Tenant Model
- Single backend, all venues on one platform
- All data venue-scoped (venue_id on every table)
- Player profiles are global — one account across all venues
- Staff sees only their assigned venue
- Super Admin sees everything

### 4.2 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.1 (App Router), React 19.2, Tailwind CSS 4 |
| Backend | Express 5.1 (custom server) + Next.js API Routes |
| Database | PostgreSQL + Prisma 6.5 ORM |
| Real-time | Socket.io 4.8 (WebSocket) |
| State Management | Zustand 5 (with persist) |
| Authentication | JWT + Phone OTP + Biometric Passkeys |
| Push Notifications | Web Push API (VAPID) |
| PDF Export | jsPDF |
| QR Codes | qrcode.react |
| File Storage | Local uploads (venue logos, payment proofs) |
| Deployment | Railway (server + DB) |

### 4.3 Real-Time Architecture
Socket.io powers all live updates across surfaces via venue-scoped rooms (`venue:{id}`) and player-scoped rooms (`player:{id}`):

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `court:updated` | Court status change | TV, Staff, Player |
| `queue:updated` | Queue position change | TV, Staff, Player |
| `session:updated` | Session open/close | TV, Staff, Player |
| `player:notification` | Court assigned, post-game, etc. | Player (+ Web Push) |
| `booking:created` | New court reservation | Staff |
| `booking:starting_soon` | 15 min before reserved slot | Staff |
| `membership:updated` | Tier change or activation | Player, Staff |
| `lesson:updated` | Coach lesson status change | Staff, Admin |

---

## 5. User Roles & Permissions

### 5.1 Player
- Register via phone OTP (no password)
- Join queue solo or with a group
- Receive court assignments via push notification
- Manage post-game flow (re-queue / break / leave)
- View profile, match history, membership, bookings
- Book courts for private play

### 5.2 Venue Staff
- Open/close sessions
- Activate/deactivate courts mid-session
- End games (triggers rotation)
- Manage individual players (end session, break, skill adjust)
- Manage queue (bump, remove, add manual players)
- Create and manage bookings for walk-in players
- View bookings and reserved courts
- Can be assigned to multiple venues (many-to-many)
- Act as coaches for private/group lessons

### 5.3 Super Admin
- All staff capabilities across all venues
- Create and configure venues (courts, booking config, schedule, membership config)
- Manage staff accounts and venue assignments
- Configure membership tiers with perks and payment tracking
- Configure booking settings with dynamic pricing rules
- Manage weekly schedule (recurring sessions)
- Create/manage court blocks for events and maintenance
- Manage coaching packages and lessons
- Manage staff payroll (hours, payments, export)
- View cross-venue analytics
- Access full admin panel

### 5.4 Authentication Model

| Role | Auth Method | Token |
|------|------------|-------|
| Player | Phone OTP (6 digits, 5 min expiry) | JWT with `role: "player"` |
| Staff | Phone + Password (bcrypt) | JWT with `role: "staff"`, `venueId` |
| Super Admin | Phone + Password + optional Biometric | JWT with `role: "superadmin"` |

Authorization helpers: `requireAuth()`, `requireStaff()`, `requireSuperAdmin()`

---

## 6. Core Modules

### MODULE 1 — Queue & Rotation Engine

The heart of CourtFlow. Manages the player queue and court assignment algorithm.

**Queue Entry Lifecycle:**
```
Join Queue → Waiting → Assigned → Playing → Post-Game
                ↕                              ↓
            On Break ←←←←←←←←←←←←←←←←← Take Break
                                               ↓
                                          End Session → Left
```

**Rotation Algorithm:**
```
Priority = minutes_waiting - total_play_minutes_today + skill_match_bonus
```

When a court becomes available:
1. Evaluate top queue entries (solo + groups as units)
2. Group of 4 → assign directly
3. Group of 2–3 → assign group + fill remaining with skill-matched solos
4. All solo → top 4 by priority, checking skill balance + game preference
5. Max 1 skill-level gap between any two players on a court
6. Game preference honored (same-gender / no preference) as soft filter
7. Look-ahead up to 8 positions if top entries can't balance
8. Push notification to all assigned players
9. 3-minute warmup countdown → auto-start

**Post-Game Flow:**
- Staff taps "End Game" → all 4 players notified
- Players choose: Re-queue / Break (5–30 min) / End Session
- No response in 3 min → auto re-queue (player safety net)
- Break expires → auto re-queue (never auto-eject)

### MODULE 2 — Play Together (Groups)

Lightweight group system using short codes — no friend lists, no contacts access.

**How it works:**
1. Player taps "Play with Friends" → generates 4-character code (e.g., "PB47")
2. Friends enter code → join group (2–4 players)
3. Group moves through queue as a single unit
4. Queue position anchored to longest-waiting member
5. Group assigned to same court; if 2–3 players, solos fill remaining spots
6. Post-game: each member chooses independently (re-queue / break / leave)
7. Group dissolves if < 2 members remain

**Constraints:**
- Max 1 skill-level gap within group (soft rule, staff can override)
- Group play time averaged for priority calculation
- Groups are session-scoped (not persistent across venues)

### MODULE 3 — Staff Dashboard

Every routine action completes in under 3 seconds.

**Session Management:**
- Open session → select courts → TV goes live, queue opens
- Close session → players notified, queue locks, summary generated

**Court Management:**
- Court cards: label, status, players, elapsed timer
- End Game: one tap, no confirmation dialog
- Add/remove courts mid-session with graceful TV reflow
- Maintenance mode: court marked red, excluded from rotation

**Player Management (from any entry point):**
- End player session → replacement pulled from queue
- Move to break → custom duration
- Adjust skill level → takes effect on next assignment
- All actions logged with staff ID and reason

**Queue Management:**
- Bump / remove / add manual players
- Break or merge groups
- Manual player support (no smartphone needed)

### MODULE 4 — TV Display

Web app — any browser, any Wi-Fi screen. Designed for 55"+ TV viewed from 5+ meters.

**Layout:**
- Top bar: venue name, time, session status, court count
- Main: dynamic court grid (adapts to active court count)
- Side/bottom: queue panel (next 8–10 entries)

**Court Card States:**

| State | Color | Content |
|-------|-------|---------|
| Active | Green | Label, player names, elapsed timer |
| Starting | Blue | Label, player names, countdown |
| Idle | Grey | Label, "Available" |
| Maintenance | Red | Label, "Out of Service" |
| Reserved | Purple | Label, booker name, time slot |

**Elapsed Timer Visual Cues:**

| Time | Color | Signal |
|------|-------|--------|
| 0–19:59 | White | Normal |
| 20:00–29:59 | Orange | Running long |
| 30:00+ | Red | Overdue |

No buzzer. Color shift creates natural social pressure.

**Resilience:** Disconnect → last known state + "Reconnecting..." banner. Auto-reconnects. Grid reflows on court changes.

### MODULE 5 — Admin Panel

Cross-venue management for super admins. Admin-first architecture — the admin panel is the primary interface; player and staff apps are secondary consumers of the same API.

**Sections:**

| Section | Function |
|---------|----------|
| Overview | All venues at a glance — total players, games, sessions; recent sessions table |
| Live Sessions | Active sessions across venues with real-time monitoring |
| Venues | Create, configure, manage venues; CourtsManager (add/rename/delete courts, toggle `isBookable`); TV display settings (logo, tvText, logoSpin) |
| Staff | Add/remove/manage staff accounts; venue assignment; password reset |
| Payroll | Weekly payroll view with hours worked and amounts; cumulative hours tracking; mark payments as paid with method and notes; export payroll data |
| Players | Global player directory — add, edit, delete profiles; view stats and session history; filter by skill/gender/preference; search by name or phone |
| Memberships | Tier CRUD; member activation/suspension/cancellation; payment tracking with proof upload; monthly payment summary dashboard |
| Bookings | Day planner grid (courts × time slots); multi-slot and multi-court booking; dynamic pricing configuration; weekly schedule management; court blocks |
| Coaching | Coach package management (private/group lessons); lesson scheduling and booking; lesson payment confirmation with proof upload; coach availability view |
| Analytics | Cross-venue performance data — trends and usage patterns |
| Setup Wizard | Onboarding banner guiding new admins through initial configuration |

### MODULE 6 — Membership System

Venue-scoped membership tiers with session tracking, payment management, and configurable perks.

**Tier Structure (per venue, fully customizable):**

| Field | Type |
|-------|------|
| Name | Custom (e.g., Silver, Gold, VIP) |
| Price | In cents |
| Sessions Included | Number or Unlimited |
| Cycle Length | Days (default 30) |
| Perks | Configurable text items |
| Badge Display | Toggle |
| Sort Order | Display ordering |

**Example Configurations:**

Simple venue (1 tier):
- Members: $30/mo — unlimited sessions

Standard venue (3 tiers):
- Basic: $20/mo — 8 sessions
- Premium: $40/mo — unlimited, perk: "-10% Coffee Shop"
- VIP: $60/mo — unlimited + badge, perk: "Priority Tournament Registration"

**Renewal & Payment Logic:**
- Rolling cycle from activation date (configurable cycle length in days)
- Session counter resets at cycle start
- Payment records auto-generated each billing cycle (UNPAID → PAID or OVERDUE)
- Admin confirms payment with: amount, method (cash / bank transfer / other), date, proof image upload, notes
- Ability to revert PAID back to UNPAID
- Tier upgrade/downgrade adjusts the current unpaid payment amount
- Expired/overdue membership → automatic expiration after grace period

**Player Experience:**
- Tier badge on profile and home screen
- Session usage counter (e.g., "8 / 12 sessions used")
- "Upgrade" → contact venue flow (WhatsApp / Email via membership config)

**Admin Features:**
- Create/edit tiers per venue with perks and sort order
- Activate membership for a player with tier selection
- Inline session usage editing for admin adjustments
- View all members, filter by tier, venue, and status
- Suspend or cancel memberships
- Payment history drawer per member
- Monthly payment summary dashboard (collected, unpaid, overdue)
- Membership contact config (WhatsApp number, email)

**System Behavior:**
- Counter increments on queue join at that venue
- Session limit reached → soft warning, player can still play as Drop-in
- No queue priority changes (MVP) — fair rotation for everyone

### MODULE 7 — Court Booking

Walk-in and admin-created bookings for specific courts and time slots. Booked courts are fully removed from open play rotation.

**Day Planner Grid (Admin/Staff):**
- Vertical timeline with courts as columns and time slots as rows
- Full daily occupancy visible at a glance
- Multi-slot booking — select one or multiple consecutive time slots
- Multi-court selection — select slots across multiple courts to block or schedule
- Color-coded by type: purple (walk-in booking), green (open play), blue (competition), amber (private event), orange (private competition), grey (maintenance)

**Dynamic Pricing:**
- Default price per slot (venue-wide)
- Per-day/per-hour pricing rules (e.g., weekday morning $10, weekend evening $20)
- Rules configured as: `dayOfWeek`, `startHour`, `endHour`, `priceInCents`
- Prices stored in cents, displayed as dollars

**Booking Configuration (per venue, stored in `settings.bookingConfig`):**
- Toggle which courts are bookable (`isBookable` flag per court)
- Slot duration (default 60 min)
- Booking hours (start/end per day)
- Default price + per-day/hour pricing rules
- Cancellation policy (configurable hours before start)

**Conflict Prevention:**
DB unique constraint on `(courtId, date, startTime)`. First INSERT wins; second gets "Slot no longer available." Real-time availability checks prevent double-booking.

**Staff Booking:**
- Staff can create bookings from the day planner grid
- Search player, select court + time, confirm
- Manage booking status (confirm, cancel, mark no-show)

**Booking-to-Open-Play Transition:**
When a booking ends → court status set to idle → if session active, court returns to rotation pool → queue algorithm picks it up on next cycle.

**Staff Alert:** 15 minutes before a booking starts on an active open-play court, staff gets an amber alert to wrap up the current game.

### MODULE 8 — Weekly Schedule (Recurring Sessions)

Venues configure recurring weekly schedules for Open Play and Competition sessions that automatically appear in the booking calendar.

**How it works:**
- Admin defines schedule entries in venue settings (`settings.scheduleConfig`): type, title, days of week, time range, courts
- Entries repeat every week automatically — no need to create individual records
- Scheduled slots appear as colored blocks in the day planner (green = Open Play, blue = Competition)
- Walk-in bookings cannot overlap with scheduled times
- Staff opening a live session does not affect the schedule display — the schedule is the plan, the session is the execution

**Schedule Entry Fields:**
- `type`: open_play | competition
- `title`: custom name (e.g., "Morning Open Play")
- `daysOfWeek`: array of day numbers (0–6)
- `startHour` / `endHour`: time range
- `courtIds`: which courts are included

**Example Schedule:**
- Mon/Wed/Fri 8–10 AM: "Morning Open Play" (Courts A–D)
- Thu 7–9 PM: "Thursday Night Competition" (All courts)
- Sat 9 AM–12 PM: "Weekend Open Play" (All courts)

### MODULE 9 — Court Blocks (On-Demand Time Blocking)

For one-off events that don't fit the recurring schedule, admins can block court time directly from the booking grid.

**Block Types:**

| Type | Color | Description |
|------|-------|-------------|
| **Open Play** | Green | One-off open play session outside the weekly schedule |
| **Competition** | Blue | One-off competition event |
| **Private Event** | Amber | Company events, private parties (no player booking) |
| **Private Competition** | Orange | Invitation-only tournaments |
| **Maintenance** | Grey | Court resurfacing, repairs, etc. |

**UX Flow:**
1. Select time slots on one or more courts in the grid
2. Choose from the floating action bar: **Open Play**, **Block Time**, or **+Book**
3. Fill in type, title, courts, time range, and notes
4. The block appears immediately in the grid with its distinct color

Court blocks override the recurring schedule — useful for cancelling a regular Open Play for a special event.

### MODULE 10 — Staff & Payroll

**Staff Management:**
- Create staff accounts with roles (staff / superadmin)
- Many-to-many venue assignment (staff can work at multiple venues)
- Password management with reset capability
- Biometric login support

**Payroll:**
- Automatic hours tracking based on session open/close times
- Weekly payroll view with hours worked and calculated amount
- Cumulative hours tracking per staff member
- Payment status tracking (UNPAID → PAID)
- Mark payments as paid with method, date, and notes
- `StaffPayment` records: unique per `[staffId, weekStart]`
- Export payroll data (PDF/CSV)

### MODULE 11 — Coaching System

Private and group coaching lesson management for venue-based coaches.

**Coach Packages:**
- Admin creates packages per venue per coach (staff members act as coaches)
- Package fields: name, description, lesson type (private / group), duration in minutes, price, sessions included, active status, sort order
- Packages displayed in admin coaching section

**Coach Lessons:**
- Schedule individual lessons: venue, coach, player, court, date, time range
- Link lessons to packages for session tracking
- Lesson statuses: confirmed → completed / cancelled / no_show
- Payment tracking per lesson: price, payment status, method, proof upload, notes
- Coach availability view based on existing lessons and schedule

**Admin Features:**
- Full CRUD for packages and lessons
- Payment confirmation modal with proof image upload
- Filter lessons by date, coach, status
- View coach availability before scheduling

---

## 7. Notification System

### Push Notifications (Web Push API)

| Trigger | Message | Audience |
|---------|---------|----------|
| Court assigned | "Court A — go play!" | Assigned players |
| Game ended | "Good game! What's next?" | All 4 players |
| Break ending | "Break ending soon" | Player on break |
| Removed by staff | "Session ended by staff" | Removed player |
| Group member left | "A group member has left" | Remaining members |
| Session closing | "Session is ending" | All players |
| Replacement needed | "A replacement is coming" | 3 remaining players |
| Membership activated | "Welcome to Gold!" | Player |
| Membership renewal | "Renews in 7 days" | Player |
| Booking confirmed | "Court A booked for Thu 14:00" | Player |
| Booking reminder | "Court A in 30 minutes" | Player |

### In-App Toasts
- Slide down from top
- Dark surface (neutral-800), rounded-xl
- Icon + message + dismiss
- Auto-dismiss after 4 seconds

---

## 8. Database Schema

### Core Models (22 total)

```
Venue            → id, name, location, settings (JSON), logoUrl, tvText, logoSpin
Player           → id, name, phone, avatar, skillLevel, gender, gamePreference
StaffMember      → id, name, phone, email, role, passwordHash, venues[] (many-to-many)
Court            → id, venueId, label, status, activeInSession, isBookable
Session          → id, venueId, date, status, openedAt, closedAt, maxPlayers
QueueEntry       → id, sessionId, playerId, groupId, status, breakUntil
PlayerGroup      → id, sessionId, code, status
CourtAssignment  → id, courtId, sessionId, playerIds[], gameType, isWarmup
PushSubscription → id, playerId, endpoint, p256dh, auth
AuditLog         → id, venueId, staffId, action, targetId, reason
OtpCode          → id, phone, code, expiresAt, verified, attempts
```

### Membership Models

```
MembershipTier   → id, venueId, name, priceInCents, sessionsIncluded, cycleLengthDays,
                   showBadge, perks[], sortOrder, active
Membership       → id, playerId, venueId, tierId, status, activatedAt, renewalDate, sessionsUsed
MembershipPayment → id, membershipId, venueId, playerId, tierId, cycleStart, cycleEnd,
                    amountInCents, status (UNPAID/PAID/OVERDUE), paidAt, paidDate,
                    paymentMethod, proofUrl, note, confirmedById
```

### Booking Models

```
Booking          → id, courtId, venueId, playerId, date, startTime, endTime,
                   status, priceInCents, coPlayerIds[], cancelledAt
CourtBlock       → id, venueId, courtIds[], type, title, date, startTime, endTime,
                   notes, createdById
```

### Payroll Models

```
StaffPayment     → id, staffId, weekStart, totalHours, amount, paymentMethod,
                   status (UNPAID/PAID), paidAt, paidDate, paidById, note
                   (unique on [staffId, weekStart])
```

### Coaching Models

```
CoachPackage     → id, coachId, venueId, name, description, lessonType (private/group),
                   durationMin, priceInCents, sessionsIncluded, active, sortOrder
CoachLesson      → id, venueId, coachId, playerId, courtId, packageId, date,
                   startTime, endTime, status, priceInCents, paymentStatus,
                   paidAt, paymentMethod, proofUrl, paymentNote
```

### Key Enums

```
SkillLevel:              beginner | intermediate | advanced | pro
CourtStatus:             idle | warmup | active | maintenance
QueueStatus:             waiting | assigned | playing | on_break | left
SessionStatus:           open | closed
GameType:                men | women | mixed
MembershipStatus:        active | suspended | expired | cancelled
MembershipPaymentStatus: UNPAID | PAID | OVERDUE
BookingStatus:           confirmed | cancelled | completed | no_show
CourtBlockType:          open_play | competition | private_event | private_competition | maintenance
LessonType:              private | group
CoachLessonStatus:       confirmed | completed | cancelled | no_show
```

### Venue Settings (JSON)

Configuration stored in `Venue.settings` for flexibility without schema changes:

```json
{
  "autoStartDelay": 180,
  "postGameTimeout": 180,
  "breakOptions": [5, 10, 15, 20, 30],
  "gpsRadius": 200,
  "maxGroupSize": 4,
  "maxSkillGap": 1,
  "defaultCourtType": "mixed",
  "bookingConfig": {
    "slotDurationMinutes": 60,
    "bookingStartHour": 8,
    "bookingEndHour": 22,
    "defaultPriceInCents": 0,
    "pricingRules": [{ "dayOfWeek": 6, "startHour": 17, "endHour": 21, "priceInCents": 2000 }],
    "cancellationHours": 24
  },
  "scheduleConfig": {
    "entries": [{ "type": "open_play", "title": "Morning Open Play", "daysOfWeek": [1,3,5], "startHour": 8, "endHour": 10, "courtIds": ["..."] }]
  },
  "membershipConfig": {
    "contactWhatsApp": null,
    "contactEmail": null
  }
}
```

---

## 9. API Surface

### Authentication (7 endpoints)
`send-otp`, `verify-otp`, `register`, `signup`, `staff-login`, `staff-biometric-login`, `validate-token`

### Queue Management (13 endpoints)
Join, leave, return, break, requeue, leave-warmup, staff-remove, group (create/join/leave/dissolve/staff-create)

### Courts (8 endpoints)
List, state, update, delete, start-game, end-game, warmup-assign, warmup-autofill, replace-player

### Sessions (9 endpoints)
Open, close, delete, stats, feedback, game-type-mix (GET/PATCH), player-stats, history

### Players (7 endpoints)
Profile (GET/PATCH), history, sessions, notifications (GET/PATCH), end-session

### Venues (7 endpoints)
List, detail, update, delete, courts (create), logo upload/delete

### Admin — Core (5 endpoints)
Analytics, venues (list/create), setup-status, upload

### Admin — Staff & Payroll (10 endpoints)
Staff CRUD, password reset, hours (detail/cumulative/export), payroll (list/export/update-status)

### Admin — Players (5 endpoints)
List, create, detail, update, delete

### Admin — Memberships (10 endpoints)
Members: list, update, activate
Tiers: CRUD (list, create, detail, update, delete)
Payments: list, update

### Admin — Venue Config (3 endpoints)
Booking config, schedule config, membership config

### Admin — Court Blocks (5 endpoints)
CRUD: list, create, detail, update, delete

### Admin — Coaching (10 endpoints)
Coaches: list, availability
Packages: CRUD (list, create, detail, update, delete)
Lessons: CRUD (list, create, detail, update, delete)

### Booking — Player/Staff (5 endpoints)
Availability, create, my bookings, cancel
Staff: list, create, update

### Push (3 endpoints)
Subscribe, unsubscribe, test

### Other (2 endpoints)
Onboarding complete, PWA manifest

**Total: ~109 API endpoints**

---

## 10. Screen Inventory

### Player App — 18 screens

| # | Screen | Module |
|---|--------|--------|
| 1 | Splash / Landing | Core |
| 2 | Phone Entry | Auth |
| 3 | OTP Verification | Auth |
| 4 | Profile Setup (Onboarding) | Auth |
| 5 | Home / Venue Select | Core |
| 6 | Queue Waiting — Solo | Queue |
| 7 | Play Together — Group Code | Groups |
| 8 | Queue Waiting — Group | Groups |
| 9 | Court Assigned | Game |
| 10 | In-Game | Game |
| 11 | Post-Game | Game |
| 12 | Session Recap | Core |
| 13 | Profile & History | Core |
| 14 | Membership Plans | Membership |
| 15 | My Membership (in profile) | Membership |
| 16 | Book a Court — Calendar | Booking |
| 17 | My Bookings | Booking |
| 18 | PWA Install Prompt | Core |

### Staff Dashboard — 7 screens

| # | Screen | Module |
|---|--------|--------|
| 19 | Staff Login (phone + password, biometric) | Auth |
| 20 | Role / Venue Selection | Auth |
| 21 | Court Overview + Actions | Core |
| 22 | Queue Management | Core |
| 23 | Session Management (open/close, history) | Core |
| 24 | QR Code Display | Core |
| 25 | Booking View (staff bookings) | Booking |

### TV Display — 1 screen

| # | Screen | Module |
|---|--------|--------|
| 26 | Court Grid + Queue Panel | Core |

### Admin Panel — 13 screens

| # | Screen | Module |
|---|--------|--------|
| 27 | Overview Dashboard | Core |
| 28 | Live Sessions | Core |
| 29 | Venue Management + Courts Manager | Core |
| 30 | Staff Management | Core |
| 31 | Payroll Management | Payroll |
| 32 | Player Directory | Core |
| 33 | Membership Management (tiers, members, payments) | Membership |
| 34 | Bookings — Day Planner Grid | Booking |
| 35 | Bookings — Schedule Config | Booking |
| 36 | Bookings — Court Blocks | Booking |
| 37 | Coaching (packages, lessons, payments) | Coaching |
| 38 | Analytics | Core |
| 39 | Setup Wizard Banner | Setup |

**Total: 39 screens across 4 surfaces**

---

## 11. Design System

### Core Tokens

| Token | Value |
|-------|-------|
| Background | #0a0a0a (neutral-950) |
| Surface 1 | #171717 (neutral-900) |
| Surface 2 | #262626 (neutral-800) |
| Border | #404040 (neutral-700) |
| Text primary | #ffffff |
| Text secondary | #a3a3a3 (neutral-400) |
| Brand / Primary | #22c55e (green-500) |
| Admin accent | #a855f7 (purple-500) |
| Staff accent | #3b82f6 (blue-500) |
| Active/Success | #16a34a (green-600) |
| Warning | #f59e0b (amber-500) |
| Error | #b91c1c (red-700) |

### Booking Grid Colors

| Element | Color | Hex |
|---------|-------|-----|
| Walk-in Booking | Purple | #7c3aed |
| Open Play (schedule + block) | Emerald | #10b981 |
| Competition (schedule + block) | Blue | #3b82f6 |
| Private Event | Amber | #f59e0b |
| Private Competition | Orange | #f97316 |
| Maintenance | Neutral Grey | #737373 |
| Available Slot | Dashed border | #262626 |
| Selected Slot | Purple ring | #7c3aed |

**Theme:** Dark mode only
**Typography:** System font stack, 4px grid spacing
**Icons:** Lucide (outline, 16–24px)
**Corner radius:** 12px cards, 16px modals, full for badges/pills
**Touch targets:** 48×48px minimum
**Components:** Buttons, modals, drawers, badges, toggle pills, inline editable fields, floating action bars, grid calendars
**Accessibility:** WCAG 2.1 AA minimum

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Court idle time between rotations | < 2 minutes |
| Play time deviation across players | < 15% per session |
| Player phone interactions per game | ≤ 3 |
| Staff "End Game" action time | < 3 seconds |
| Player satisfaction rating | ≥ 4.2 / 5 |
| "Play Together" adoption | ≥ 20% of sessions |
| Homepage bounce rate | < 40% |
| CTA click-through | > 8% |
| Time on page (homepage) | > 90 seconds |

---

## 13. Competitive Advantages

| Advantage | Why It Matters |
|-----------|---------------|
| **Zero app download** | PWA — scan QR, play. No App Store friction |
| **Real-time everything** | WebSocket on all surfaces, no stale data |
| **TV-first design** | The big screen runs the venue, phones just notify |
| **Smart rotation algorithm** | Wait time + play time + skill balance = fairness |
| **Group play built-in** | 4-character code, no friend lists, no friction |
| **Multi-venue from day one** | Single platform scales from 1 to 100 venues |
| **Staff speed** | Under 3 seconds for any routine action |
| **Complete venue operations** | Booking + membership + payroll + coaching — not just court management |
| **Dynamic pricing** | Per-day/per-hour pricing rules maximize revenue |
| **Zero hardware cost** | Any browser, any screen — no proprietary hardware needed |

---

## 14. Pricing Model (B2B)

| Tier | Price | Best For |
|------|-------|----------|
| **Starter** | $99/mo | Single venue, up to 6 courts |
| **Pro** | $249/mo | Growing venues, up to 12 courts |
| **Enterprise** | Custom | Multi-venue operators |

All plans include: queue & rotation, TV display, staff dashboard, push notifications, membership system, court booking.

---

## 15. Roadmap

### V1 (Complete) — Core Platform
- Queue & rotation engine
- Player app (PWA)
- Staff dashboard
- TV display
- Admin panel
- Play Together groups
- Push notifications
- Multi-venue support

### V1.5 (Complete) — Revenue Features
- Membership system with payment tracking (manual activation, proof upload)
- Court booking (day planner grid + slot selection)
- Dynamic pricing (per-day/per-hour rules)
- Weekly schedule (recurring Open Play & Competitions)
- Court blocks (on-demand time blocking for events & maintenance)
- Capacity display (session limits)
- Configurable cancellation policies

### V2 (Complete) — Operations Suite
- Staff payroll (automatic hours tracking, weekly payments, export)
- Coaching system (packages, lessons, payment tracking)
- Membership payment management (cycle-based, proof upload, overdue tracking)
- Court management (add/rename/delete courts, bookable toggle)
- Admin setup wizard
- PDF export for payroll

### V2.5 (In Progress) — Player Booking App
- Full booking flow in the player app (currently admin/staff-only for walk-ins)
- Player-facing court availability and booking confirmation

### V3 (Planned) — Monetization & Scale
- Stripe payment integration (auto-renewal, booking payments, coaching payments)
- Queue priority by membership tier
- Recurring bookings
- Waitlist with cascading promotion
- Revenue analytics dashboard
- Member discount pricing

### V4 (Future)
- Tournament mode & bracket generation
- League standings
- Score tracking
- Advanced player analytics
- Third-party calendar integration
- API access for enterprise
- Coach booking from player app

---

## 16. Deployment

**Infrastructure:** Railway
- Custom Express server serves Next.js + Socket.io
- PostgreSQL database on same platform
- Uploads stored locally (venue logos, payment proofs)

**Environment:**
- `DATABASE_URL` — Postgres connection
- `NEXTAUTH_SECRET` — JWT signing
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push
- `NEXT_PUBLIC_BASE_URL` — App URL

**Demo Credentials:**
- Staff: `+10000000001` / `staff123`
- Admin: `+10000000000` / `admin123`
- Unlocked by tapping app title 5 times

---

_End of System PRD — CourtFlow v4.0_
