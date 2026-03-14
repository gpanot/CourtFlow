CourtFlow — Feature Extension v1.1
Addendum to PRD v2.2
Status: Planning
Scope: 2 feature modules (MVP) + 1 deferred module

Delivery Phases:
  Phase 1 — Membership System      ~3-5 days
  Phase 2 — Court Booking           ~5-8 days
  Phase 3 — Capacity & Waitlist     Deferred to V2


════════════════════════════════════════
MODULE 1 — MEMBERSHIP SYSTEM (MVP)
════════════════════════════════════════

Overview
Players can subscribe to a monthly membership
at a specific venue. Membership controls
session allowance and provides visual
recognition. Admin manages memberships
manually until payment automation is built.

Memberships are venue-scoped:
a player can hold different memberships
at different venues.

No queue priority changes in MVP.
The queue algorithm remains unchanged
(FIFO + skill balance + game-type mix).

Flexible Tiers (1 to 4)
Admin creates 1 to 4 membership tiers
per venue. The number and structure is
entirely up to the venue — not fixed.

Players without a membership are
treated as Drop-in (free, no limits).

Example configurations:

  Simple venue (1 tier):
    Members  $30/month — unlimited sessions

  Standard venue (3 tiers):
    Basic    $20/month — 8 sessions/month
    Premium  $40/month — unlimited sessions
    VIP      $60/month — unlimited + badge

  Large venue (4 tiers):
    Bronze   $15/month — 4 sessions/month
    Silver   $25/month — 8 sessions/month
    Gold     $40/month — unlimited sessions
    Platinum $60/month — unlimited + badge

Each tier has:
  — Name (admin-customisable)
  — Price per month (in cents)
  — Sessions included (number or unlimited)
  — Whether it shows a badge in app

Renewal Logic
  — Cycle starts from admin activation date
  — 30-day rolling cycle (not calendar month)
  — Session counter resets at cycle start
  — Example: activated Jan 15 → resets Feb 14
  — Admin can see next renewal date per member
  — If membership expires (not renewed),
    player reverts to Drop-in automatically


1.1 Admin Features
— Create 1 to 4 membership tiers
   (name, price, session limit, badge)
   per venue, in venue settings
— Manually activate a membership
   (Stripe link sent to player,
    admin flips status on payment)
— View all active members per tier
— Suspend or cancel a membership
— See renewal dates
— See member usage this month
   (sessions used / sessions allowed)

1.2 Player Features
— View membership options
  from profile screen
— See current tier + badge
— See sessions used this month
  (simple counter e.g. "8 / 12 sessions used")
— Tap "Upgrade" →
  "Contact us to subscribe"
  [WhatsApp]  [Email]

1.3 System Behaviour
— Session counter increments each time
  player joins open play at that venue
— Counter resets on renewal date
— If session limit reached:
  Player sees: "You've used your
  monthly sessions.
  Upgrade for unlimited play."
  Player can still join as Drop-in
  (no hard block in MVP)

1.4 Display
Player app:
— Tier badge on profile screen
— Sessions remaining on home screen
  (members only)

Staff dashboard:
— Tier badge next to player name
  in queue and court cards

1.5 Notifications
— Membership activated confirmation
— 7 days before renewal reminder
— Membership expired notification
— Session limit reached → upgrade prompt

1.6 Deferred to V2
❌ Automated payment / renewal via Stripe
❌ Queue priority bonus by tier
❌ Court booking advance window by tier
❌ Guest pass tracking / redemption
❌ Revenue reporting dashboard
❌ Upgrade/downgrade self-serve flow
❌ TV display: membership badges next to names

1.7 New Screens — Membership

M1. Membership Plans Screen
    Tier cards (1-4), price, key benefits
    Current tier highlighted
    "Upgrade" CTA → contact flow

M2. My Membership (in profile)
    Current tier + badge
    Sessions used / allowed this month
    Renewal date
    "Change Plan" option

M3. Admin — Membership Management
    List of all members by tier
    Activate / suspend / cancel actions
    Usage per member
    Filter by venue


