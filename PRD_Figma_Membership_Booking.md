CourtFlow — UI/UX Design Brief
Membership & Court Booking
Version 1.0 · For Figma Design

════════════════════════════════════════
DESIGN SYSTEM REFERENCE
════════════════════════════════════════

Theme: Dark mode only
Background: #0a0a0a (neutral-950)
Surfaces: #171717 (neutral-900), #262626 (neutral-800)
Borders: #404040 (neutral-700), #262626 (neutral-800)
Text primary: #ffffff
Text secondary: #a3a3a3 (neutral-400)
Text muted: #737373 (neutral-500)

Brand / Primary: #22c55e (green-500), #16a34a (green-600)
Admin accent: #a855f7 (purple-500), #9333ea (purple-600)
Staff accent: #3b82f6 (blue-500), #2563eb (blue-600)

Status Colors (existing):
  Green  #16a34a — active / success
  Blue   #2563eb — starting / info
  Amber  #f59e0b — warmup / warning
  Red    #b91c1c — maintenance / error
  Grey   #404040 — idle / neutral
  NEW → Purple #7c3aed — reserved / booked

Typography: System font stack (no custom font)
  Display: 72px bold
  H1: 30px bold
  H2: 24px bold
  H3: 20px semibold
  Body: 16px regular
  Small: 14px regular
  Caption: 12px medium
  Micro: 10-11px

Icons: Lucide (outline style, 16-24px)
Corner radius: 12px cards, 16px modals, full for badges/pills
Spacing: 4px grid

Platforms:
  Player app — mobile-first, max-width 512px, PWA
  Staff dashboard — tablet/desktop, full-width, tab-based
  Admin panel — desktop sidebar + mobile bottom nav
  (TV display is out of scope for this phase)


════════════════════════════════════════
EXISTING NAVIGATION CONTEXT
════════════════════════════════════════

Player app (no persistent nav):
  Home → Join Queue → Queue Screen →
  Court Assigned → In Game → Break →
  Profile (top-left avatar button)

Staff dashboard:
  Header: [Profile] [Staff Dashboard] [Open/Close Session]
  Tabs: Courts | Queue | QR Code

Admin panel:
  Sidebar (desktop): Overview | Live Sessions |
    Venues | Staff | Players | Analytics
  Bottom tabs (mobile): same 6 items


════════════════════════════════════════
WHAT WE'RE ADDING
════════════════════════════════════════

9 new screens across 2 modules:

Module 1 — Membership (3 screens)
  M1. Membership Plans
  M2. My Membership (profile section)
  M3. Admin — Membership Management

Module 2 — Court Booking (6 screens)
  B1. Book a Court (calendar + slot grid)
  B2. Slot Detail + Confirmation
  B3. Booking Confirmed
  B4. My Bookings
  B5. Admin — Court Timeline View
  B6. Admin — Booking Configuration

Plus updates to:
  — Player home screen
  — Player profile screen
  — Staff court cards
  — Staff dashboard header
  — Admin sidebar/nav


════════════════════════════════════════════════════
PLAYER FLOWS
════════════════════════════════════════════════════


FLOW 1 — PLAYER VIEWS MEMBERSHIP
────────────────────────────────

Entry points:
  A) Home screen → membership badge tap
  B) Profile screen → "My Membership" row
  C) Home screen → "Upgrade" prompt
     (shown when session limit reached)

────────────────────────────────
SCREEN M1 — Membership Plans
────────────────────────────────

Context: Player app, mobile, max-w-lg
Entry: Profile → "View Plans" or home badge tap

Layout:
  ┌─────────────────────────────────┐
  │ ← Back          Membership      │
  │                                 │
  │ [Venue Name]                    │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ ⭐ Current Plan             │ │
  │ │                             │ │
  │ │ GOLD                        │ │
  │ │ $40 / month                 │ │
  │ │                             │ │
  │ │ ✓ Unlimited sessions        │ │
  │ │ ✓ Badge in app               │ │
  │ │                             │ │
  │ │ ── Your plan ──             │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ SILVER            $25/mo    │ │
  │ │ ✓ 8 sessions / month       │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ PLATINUM          $60/mo    │ │
  │ │ ✓ Unlimited + badge         │ │
  │ │ [ Upgrade ]                 │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ Not a member?                   │
  │ You can play as Drop-in         │
  │ (free, no limits)               │
  └─────────────────────────────────┘

