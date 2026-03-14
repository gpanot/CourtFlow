# CourtFlow — Complete System PRD

**Version:** 3.0 | **Date:** March 14, 2026
**Status:** Living Document — Full Platform Overview
**Product Type:** B2B SaaS — Multi-Venue Court Management Platform

---

## 1. Executive Summary

CourtFlow is a real-time court management platform purpose-built for pickleball facilities. It eliminates the chaos of manual court rotations by automating player queues, court assignments, skill-based matchmaking, and session management — across unlimited venues from a single platform.

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
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Backend | Express 5 (custom server) + Next.js API Routes |
| Database | PostgreSQL + Prisma ORM |
| Real-time | Socket.io (WebSocket) |
| State Management | Zustand (with persist) |
| Authentication | JWT + Phone OTP + Biometric Passkeys |
| Push Notifications | Web Push API (VAPID) |
| File Storage | Local uploads (venue logos) |
| Deployment | Railway (server + DB) |

### 4.3 Real-Time Architecture
Socket.io powers all live updates across surfaces:

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `court:updated` | Court status change | TV, Staff, Player |
| `queue:updated` | Queue position change | TV, Staff, Player |
| `session:updated` | Session open/close | TV, Staff, Player |
| `player:notification` | Court assigned, post-game, etc. | Player (+ Web Push) |
| `booking:created` | New court reservation | Staff |
| `booking:starting_soon` | 15 min before reserved slot | Staff |
| `membership:updated` | Tier change or activation | Player, Staff |

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
- View bookings and reserved courts
- Scoped to a single venue

### 5.3 Super Admin
- All staff capabilities across all venues
- Create and configure venues
- Manage staff accounts
- Configure membership tiers
- Configure booking settings
- View cross-venue analytics
- Access admin panel

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

Cross-venue management for super admins.

**Sections:**

| Section | Function |
|---------|----------|
| Overview | All venues at a glance, live status |
| Live Sessions | Active sessions across venues |
| Venues | Create, configure, manage venues |
| Staff | Add/remove/manage staff accounts |
| Players | Global player directory, search, history |
| Memberships | Tier management, member activation/suspension |
| Bookings | Court timeline, booking management |
| Analytics | Cross-venue performance data |

### MODULE 6 — Membership System

Venue-scoped membership tiers with session tracking.

**Tier Structure (1–4 per venue, fully customizable):**

| Field | Type |
|-------|------|
| Name | Custom (e.g., Silver, Gold, VIP) |
| Monthly Price | In cents |
| Sessions Included | Number or Unlimited |
| Badge Display | Toggle |

**Example Configurations:**

Simple venue (1 tier):
- Members: $30/mo — unlimited sessions

Standard venue (3 tiers):
- Basic: $20/mo — 8 sessions
- Premium: $40/mo — unlimited
- VIP: $60/mo — unlimited + badge

**Renewal Logic:**
- 30-day rolling cycle from activation date
- Session counter resets at cycle start
- Expired membership → player reverts to Drop-in automatically

**Player Experience:**
- Tier badge on profile and home screen
- Session usage counter (e.g., "8 / 12 sessions used")
- "Upgrade" → contact venue flow (WhatsApp / Email)

**Admin Features:**
- Create/edit up to 4 tiers per venue
- Activate membership for a player
- View all members, filter by tier and venue
- Suspend or cancel memberships
- See renewal dates and usage

**System Behavior:**
- Counter increments on queue join at that venue
- Session limit reached → soft warning, player can still play as Drop-in
- No queue priority changes (MVP) — fair rotation for everyone

### MODULE 7 — Court Booking

Players reserve a specific court for a fixed time slot. Booked courts are fully removed from open play rotation.

**Two Court Modes:**
- **Open Play** → managed by queue algorithm
- **Booked** → reserved, invisible to queue rotation

**Player Booking Flow:**
1. Home → "Book a Court"
2. Calendar view → select date
3. Slot grid → available courts × times
4. Select slot → court, time, price shown
5. Optional: add up to 3 co-players
6. Confirm booking
7. Confirmation screen + "Add to Calendar" / "Share"
8. Push reminder 30 min before

**Conflict Prevention:**
DB unique constraint on `(courtId, date, startTime)`. First INSERT wins; second gets "Slot no longer available."

**Admin Configuration (per venue):**
- Toggle which courts are bookable (`isBookable` flag)
- Slot duration (60 min MVP)
- Booking hours (start/end per day)
- Price per slot (flat rate)
- Cancellation policy (24h free cancellation MVP)

**Booking-to-Open-Play Transition:**
When a booking ends → court status set to idle → if session active, court returns to rotation pool → queue algorithm picks it up on next cycle.

**Staff Alert:** 15 minutes before a booking starts on an active open-play court, staff gets an amber alert to wrap up the current game.

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

### Core Models