════════════════════════════════════════
MODULE 2 — COURT BOOKING (MVP)
════════════════════════════════════════

Overview
Players can reserve a specific court for a
fixed time slot. Booked courts are fully
removed from open play rotation.
Booking is available to all players
including Drop-in (pay per booking).

2.1 Core Logic
Each court has two modes:

OPEN PLAY  →  managed by queue algorithm
BOOKED     →  reserved, invisible to queue

A booked court:
— Does not appear in open play rotation
— Returns to open play automatically
  when booking ends (if session active)
— Staff gets alert 15 min before
  a booking starts on an active court

Booking-to-open-play transition:
  When a booking ends:
  1. Court status set to "idle"
  2. If an open play session is active,
     court.activeInSession set to true
  3. Queue algorithm picks it up on
     next rotation cycle
  4. Socket event emitted so UI updates

2.2 Availability Model
Admin configures per venue:
— Bookable courts
  (toggle per court — some can be
   open play only, via isBookable flag)
— Slot duration: 60 min
  (single option for MVP,
   30/45/60 configurable in V2)
— Available booking hours
  (start hour, end hour per day)
— Price per slot (flat rate, see 2.5)
— Cancellation policy

2.3 Player Booking Flow
Home screen → "Book a Court"
→ Calendar view — select date
→ Slot grid — available courts × times
→ Select slot:
   Court A · 14:00–15:00 · $X
→ Optional: add up to 3 co-players
   (share court code or invite by name)
→ Confirm booking
→ Payment via Stripe link (manual MVP)
→ Confirmation screen:
   "Court A booked ✓"
   Date · Time · Duration
   [Add to Calendar]  [Share]
→ Push reminder 30 min before

Conflict Prevention:
  When player confirms a slot, the server
  checks availability with a DB unique
  constraint on (courtId, date, startTime).
  If two players race for the same slot,
  only the first INSERT succeeds; the second
  gets "Slot no longer available — pick another."

2.4 Booking Management (Player)
Profile → "My Bookings"
— Upcoming bookings
— Past bookings
— Cancel booking
  (per venue cancellation policy)
— Share court code with co-players

2.5 Pricing Model (MVP)
MVP uses flat rate only:
  $X per slot, same for everyone
  Admin sets price in venue settings

Deferred pricing models (V2):
  — Member discount by tier
  — Peak / off-peak pricing
  — Dynamic pricing engine

2.6 Cancellation Policy (MVP)
MVP default policy:
  Free cancellation up to 24h before
  No refund after 24h window

Policy shown clearly:
— On booking confirmation screen
— On cancellation screen
— In booking reminder push notification

Additional policy options deferred to V2:
  — Free cancellation up to 2h before
  — Credit only (no cash refund)
  — No cancellation allowed
  — Admin-configurable per venue

2.7 Staff / Admin View
Court Overview gets timeline layer:

Court A  [░░████░░░░████░░░░░░]
          8am  10am 12pm  2pm

Purple = booked
White  = available
Grey   = open play session

Staff actions:
— Add manual booking for a player
— Cancel any booking
— Block a court for maintenance
— Mark booking as no-show
— See who booked each slot

Alert 15 min before booking starts
on active open play court:
"Court A has a booking at 14:00 —
 current game needs to wrap up"

2.8 Deferred to V2
❌ Recurring bookings
❌ Waiting list for fully booked slots
❌ In-app payment processing (Stripe integration)
❌ Multi-court booking in one transaction
❌ Dynamic pricing engine
❌ Booking analytics / revenue reports
❌ Member discount pricing
❌ Peak / off-peak pricing
❌ Configurable cancellation policies
❌ 30 / 45 min slot durations
❌ TV display: reserved court card state

2.9 New Screens — Court Booking

B1. Book a Court —
    Calendar + slot grid
B2. Slot Detail + Confirmation
    Court, time, price, co-players
B3. Booking Confirmed
    Summary + add to calendar + share