Component notes:
  — 1 to 4 tier cards (dynamic count)
  — Current plan card: highlighted border
    (green-500 border, green-600/10 bg)
  — Other cards: neutral-800 border,
    neutral-900 bg
  — Higher tiers show [Upgrade] button
  — Lower tiers show "Downgrade — contact us"
  — Non-member sees all cards without
    "current" highlight
  — Drop-in note at bottom for context

States:
  — Has membership → current tier highlighted
  — No membership → all cards neutral,
    CTA on each: "Subscribe"
  — Venue has 1 tier → single card only
  — Venue has 4 tiers → scrollable list

"Upgrade" / "Subscribe" tap → bottom sheet:
  ┌─────────────────────────────────┐
  │ Contact us to subscribe         │
  │                                 │
  │ ┌───────────┐ ┌───────────────┐ │
  │ │ WhatsApp  │ │ Email         │ │
  │ └───────────┘ └───────────────┘ │
  │                                 │
  │ [ Cancel ]                      │
  └─────────────────────────────────┘

────────────────────────────────
SCREEN M2 — My Membership
────────────────────────────────

Context: Section within player profile screen
(not a standalone screen — embedded in existing profile)

Layout (within profile):
  ┌─────────────────────────────────┐
  │ MY MEMBERSHIP                   │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ ⭐ GOLD           Active    │ │
  │ │                             │ │
  │ │ Sessions    ████████░░      │ │
  │ │             8 / 12 used     │ │
  │ │                             │ │
  │ │ Renews      March 28, 2026  │ │
  │ │                             │ │
  │ │ [ View Plans ]              │ │
  │ └─────────────────────────────┘ │
  └─────────────────────────────────┘

For unlimited tiers:
  │ Sessions    Unlimited ∞       │

For non-members:
  ┌─────────────────────────────────┐
  │ MY MEMBERSHIP                   │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ Drop-in              Free   │ │
  │ │                             │ │
  │ │ No active membership        │ │
  │ │                             │ │
  │ │ [ View Plans ]              │ │
  │ └─────────────────────────────┘ │
  └─────────────────────────────────┘

States:
  — Active membership with session limit
  — Active membership with unlimited
  — Expired membership (amber warning,
    "Expired — contact venue to renew")
  — Suspended membership (red,
    "Suspended — contact venue")
  — No membership (Drop-in)

Session limit reached state:
  │ Sessions    ████████████      │
  │             12 / 12 used      │
  │                               │
  │ ⚠ Monthly limit reached       │
  │ You can still play as Drop-in │
  │                               │
  │ [ Upgrade ]                   │


FLOW 2 — PLAYER BOOKS A COURT
──────────────────────────────

Entry point:
  Home screen → "Book a Court" card

Full flow:
  Home → B1 (calendar + grid) →
  B2 (slot detail) → B3 (confirmed)

────────────────────────────────
SCREEN B1 — Book a Court
────────────────────────────────

Context: Player app, mobile, max-w-lg

Layout:
  ┌─────────────────────────────────┐
  │ ← Back        Book a Court      │
  │                                 │
  │ [Venue Name]                    │
  │                                 │
  │ ◀  March 2026  ▶               │
  │ M  T  W  T  F  S  S            │
  │          1  2  3  4  5          │
  │ 6  7  8  9 10 11 12            │
  │ 13 14 15 16 17 18 19           │
  │ 20 21 22 23 24 25 26           │
  │ 27 28 29 30 31                  │
  │                                 │
  │ Thursday, March 13              │
  │                                 │
  │ ── Available Slots ──           │
  │                                 │
  │        Court A  Court B  Court D│
  │ 10:00  [ $25 ]  [ $25 ]   ──   │
  │ 11:00  [ $25 ]    ──    [ $25 ] │
  │ 12:00    ──     [ $25 ]  [ $25 ]│
  │ 13:00  [ $25 ]  [ $25 ]  [ $25 ]│
  │ 14:00  [ $25 ]    ──      ──   │
  │ 15:00  [ $25 ]  [ $25 ]  [ $25 ]│
  │                                 │
  └─────────────────────────────────┘