```
Venue            → id, name, location, settings (JSON), logoUrl, tvText
Player           → id, name, phone, avatar, skillLevel, gender, gamePreference
StaffMember      → id, name, phone, email, role, passwordHash, venueId
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
MembershipTier   → id, venueId, name, priceInCents, sessionsIncluded, showBadge
Membership       → id, playerId, venueId, tierId, status, activatedAt, renewalDate, sessionsUsed
```

### Booking Models

```
Booking          → id, courtId, venueId, playerId, date, startTime, endTime,
                   status, priceInCents, coPlayerIds[], cancelledAt
```

### Key Enums

```
SkillLevel:      beginner | intermediate | advanced | pro
CourtStatus:     idle | warmup | active | maintenance
QueueStatus:     waiting | assigned | playing | on_break | left
SessionStatus:   open | closed
GameType:        men | women | mixed
MembershipStatus: active | suspended | expired | cancelled
BookingStatus:   confirmed | cancelled | completed | no_show
```

---

## 9. API Surface

### Authentication (7 endpoints)
`send-otp`, `verify-otp`, `register`, `signup`, `staff-login`, `biometric-login`, `staff-biometric-login`

### Queue Management (10 endpoints)
Join, leave, return, break, requeue, leave-warmup, staff-remove, preference, group (create/join/leave)

### Courts (5 endpoints)
List, state, update status, end game, replace player

### Sessions (8 endpoints)
Open, close, stats, feedback, game-type-mix, player-stats, history

### Players (5 endpoints)
Profile, history, sessions, notifications, end-session

### Venues (5 endpoints)
List, detail, courts, logo upload, update

### Admin (8 endpoints)
Analytics, venues, staff CRUD, players, setup-status

### Membership (8 endpoints)
Player: list tiers, my membership
Admin: list members, activate, suspend/cancel, CRUD tiers

### Booking (8 endpoints)
Player: availability, create, my bookings, cancel
Staff: list bookings, manual booking, update status
Admin: booking configuration

### Push (2 endpoints)
Subscribe, unsubscribe

**Total: ~66 API endpoints**

---

## 10. Screen Inventory

### Player App — 21 screens

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
| 12 | Profile & History | Core |
| 13 | Membership Plans (M1) | Membership |
| 14 | My Membership (M2, in profile) | Membership |
| 15 | Book a Court — Calendar (B1) | Booking |
| 16 | Slot Detail + Confirm (B2) | Booking |
| 17 | Booking Confirmed (B3) | Booking |
| 18 | My Bookings (B4) | Booking |

### Staff Dashboard — 6 screens

| # | Screen | Module |
|---|--------|--------|
| 19 | Staff Login | Auth |
| 20 | Court Overview + Actions | Core |
| 21 | Queue Management | Core |
| 22 | Session Management | Core |
| 23 | QR Code Display | Core |
| 24 | Booking View (on court cards) | Booking |

### TV Display — 1 screen

| # | Screen | Module |
|---|--------|--------|
| 25 | Court Grid + Queue Panel | Core |

### Admin Panel — 10 screens

| # | Screen | Module |
|---|--------|--------|
| 26 | Overview Dashboard | Core |
| 27 | Live Sessions | Core |
| 28 | Venue Management | Core |
| 29 | Staff Management | Core |
| 30 | Player Directory | Core |
| 31 | Membership Management (M3) | Membership |
| 32 | Court Timeline View (B5) | Booking |
| 33 | Booking Configuration (B6) | Booking |
| 34 | Analytics | Core |
| 35 | Onboarding Wizard | Setup |

**Total: 35 screens across 4 surfaces**

---

## 11. Design System

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
| Reserved/Booked | #7c3aed (purple-600) |
| Active/Success | #16a34a (green-600) |
| Warning | #f59e0b (amber-500) |
| Error | #b91c1c (red-700) |

**Typography:** System font stack, 4px grid spacing
**Icons:** Lucide (outline, 16–24px)
**Corner radius:** 12px cards, 16px modals, full for badges
**Touch targets:** 48×48px minimum
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
| **Membership + Booking** | Revenue generation tools, not just court management |

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

### V1 (Current) — Core Platform
- Queue & rotation engine
- Player app (PWA)
- Staff dashboard
- TV display
- Admin panel
- Play Together groups
- Push notifications
- Multi-venue support

### V1.5 (In Progress) — Revenue Features
- Membership system (manual activation)
- Court booking (calendar + slot grid)
- Capacity display (session limits)

### V2 (Planned) — Monetization & Scale
- Stripe payment integration (auto-renewal, booking payments)
- Queue priority by membership tier
- Recurring bookings
- Dynamic / peak pricing
- Waitlist with cascading promotion
- Revenue analytics dashboard
- Member discount pricing
- Configurable cancellation policies
- TV display: membership badges + reserved court state

### V3 (Future)
- Tournament mode
- League standings
- Score tracking
- Advanced player analytics
- Third-party calendar integration
- API access for enterprise

---

## 16. Deployment

**Infrastructure:** Railway
- Custom Express server serves Next.js + Socket.io
- PostgreSQL database on same platform
- Uploads stored locally (venue logos)

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

_End of System PRD — CourtFlow v3.0_