B4. My Bookings
    Upcoming + history + cancel option

Admin:
B5. Court Timeline View
    Booking slots overlay on
    court overview
B6. Booking Configuration
    Slot duration, pricing,
    cancellation policy,
    which courts are bookable


════════════════════════════════════════
MODULE 3 — OPEN PLAY CAPACITY & WAITLIST
Status: DEFERRED TO V2
════════════════════════════════════════

This module is the most complex of the three
and touches the core queue system. Deferring
to V2 to keep MVP scope manageable.

MVP Lite — Capacity Display Only
Instead of the full waitlist system, MVP adds
a simple capacity indicator to sessions:

— New field on Session: maxPlayers (optional)
— Admin sets maxPlayers when opening a session
  (auto-suggested: active courts × 8)
— Player home screen shows:
  "24 / 30 players" if maxPlayers is set
— When maxPlayers reached, "Join Queue"
  button shows "Session Full"
  (staff can override and still add players)
— No waitlist, no check-in, no cascading

This gets 80% of the value (players know
if they should bother showing up) with
minimal implementation effort.

Full V2 Scope (preserved for later):
— Session states: UPCOMING / OPEN / FULL / CLOSED
— Pre-registration for upcoming sessions
— Check-in flow with auto-release
— Waitlist with cascading promotion
  (10-min confirm window)
— Capacity linked to court add/remove
— Staff waitlist management panel
— All screens: W1–W5


════════════════════════════════════════
DATABASE SCHEMA — NEW MODELS
════════════════════════════════════════

enum MembershipStatus {
  active
  suspended
  expired
  cancelled
}

enum BookingStatus {
  confirmed
  cancelled
  completed
  no_show
}

model MembershipTier
  id            String   @id
  venueId       String   → Venue
  sortOrder     Int      (display order, 1-based)
  name          String   (admin-customisable)
  priceInCents  Int      (monthly price)
  sessionsIncluded Int?  (null = unlimited)
  showBadge     Boolean  @default(false)
  isActive      Boolean  @default(true)

  @@unique([venueId, sortOrder])
  Max 4 tiers per venue (enforced in app logic)

model Membership
  id            String   @id
  playerId      String   → Player
  venueId       String   → Venue
  tierId        String   → MembershipTier
  status        MembershipStatus
  activatedAt   DateTime
  renewalDate   DateTime
  sessionsUsed  Int      @default(0)

  @@unique([playerId, venueId])

model Booking
  id            String   @id
  courtId       String   → Court
  venueId       String   → Venue
  playerId      String   → Player
  date          DateTime (date only)
  startTime     DateTime
  endTime       DateTime
  status        BookingStatus
  priceInCents  Int
  coPlayerIds   String[]
  createdAt     DateTime
  cancelledAt   DateTime?

  @@unique([courtId, date, startTime])

Updates to existing models:

Court — add:
  isBookable    Boolean  @default(false)

Session — add:
  maxPlayers    Int?     (MVP Lite capacity)

Venue.settings JSON — add:
  bookingConfig: {
    slotDurationMinutes: 60
    bookingStartHour: 8
    bookingEndHour: 22
    pricePerSlotCents: 0
    cancellationHours: 24
  }
  membershipConfig: {
    contactWhatsApp: string | null
    contactEmail: string | null
  }


════════════════════════════════════════
API ENDPOINTS — NEW ROUTES
════════════════════════════════════════

Module 1 — Membership

Player:
  GET  /api/membership/tiers?venueId=X
       → list tiers for venue
  GET  /api/membership/mine?venueId=X
       → current player's membership
  
Admin:
  GET  /api/admin/memberships?venueId=X
       → all memberships for venue
  POST /api/admin/memberships/activate
       → { playerId, venueId, tierId }
  PATCH /api/admin/memberships/[id]
       → { status: suspended | cancelled }
  GET  /api/admin/membership-tiers?venueId=X
       → list tiers for venue
  POST /api/admin/membership-tiers
       → create tier { venueId, name, priceInCents, ... }
  PATCH /api/admin/membership-tiers/[id]
       → update tier name, price, etc.
  DELETE /api/admin/membership-tiers/[id]
       → deactivate tier (soft delete)
       → fails if tier has active members