Component notes:
  — Calendar: compact month view,
    today highlighted (green dot),
    selected date (green fill),
    past dates dimmed
  — Only bookable courts shown in grid
    (courts with isBookable = true)
  — Slot grid: courts as columns,
    hours as rows
  — Available slot: neutral-800 bg,
    shows price, tappable
  — Booked/unavailable: dash (──),
    neutral-700 text, not tappable
  — Slots outside booking hours not shown
  — Horizontal scroll if >3 courts

States:
  — Date with availability → grid shown
  — Date with no availability →
    "No courts available on this day"
  — Loading → skeleton grid
  — No bookable courts at venue →
    "This venue doesn't offer
     court bookings yet"

────────────────────────────────
SCREEN B2 — Slot Detail + Confirm
────────────────────────────────

Context: Bottom sheet over B1

Layout:
  ┌─────────────────────────────────┐
  │ ── Confirm Booking ──           │
  │                                 │
  │ 🟣 Court A                      │
  │                                 │
  │ Date       Thu, March 13        │
  │ Time       14:00 — 15:00       │
  │ Duration   60 minutes           │
  │ Price      $25.00               │
  │                                 │
  │ ── Add Co-Players (optional) ── │
  │                                 │
  │ [ + Add player ]                │
  │                                 │
  │ Up to 3 players can share       │
  │ this court with you             │
  │                                 │
  │ ── Cancellation Policy ──       │
  │ Free cancellation up to         │
  │ 24 hours before start.          │
  │                                 │
  │ [ Confirm Booking — $25 ]       │
  │                                 │
  │ [ Cancel ]                      │
  └─────────────────────────────────┘

"Add player" tap → inline search:
  │ [ 🔍 Search player name...   ] │
  │                                 │
  │ Alex M.               [ Add ]  │
  │ Maria S.              [ Add ]  │

After adding:
  │ ── Co-Players ──                │
  │ Alex M.           [ Remove ]    │
  │ Maria S.          [ Remove ]    │
  │ [ + Add another ]               │

Confirm tap → loading state:
  │ [ ◌ Booking...              ]  │

If slot taken (race condition):
  → Toast: "Slot no longer available"
  → Return to B1, grid refreshed

────────────────────────────────
SCREEN B3 — Booking Confirmed
────────────────────────────────

Context: Full screen, replaces B1+B2

Layout:
  ┌─────────────────────────────────┐
  │                                 │
  │            ✓                    │
  │      Court A Booked             │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ Date      Thu, March 13     │ │
  │ │ Time      14:00 — 15:00    │ │
  │ │ Duration  60 minutes        │ │
  │ │ Court     Court A           │ │
  │ │ Price     $25.00            │ │
  │ │                             │ │
  │ │ Co-players:                 │ │
  │ │ Alex M., Maria S.          │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ Payment will be arranged        │
  │ by the venue separately.        │
  │                                 │
  │ ┌─────────────┐ ┌────────────┐ │
  │ │ 📅 Add to   │ │ 📤 Share   │ │
  │ │  Calendar   │ │  Booking   │ │
  │ └─────────────┘ └────────────┘ │
  │                                 │
  │ [ View My Bookings ]            │
  │                                 │
  │ [ Back to Home ]                │
  └─────────────────────────────────┘

Success animation:
  — Green checkmark scales in
  — Card fades up

────────────────────────────────
SCREEN B4 — My Bookings
────────────────────────────────

Context: Player app, accessible from
  Profile → "My Bookings" or
  B3 → "View My Bookings"

