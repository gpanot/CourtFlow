# CourtFlow — Product Overview

**Version 2.0 · March 2026**
**Tagline:** The all-in-one court management platform for pickleball venues.

---

## What is CourtFlow?

CourtFlow started as a real-time rotation system for 200+ player open-play sessions. It has evolved into a **complete court management platform** that handles everything a pickleball venue needs — from live session management and automated matchmaking to court bookings, memberships, staff payroll, and scheduling.

The platform serves four distinct user types through dedicated interfaces:

| Interface | Users | Purpose |
|-----------|-------|---------|
| **Admin Panel** | Venue owners, managers | Full venue operations: bookings, memberships, payments, staff, analytics |
| **Staff Dashboard** | Front-desk staff, session managers | Run live sessions, manage queue, assign courts, create bookings |
| **Player App** | Members, walk-in players | Join queue, view courts, manage profile, book courts |
| **TV Display** | Public screens at venue | Show live court status, queue, and branding |

All interfaces are **PWA-ready** (Progressive Web App) with push notifications and work on any device.

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
- Session statistics and player history
- TV Display mode for public screens

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
- **Dynamic pricing** — different prices per day of week and hour range (e.g., weekday morning $10, weekend evening $20)
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
- Admin defines schedule entries in venue settings: type, title, days of week, time range, courts
- Entries repeat every week automatically — no need to create individual records
- Scheduled slots appear as colored blocks in the day planner (green = Open Play, blue = Competition)
- Walk-in bookings cannot overlap with scheduled times
- Staff opening a live session does not affect the schedule display — the schedule is the plan, the session is the execution

**Example schedule:**
- Mon/Wed/Fri 8–10 AM: "Morning Open Play" (Courts A–D)
- Thu 7–9 PM: "Thursday Night Competition" (All courts)
- Sat 9 AM–12 PM: "Weekend Open Play" (All courts)

---

### 4. Court Blocks (On-Demand Time Blocking)

For one-off events that don't fit the recurring schedule, admins can block court time directly from the booking grid.

**Block types:**
| Type | Color | Description |
|------|-------|-------------|
| **Open Play** | Green | One-off open play session (not in the weekly schedule) |
| **Competition** | Blue | One-off competition event |
| **Private Event** | Amber | Company events, private parties (no player booking) |
| **Private Competition** | Orange | Invitation-only tournaments |
| **Maintenance** | Grey | Court resurfacing, repairs, etc. |

**UX flow:**
1. Select time slots on one or more courts in the grid
2. Choose from the floating action bar: **Open Play**, **Block Time**, or **+Book**
3. Fill in type, title, courts, time range, and notes
4. The block appears immediately in the grid with its distinct color

Court blocks override the recurring schedule — useful for cancelling a regular Open Play for a special event.

---

### 5. Membership System

Tiered membership plans with session tracking, payment management, and perks.

**Membership Tiers:**
- Admin creates tiers per venue (e.g., Basic $25/month — 5 sessions, Premium $50/month — unlimited)
- Each tier has: name, price, included sessions per cycle, cycle length (days), and perks
- Perks are configurable text items (e.g., "-10% Coffee Shop", "Priority Tournament Registration")

**Member Management:**
- Activate/suspend/cancel memberships
- Track session usage (x/5 used) with inline editing for admin adjustments
- Change tier mid-cycle with automatic payment adjustment
- Automatic cycle renewal with session count reset
- Automatic expiration of overdue memberships

**Payment Tracking:**
- Payment records auto-generated each billing cycle (UNPAID → PAID or OVERDUE)
- Admin confirms payment with: amount, method (cash/bank transfer/other), date, proof image upload, notes
- Payment history drawer per member
- Ability to revert PAID back to UNPAID
- Monthly payment summary dashboard (collected, unpaid, overdue)
- Tier upgrade/downgrade adjusts the current unpaid payment amount

---

### 6. Staff & Payroll

**Staff Management:**
- Create staff accounts with roles (staff / superadmin)
- Venue assignment
- Password management with reset capability
- Biometric login support

**Payroll:**
- Automatic hours tracking based on session open/close times
- Weekly payroll view with hours worked and amount
- Cumulative hours tracking
- Mark payments as paid with method and notes
- Export payroll data