Module 2 — Court Booking

Player:
  GET  /api/bookings/availability
       → { venueId, date } → available slots
  POST /api/bookings
       → { courtId, date, startTime, venueId }
  GET  /api/bookings/mine
       → player's bookings (upcoming + past)
  DELETE /api/bookings/[id]
       → cancel booking (checks policy)

Staff:
  GET  /api/staff/bookings?venueId=X&date=Y
       → all bookings for venue on date
  POST /api/staff/bookings
       → manual booking for a player
  PATCH /api/staff/bookings/[id]
       → cancel / mark no-show

Admin:
  PUT  /api/admin/venues/[id]/booking-config
       → update booking settings


════════════════════════════════════════
SOCKET.IO EVENTS — NEW
════════════════════════════════════════

Module 1:
  membership:updated
    → emitted to player when tier changes
    → emitted to venue for staff dashboard

Module 2:
  booking:created
    → emitted to venue (staff sees new booking)
  booking:cancelled
    → emitted to venue
  booking:starting_soon
    → emitted to venue 15 min before
      (staff alert to clear court)
  court:booking_ended
    → emitted to venue (court returns to pool)


════════════════════════════════════════
ALGORITHM IMPACT
════════════════════════════════════════

File: src/lib/algorithm.ts

No changes to queue algorithm in MVP.
selectBestFour() and runRotation() remain
as-is. Membership does not affect queue
priority or player selection logic.

Booked courts (Module 2):
  Courts with active bookings must be
  excluded from court availability checks
  in runRotation(). Filter by:
    court.status !== "idle" || hasActiveBooking
  This ensures the queue algorithm never
  assigns players to a reserved court.


════════════════════════════════════════
MIGRATION STRATEGY
════════════════════════════════════════

Existing data:
— All existing players are treated as
  Drop-in — no Membership record needed,
  absence of record = Drop-in
— No tiers exist by default — admin
  creates tiers per venue when ready
— All existing courts default to
  isBookable: false (opt-in per court)
— All existing sessions get
  maxPlayers: null (no cap)
— Venue.settings keeps existing fields,
  new bookingConfig/membershipConfig
  added with defaults

Rollout:
— Module 1 can be deployed independently
— Module 2 depends on the Court.isBookable
  field but NOT on Module 1
— No algorithm changes — queue behaviour
  is identical with or without memberships


════════════════════════════════════════
SUMMARY
════════════════════════════════════════

New Screens — MVP

MODULE 1 — MEMBERSHIP (3 screens)
  M1. Membership Plans
  M2. My Membership
  M3. Admin Membership Management

MODULE 2 — COURT BOOKING (6 screens)
  B1. Book a Court (calendar + grid)
  B2. Slot Detail + Confirmation
  B3. Booking Confirmed
  B4. My Bookings
  B5. Admin Court Timeline View
  B6. Admin Booking Configuration

MODULE 3 — CAPACITY LITE (0 new screens)
  maxPlayers field + UI indicator
  on existing home screen and
  staff session panel

TOTAL NEW SCREENS: 9
EXISTING SCREENS (PRD v2.2): 22
GRAND TOTAL: 31 screens

Updated Home Screen — Final State

Welcome back, [Name] 👋
[Venue] · [Membership badge]

─────────────────────────────
🎾 Join Open Play
Tonight 18:00 · 4 courts
👥 24 / 30 players
[Join Now]
─────────────────────────────
📅 Book a Court
Next available: today 14:00
[Book Now]
─────────────────────────────

If session full (capacity reached):
🎾 Join Open Play
👥 30 / 30 · Session Full
[Contact Venue]
─────────────────────────────

If no session today:
🎾 Join Open Play
No session today
Next: Tomorrow 18:00
─────────────────────────────