Layout:
  ┌─────────────────────────────────┐
  │ ← Back         My Bookings      │
  │                                 │
  │ ── Upcoming ──                  │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ 🟣 Court A                  │ │
  │ │ Thu, March 13 · 14:00–15:00│ │
  │ │ [Venue Name]                │ │
  │ │                             │ │
  │ │ With: Alex M., Maria S.    │ │
  │ │                             │ │
  │ │ [ Cancel Booking ]          │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ 🟣 Court B                  │ │
  │ │ Sat, March 15 · 10:00–11:00│ │
  │ │ [Venue Name]                │ │
  │ │                             │ │
  │ │ [ Cancel Booking ]          │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ── Past ──                      │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ Court A                     │ │
  │ │ Mon, March 10 · 16:00–17:00│ │
  │ │ Completed                   │ │
  │ └─────────────────────────────┘ │
  │                                 │
  └─────────────────────────────────┘

Cancel booking tap → confirm sheet:
  ┌─────────────────────────────────┐
  │ ⚠ Cancel Booking?               │
  │                                 │
  │ Court A · Thu, March 13         │
  │ 14:00 — 15:00                   │
  │                                 │
  │ Free cancellation applies       │
  │ (more than 24h before start)    │
  │                                 │
  │ [ Cancel Booking ]  (red)       │
  │ [ Keep Booking ]                │
  └─────────────────────────────────┘

Within 24h:
  │ ⚠ This booking cannot be        │
  │ cancelled (less than 24h away)  │

States:
  — Has upcoming bookings
  — No upcoming bookings →
    "No upcoming bookings"
    [ Book a Court ]
  — Past bookings: dimmed, no actions
  — Cancelled booking: strikethrough,
    "Cancelled" badge in red


════════════════════════════════════════════════════
STAFF FLOWS
════════════════════════════════════════════════════


FLOW 3 — STAFF VIEWS BOOKINGS
──────────────────────────────

Context: Staff dashboard, new tab or
overlay on existing Courts tab

────────────────────────────────
Courts Tab — Updated
────────────────────────────────

Existing court cards get a new state:

Booked court card:
  ┌─────────────────────────────────┐
  │ 🟣 Court A        Reserved      │
  │                                 │
  │ Booked by: Alex M.             │
  │ 14:00 — 15:00                   │
  │ Ends in 34 min                  │
  │                                 │
  │ Co-players: Maria S., David K. │
  └─────────────────────────────────┘

  — Purple border (#7c3aed),
    purple/10 bg
  — No game actions (start, replace, etc.)
  — Countdown to booking end

Upcoming booking alert (15 min before):
  ┌─────────────────────────────────┐
  │ ⚠ Court A has a booking at      │
  │ 14:00 — current game needs      │
  │ to wrap up                      │
  │                                 │
  │ [ Dismiss ]  [ End Game Now ]   │
  └─────────────────────────────────┘

  — Amber banner, appears at top
    of Courts tab
  — Auto-dismisses when booking starts

Staff booking actions (tap booked court):
  — View booking details
  — Cancel booking
  — Mark as no-show
  — Add manual booking
    (for walk-in requests)

Membership badges on queue/court cards:
  — Badge-enabled tier: ⭐ + tier name
    (small pill, e.g. ⭐ Gold)
  — Other paid tier: coloured dot
    + tier name
  — Drop-in: no indicator


════════════════════════════════════════════════════
ADMIN FLOWS
════════════════════════════════════════════════════


FLOW 4 — ADMIN MANAGES MEMBERSHIPS
────────────────────────────────────

Entry: Admin sidebar → new nav item
"Memberships" (between Players and Analytics)

Admin nav update:
  Overview
  Live Sessions
  Venues
  Staff
  Players
  Memberships  ← NEW
  Bookings     ← NEW
  Analytics

────────────────────────────────
SCREEN M3 — Admin Membership Management
────────────────────────────────

Context: Admin panel, desktop + mobile

Layout (desktop):
  ┌─────────────────────────────────────────────┐
  │ Memberships              [Venue: ▾ All]     │
  │                                             │
  │ ── Tiers ──                [ + Create Tier ]│
  │                                             │
  │ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
  │ │ SILVER   │ │ GOLD     │ │ PLATINUM │     │
  │ │ $25/mo   │ │ $40/mo   │ │ $60/mo   │     │
  │ │ 8 sess.  │ │ Unlim.   │ │ Unlim.   │     │
  │ │ 12 memb. │ │ 8 memb.  │ │ 3 memb.  │     │
  │ │ [Edit]   │ │ [Edit]   │ │ [Edit]   │     │
  │ └──────────┘ └──────────┘ └──────────┘     │
  │                                             │
  │ ── Members ──              🔍 Search        │
  │                                             │
  │ Name        Tier     Sessions  Renewal  Act.│
  │ ─────────────────────────────────────────── │
  │ Alex M.     ⭐Gold   8/unlim  Mar 28   [⋮] │
  │ Maria S.    Silver   5/8      Apr 2    [⋮] │
  │ David K.    Platinum 12/unlim Apr 10   [⋮] │
  │ Jordan L.   Silver   8/8 ⚠   Mar 20   [⋮] │
  │ Sam T.      Gold     0/unlim  Mar 15   [⋮] │
  └─────────────────────────────────────────────┘

Tier cards:
  — Horizontal row, 1-4 cards
  — Each shows: name, price, session limit,
    active member count, [Edit] button
  — [+ Create Tier] button (disabled if
    venue already has 4 tiers)
  — Badge-enabled tiers show ⭐

Members table:
  — Sortable by name, tier, renewal
  — ⚠ icon when sessions limit reached
  — [⋮] menu: View | Suspend | Cancel
  — On mobile: card list instead of table

[+ Create Tier] / [Edit] → modal:
  ┌─────────────────────────────────┐
  │ Create Membership Tier          │
  │                                 │
  │ Tier Name                       │
  │ [ Gold                       ]  │
  │                                 │
  │ Monthly Price ($)               │
  │ [ 40.00                      ]  │
  │                                 │
  │ Sessions per Month              │
  │ ( ) Limited  [ 12          ]    │
  │ (●) Unlimited                   │
  │                                 │
  │ [ ] Show badge in app            │
  │                                 │
  │ [ Save ]            [ Cancel ]  │
  └─────────────────────────────────┘

Activate membership (for a player):
  Admin taps [+ Activate] button or
  selects player from Players list →
  ┌─────────────────────────────────┐
  │ Activate Membership             │
  │                                 │
  │ Player                          │
  │ [ 🔍 Search player...        ]  │
  │                                 │
  │ Alex M. · +1 555-1234          │
  │                                 │
  │ Tier                            │
  │ [ ▾ Gold — $40/mo            ]  │
  │                                 │
  │ This will start a 30-day cycle. │
  │ Send payment link separately.   │
  │                                 │
  │ [ Activate ]        [ Cancel ]  │
  └─────────────────────────────────┘

Suspend / Cancel → confirm dialog:
  ┌─────────────────────────────────┐
  │ ⚠ Suspend Membership?           │
  │                                 │
  │ Alex M. — Gold ($40/mo)        │
  │ Sessions used: 8 / unlimited    │
  │                                 │
  │ Player will revert to Drop-in.  │
  │                                 │
  │ [ Suspend ]  (amber)            │
  │ [ Keep Active ]                 │
  └─────────────────────────────────┘


FLOW 5 — ADMIN MANAGES BOOKINGS
────────────────────────────────

Entry: Admin sidebar → "Bookings"

────────────────────────────────
SCREEN B5 — Court Timeline View
────────────────────────────────

Context: Admin panel, desktop + mobile

Layout (desktop):
  ┌──────────────────────────────────────────────┐
  │ Bookings        [Venue: ▾] [Date: March 13]  │
  │                                              │
  │ ── Court Timeline ──                         │
  │                                              │
  │           8   9  10  11  12  13  14  15  16  │
  │ Court A  [░░░░░█████░░░░░░░█████░░░░░░]     │
  │ Court B  [░░█████░░░░░░░░░░░░░░░█████░]     │
  │ Court D  [░░░░░░░░░░█████░░░░░░░░░░░░]     │
  │                                              │
  │ █ Booked   ░ Available   ▓ Open Play         │
  │                                              │
  │ ── Today's Bookings ──     [ + Add Booking ] │
  │                                              │
  │ 10:00  Court A  Alex M.    Confirmed   [⋮]  │
  │ 10:00  Court B  Maria S.   Confirmed   [⋮]  │
  │ 14:00  Court A  David K.   Confirmed   [⋮]  │
  │ 15:00  Court B  Jordan L.  No-show     [⋮]  │
  │ 11:00  Court D  Sam T.     Cancelled   [⋮]  │
  └──────────────────────────────────────────────┘

Timeline component:
  — Horizontal bar per bookable court
  — Time axis: venue booking hours
  — Purple blocks = booked slots
  — Grey blocks = open play session overlap
  — Tap a block to see booking details
  — On mobile: timeline scrolls horizontally

Booking list below timeline:
  — Sorted by time
  — Status badges:
    Confirmed: green-600/20 text-green-400
    Cancelled: neutral-700 text-neutral-400
    Completed: neutral-700 text-neutral-400
    No-show:   red-600/20 text-red-400
  — [⋮] menu: View | Cancel | Mark No-show

[+ Add Booking] → modal (same as B2 but
admin selects the player):
  — Player search field
  — Court picker
  — Date + time picker
  — No payment step (admin override)

────────────────────────────────
SCREEN B6 — Booking Configuration
────────────────────────────────

Context: Admin panel, within venue settings
(new section/tab on existing venue detail)

Layout:
  ┌─────────────────────────────────┐
  │ Booking Settings                │
  │ [Venue Name]                    │
  │                                 │
  │ ── Bookable Courts ──           │
  │                                 │
  │ [ ] Court A                     │
  │ [✓] Court B                     │
  │ [✓] Court C                     │
  │ [ ] Court D                     │
  │ [✓] Court E                     │
  │ [ ] Court F                     │
  │                                 │
  │ ── Slot Settings ──             │
  │                                 │
  │ Slot Duration                   │
  │ [ 60 minutes              ▾ ]  │
  │                                 │
  │ Booking Hours                   │
  │ From [ 08:00 ▾ ] To [ 22:00 ▾] │
  │                                 │
  │ ── Pricing ──                   │
  │                                 │
  │ Price per Slot ($)              │
  │ [ 25.00                      ]  │
  │                                 │
  │ ── Cancellation ──              │
  │                                 │
  │ Free cancellation window        │
  │ [ 24 hours before         ▾ ]  │
  │                                 │
  │ [ Save Changes ]                │
  └─────────────────────────────────┘


════════════════════════════════════════════════════
UPDATED HOME SCREEN
════════════════════════════════════════════════════

The player home screen gains two new elements:
a membership badge and a "Book a Court" card.

Layout:
  ┌─────────────────────────────────┐
  │ 🏓  CourtFlow           [👤]   │
  │                                 │
  │ Welcome back, Alex 👋           │
  │ Downtown Pickleball · ⭐ Gold   │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ 🎾 Join Open Play           │ │
  │ │                             │ │
  │ │ Tonight 18:00 · 4 courts   │ │
  │ │ 👥 24 / 30 players          │ │
  │ │                             │ │
  │ │ [ Join Now ]                │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ 📅 Book a Court             │ │
  │ │                             │ │
  │ │ Next available: today 14:00 │ │
  │ │                             │ │
  │ │ [ Book Now ]                │ │
  │ └─────────────────────────────┘ │
  │                                 │
  │ ┌─────────────────────────────┐ │
  │ │ Sessions used: 8 / 12      │ │
  │ │ ████████████░░░░            │ │
  │ └─────────────────────────────┘ │
  └─────────────────────────────────┘

Membership badge:
  — Appears next to venue name
  — ⭐ Gold (or dot + tier name)
  — Tappable → goes to M1

Session counter bar:
  — Only shown for members with
    a session limit
  — Progress bar: green fill,
    neutral-700 track
  — Turns amber at 80%,
    red at 100% (limit reached)
  — Not shown for unlimited tiers
  — Not shown for Drop-in

"Book a Court" card:
  — Only shown if venue has bookable courts
  — Shows next available slot time
  — If no availability today:
    "Next: Tomorrow 10:00"
  — If no bookable courts configured:
    card not shown

Home screen states:
  — Active session + bookable courts →
    both cards shown
  — No active session →
    "No session today / Next: Tomorrow 18:00"
  — Session full (maxPlayers reached) →
    "Session Full" (disabled join button)
  — Session limit reached →
    amber bar + "Upgrade" link


════════════════════════════════════════════════════
UPDATED PROFILE SCREEN
════════════════════════════════════════════════════

New sections added to existing profile:

  ┌─────────────────────────────────┐
  │ [Avatar]  Alex M.               │
  │ +1 555-1234                     │
  │ Intermediate · Mixed            │
  │                                 │
  │ ── My Membership ──             │
  │ ⭐ Gold · $40/mo     [View →]   │
  │ 8 / unlimited sessions          │
  │ Renews Mar 28                   │
  │                                 │
  │ ── My Bookings ──               │
  │ 2 upcoming           [View →]   │
  │ Next: Thu 14:00 · Court A       │
  │                                 │
  │ ── Settings ──                  │
  │ Notifications        [Toggle]   │
  │ ...                             │
  └─────────────────────────────────┘

"My Membership" row:
  — Tappable → goes to M1
  — Shows tier badge, sessions, renewal
  — Non-member: "Drop-in · Free [View Plans →]"

"My Bookings" row:
  — Tappable → goes to B4
  — Shows count + next upcoming
  — No bookings: "No upcoming bookings [Book →]"


════════════════════════════════════════════════════
NOTIFICATIONS (PUSH + IN-APP)
════════════════════════════════════════════════════

Design notification cards for in-app toast
and push notification content:

Membership:
  ✓ "Membership activated — welcome to Gold!"
  🔔 "Your Gold membership renews in 7 days"
  ⚠ "Your membership has expired"
  📊 "You've used all 12 sessions this month"

Booking:
  ✓ "Court A booked for Thu, March 13 at 14:00"
  🔔 "Reminder: Court A in 30 minutes"
  ❌ "Your booking for Court A has been cancelled"

In-app toast style:
  — Slide down from top
  — Neutral-800 bg, rounded-xl
  — Icon + message + dismiss
  — Auto-dismiss after 4s


════════════════════════════════════════════════════
COMPONENT INVENTORY
════════════════════════════════════════════════════

New components to design:

Shared:
  — Membership badge (pill)
    Variants: with star, with dot, none
    Sizes: small (queue list), medium (profile)
  — Session counter bar
    States: normal, warning (80%), full (100%)
  — Booking status badge
    Variants: confirmed, cancelled, completed, no-show

Player app:
  — Tier card (M1)
    States: current, available, higher tier
  — Calendar month picker (B1)
  — Slot grid cell (B1)
    States: available, booked, selected
  — Booking detail card (B2, B3, B4)
  — Co-player search + list (B2)
  — Contact bottom sheet (M1)
  — Cancel confirm sheet (B4)
  — Home: "Book a Court" card
  — Home: session counter bar
  — Profile: membership summary row
  — Profile: bookings summary row

Staff dashboard:
  — Court card: reserved state (purple)
  — Booking alert banner (amber)
  — Membership badge on queue items

Admin panel:
  — Tier config card (M3)
  — Tier create/edit modal (M3)
  — Activate membership modal (M3)
  — Suspend/cancel confirm dialog (M3)
  — Members table row (M3)
  — Court timeline bar (B5)
  — Booking list row (B5)
  — Booking config form (B6)


════════════════════════════════════════════════════
SCREEN MAP — ALL FLOWS
════════════════════════════════════════════════════

Player:
  Home ─→ M1 (View Plans)
       ─→ B1 (Book a Court) → B2 → B3
       ─→ Join Queue (existing)

  Profile ─→ M1 (View Plans)
          ─→ M2 (My Membership section)
          ─→ B4 (My Bookings)

Staff:
  Courts tab ─→ Booked court detail
             ─→ Booking alert → End Game

Admin:
  Memberships ─→ Create Tier
              ─→ Edit Tier
              ─→ Activate Membership
              ─→ Suspend / Cancel
  Bookings ─→ Timeline + list
           ─→ Add manual booking
           ─→ Cancel / No-show
  Venues ─→ Booking Configuration (B6)