---

### 7. Player Directory

Admin can manage all players in the system:
- Add, edit, delete player profiles
- View player stats and session history
- Filter by skill level, gender, game preference
- Search by name or phone

---

### 8. Analytics

Dashboard with venue-wide statistics:
- Total players, sessions, games played
- Trends and usage patterns

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14+ (App Router) |
| **Language** | TypeScript |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **Styling** | Tailwind CSS (dark theme) |
| **State** | Zustand (client sessions) |
| **Real-time** | Socket.io (WebSocket) |
| **Auth** | JWT + bcrypt + OTP (phone-based for players, password for staff) |
| **Push** | Web Push API (VAPID) |
| **Icons** | Lucide React |

### Key Design Decisions

- **Venue-scoped data** — all data (courts, sessions, bookings, memberships) is scoped to a venue. A player can be a member at multiple venues.
- **JSON settings** — venue configuration (pricing rules, schedule, membership contact) is stored as JSON in the `Venue.settings` field for flexibility without schema changes.
- **Three booking models** — Walk-in bookings (`Booking`), live sessions (`Session`), and time blocks (`CourtBlock`) are separate models that all feed into a unified availability API.
- **Cents-based pricing** — all prices stored in cents internally, displayed as dollars in the UI.
- **Admin-first** — the admin panel is the primary interface; player and staff apps are secondary consumers of the same API.

### Real-Time Architecture

```
Browser ←→ Socket.io ←→ Custom Express Server ←→ Next.js API
                ↓
         Push Notifications (Web Push)
```

Events flow through venue-scoped rooms (`venue:{id}`) and player-scoped rooms (`player:{id}`). Court updates, queue changes, and session events are broadcast in real-time to all connected clients.

---

## User Flows

### Admin: Typical Day

1. **Morning** — Check the day planner. Recurring Open Play sessions are already showing. Review any bookings or blocks.
2. **Handle walk-ins** — Create bookings from the grid for walk-in players. Select court + time, search player, confirm.
3. **Open Play time** — Staff opens a live session. Players join via QR. The system handles rotation. The schedule block on the calendar is unaffected.
4. **Unexpected event** — A company wants 3 courts for 2 hours this afternoon. Admin selects the slots, taps "Block Time", creates a Private Event.
5. **End of day** — Check membership payments. Confirm cash payments with proof. Review payroll.

### Player: Booking a Court

1. Open the Player App → select venue
2. Browse available time slots
3. Select court + time → confirm booking
4. Receive push notification reminder before the booking
5. Show up and play

### Player: Joining Open Play

1. Arrive at venue during scheduled Open Play
2. Scan QR code on the TV display
3. Automatically join the queue
4. Get matched into a group and assigned a court
5. Play → get requeued → repeat
6. Take breaks as needed → return to queue

---

## Roadmap / Future Modules

| Module | Status | Description |
|--------|--------|-------------|
| **Coach Booking** | Planned | Book private lessons with permanent venue coaches. Coach profiles, availability, hourly rates, booking flow. |
| **Capacity & Waitlist** | Deferred | When all courts are booked, players join a waitlist and get notified on cancellation. |
| **Online Payment** | Planned | Stripe/payment gateway integration for memberships and bookings. Currently manual (cash/transfer). |
| **Player Booking App** | In progress | Full booking flow in the player app (currently admin/staff-only). |
| **Tournament Module** | Planned | Bracket generation, seeding, scoring, and scheduling for organized tournaments. |

---

## Color System (UI Reference)

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

---

## Design System

- **Theme:** Dark mode only
- **Background:** `#0a0a0a` (neutral-950)
- **Surfaces:** `#171717` (neutral-900), `#262626` (neutral-800)
- **Typography:** System font stack, no custom fonts
- **Icons:** Lucide (outline style, 16–24px)
- **Corner radius:** 12px cards, 16px modals, full for badges/pills
- **Components:** Buttons, modals, drawers, badges, toggle pills, inline editable fields, floating action bars, grid calendars

---

*CourtFlow is built and maintained as an open-source court management platform. For questions or contributions, see the repository.*
