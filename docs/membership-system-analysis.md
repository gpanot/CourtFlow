# CourtFlow — Memberships: Complete Technical & Product Analysis

**Date:** July 17, 2026
**Purpose:** Comprehensive snapshot of the venue Membership system for product and technical analysis. It documents current behavior, data model, APIs, admin UI, player access, payment handling, reporting integrations, and known gaps.

> **Scope clarification:** Memberships and Program Passes are separate CourtFlow products. This document covers `/admin/memberships`. The class-credit and cohort system at `/admin/program-passes` is documented in [`program passes-system-analysis.md`](program%20passes-system-analysis.md).

---

## 1. Executive Summary

Memberships is CourtFlow's venue-level recurring subscription system.

A venue defines up to four active membership tiers. Each tier has:

- A monthly price
- A limited or unlimited session allowance
- Optional display badge
- A list of descriptive perks

Staff can activate one membership for a player at a venue, record monthly payments, change the player's tier, edit usage, suspend or cancel the membership, and review payment history.

The current cycle is a rolling **30-day cycle**, not a calendar month. Activating a membership creates an unpaid payment record for the first 30-day period.

The system is separate from Program Passes:

- Membership uses `MembershipTier`, `Membership`, and `MembershipPayment`.
- Program Passes use `ProgramPassType`, `ProgramPass`, `ProgramRun`, `ClassInstance`, and their own payment/check-in records.
- A player can have both a Membership and one or more Program Passes.
- Membership payment and usage records never update Program Pass records, and vice versa.

---

## 2. Product Purpose

Memberships is intended to represent general recurring access to a venue, particularly open-play participation.

Typical examples:

- Bronze Membership — 4 sessions per 30 days
- Silver Membership — 8 sessions per 30 days
- Unlimited Membership — unlimited sessions for 30 days
- VIP Membership — unlimited sessions plus manually described perks

The feature currently supports staff-managed subscriptions. It is not a complete self-service subscription commerce system:

- Staff activates memberships.
- Staff records or reverts payments.
- Players can read their membership through an authenticated API.
- No player-facing purchase or checkout route exists.
- No automatic card charge or payment gateway subscription exists.

---

## 3. Core Concepts

### 3.1 Membership Tier

A reusable venue-specific subscription product.

It defines:

- Name
- Price
- Session allowance
- Badge visibility
- Descriptive perks
- Display order
- Active/inactive state

### 3.2 Membership

One player's subscription at one venue.

It defines:

- Selected tier
- Status
- Activation date
- Next renewal date
- Sessions used in the current cycle

The database enforces one Membership per `(playerId, venueId)`.

### 3.3 Membership Payment

A payment obligation or receipt for one Membership period.

It defines:

- Period start and end
- Amount
- Payment status
- Payment date and method
- Optional proof image URL
- Optional note

### 3.4 Membership Contact Configuration

Each venue can store:

- Membership WhatsApp contact
- Membership contact email

These values are stored inside `Venue.settings.membershipConfig`, not in a dedicated table.

---

## 4. High-Level Data Flow

```text
Venue
 ├── MembershipTier
 │    ├── name
 │    ├── priceValue
 │    ├── sessionsIncluded (null = unlimited)
 │    ├── perks
 │    └── Membership
 │         ├── Player
 │         ├── status
 │         ├── renewalDate
 │         ├── sessionsUsed
 │         └── MembershipPayment[]
 │
 └── settings.membershipConfig
      ├── contactWhatsApp
      └── contactEmail
```

Activation flow:

```text
Staff selects Player + Tier
        ↓
POST /api/admin/memberships/activate
        ↓
Upsert Membership as active
Reset sessionsUsed to 0
Set renewalDate to now + 30 days
        ↓
Create UNPAID MembershipPayment
for now → renewalDate
```

---

## 5. Database Schema

### 5.1 `membership_tiers`

Prisma model: `MembershipTier`

| Column | Type | Meaning |
|---|---|---|
| `id` | TEXT / cuid | Primary key |
| `venue_id` | TEXT | Venue owning the tier |
| `sort_order` | INT | Display order within the venue |
| `name` | TEXT | Tier name |
| `price_value` | INT | Price in the application's smallest configured currency unit; UI treats it as VND |
| `sessions_included` | INT nullable | Session allowance; `NULL` means unlimited |
| `show_badge` | BOOLEAN | Whether UI should visually highlight membership status |
| `is_active` | BOOLEAN | Whether tier is available for new activation |
| `perks` | JSON | Array of descriptive perk strings |
| `created_at` | TIMESTAMP | Creation time |

Relations:

- Belongs to one `Venue`
- Has many `Membership` records

Constraints:

- Unique `(venue_id, sort_order)`
- Application limit of four active tiers per venue

Important behavior:

- Deleting a tier is a soft deactivation (`isActive = false`).
- A tier cannot be deactivated while it has active memberships.
- Suspended, expired, or cancelled memberships do not block tier deactivation.

### 5.2 `memberships`

Prisma model: `Membership`

| Column | Type | Meaning |
|---|---|---|
| `id` | TEXT / cuid | Primary key |
| `player_id` | TEXT | Player owning the membership |
| `venue_id` | TEXT | Venue where it applies |
| `tier_id` | TEXT | Selected MembershipTier |
| `status` | MembershipStatus | `active`, `suspended`, `expired`, or `cancelled` |
| `activated_at` | TIMESTAMP | Most recent activation/reactivation time |
| `renewal_date` | TIMESTAMP | End of current rolling 30-day cycle |
| `sessions_used` | INT | Usage counter for the current cycle |
| `created_at` | TIMESTAMP | First creation time |
| `updated_at` | TIMESTAMP | Last update time |

Relations:

- Belongs to one `Player`
- Belongs to one `Venue`
- Belongs to one `MembershipTier`
- Has many `MembershipPayment` records

Constraints and indexes:

- Unique `(player_id, venue_id)`
- Index on `venue_id`
- Index on `tier_id`

The unique constraint means:

- A player can have only one Membership record at a given venue.
- Reactivation updates that existing row rather than creating a second Membership.
- A player can have separate Memberships at different venues.

### 5.3 `membership_payments`

Prisma model: `MembershipPayment`

| Column | Type | Meaning |
|---|---|---|
| `id` | TEXT / cuid | Primary key |
| `membership_id` | TEXT | Parent Membership |
| `period_start` | TIMESTAMP | Beginning of covered period |
| `period_end` | TIMESTAMP | End of covered period |
| `amount_value` | INT | Expected or paid amount |
| `status` | MembershipPaymentStatus | `UNPAID`, `PAID`, or `OVERDUE` |
| `paid_at` | TIMESTAMP nullable | When payment was recorded |
| `payment_method` | TEXT nullable | Payment method such as cash or bank transfer |
| `note` | TEXT nullable | Staff-entered note |
| `proof_url` | TEXT nullable | URL of payment proof |
| `created_at` | TIMESTAMP | Record creation time |

Indexes:

- `membership_id`
- `status`

There is no database uniqueness constraint preventing duplicate payment periods.

### 5.4 Venue Settings JSON

Membership contact details live in the venue's general JSON settings:

```json
{
  "membershipConfig": {
    "contactWhatsApp": null,
    "contactEmail": null
  }
}
```

Defaults are defined in `src/lib/booking.ts`.

---

## 6. Status Models

### 6.1 Membership Status

| Status | Meaning | Current UI behavior |
|---|---|---|
| `active` | Membership is considered usable | Can edit usage, change tier, suspend, or cancel |
| `suspended` | Temporarily disabled | Can reactivate |
| `expired` | Renewal has lapsed | Displayed, but no direct admin reactivation action in the table |
| `cancelled` | Staff cancelled membership | Displayed as terminal in the membership table |

Activation or reactivation always:

- Sets status to `active`
- Replaces the tier with the selected tier
- Sets `activatedAt` to now
- Sets `renewalDate` to now + 30 days
- Resets `sessionsUsed` to zero
- Creates a new unpaid payment

### 6.2 Payment Status

| Status | Meaning |
|---|---|
| `UNPAID` | Payment has not been recorded as paid |
| `PAID` | Staff recorded payment |
| `OVERDUE` | Period ended while still unpaid |

The list API also derives an effective `OVERDUE` status at read time when:

```text
stored status = UNPAID
AND periodEnd < now
```

Therefore an overdue payment may still be stored as `UNPAID` while displayed as `OVERDUE`.

---

## 7. Billing and Renewal Behavior

### 7.1 Cycle Length

The cycle is hardcoded in two places as:

```ts
const CYCLE_DAYS = 30;
```

It is a rolling 30-day period:

```text
renewalDate = activation time + 30 local calendar days
```

It is not aligned to:

- The first or last day of a calendar month
- A venue billing day
- The player's original day-of-month after manual reactivation

### 7.2 Initial Payment

Activation creates:

```text
periodStart = now
periodEnd = renewalDate
amountValue = selected tier price
status = UNPAID
```

Membership activation does not require payment first. The Membership becomes active immediately even though its payment is unpaid.

### 7.3 Cycle Reset

`checkAndResetCycle()` in `src/lib/membership.ts` is designed to:

1. Return without changes if `renewalDate > now`.
2. Starting from the previous renewal date, add 30 days repeatedly until the date is in the future.
3. Reset `sessionsUsed` to zero.
4. Update `renewalDate`.
5. Create an unpaid MembershipPayment if one does not exist for the previous renewal date.

This function is lazy: it runs when `checkSessionLimit()` runs.

Current direct call chain:

```text
GET /api/membership/mine
  → checkSessionLimit()
    → checkAndResetCycle()
```

### 7.4 Expiration Helper

`expireMemberships()` is designed to:

1. Mark past-due unpaid payments as `OVERDUE`.
2. Mark active memberships whose renewal date is in the past as `expired`.

However, no caller or scheduled route was found in the current codebase. It is described as intended for a cron job but is not currently wired to one.

### 7.5 Payment Is Not Access Control

Current code does not suspend or expire a Membership merely because its payment is unpaid or overdue.

Payment state and Membership state are independent:

- An active Membership can have an unpaid or overdue payment.
- Marking a payment paid does not change Membership status.
- Reverting a payment to unpaid does not suspend the Membership.

---

## 8. Session Allowance Logic

### 8.1 Limited vs Unlimited

`sessionsIncluded` controls the allowance:

- Number: limited tier
- `null`: unlimited tier

`checkSessionLimit(playerId, venueId)` returns:

```ts
{
  allowed: boolean;
  used: number;
  limit: number | null;
  isUnlimited: boolean;
}
```

Behavior:

- No Membership: allowed, treated as unlimited by the helper
- Non-active Membership: allowed, treated as unlimited by the helper
- Active unlimited Membership: allowed
- Active limited Membership: allowed only while `sessionsUsed < sessionsIncluded`

The “allowed when no active membership” behavior means this helper is not a membership entitlement check. It only enforces a limit when an active limited Membership exists.

### 8.2 Increment Helper

`incrementSessionCount(playerId, venueId)`:

1. Loads the venue Membership.
2. No-ops if it does not exist or is not active.
3. Lazily resets the cycle if needed.
4. Increments `sessionsUsed`.

Its comment says it should be called when a player joins open play.

### 8.3 Actual Integration Status

No calls to `incrementSessionCount()` were found outside `src/lib/membership.ts`.

No booking, queue, open-play registration, or check-in endpoint currently calls either:

- `incrementSessionCount()`
- `checkSessionLimit()`

The only current caller of `checkSessionLimit()` is the player `GET /api/membership/mine` read endpoint.

Therefore, as currently wired:

- Session usage is not automatically incremented by open-play participation.
- The configured session limit does not block registration or check-in.
- Staff can manually edit `sessionsUsed` from `/admin/memberships`.
- Analytics report whatever value is currently stored, which may be manually maintained.

This is the largest functional gap between the intended Membership behavior and the currently enforced behavior.

---

## 9. Admin API

All Membership admin routes use `requireAdminAccess`, not the stricter Program Pass `requireSuperAdmin` guard.

### 9.1 Membership Tiers

#### `GET /api/admin/membership-tiers?venueId=`

Returns all tiers for a venue, including inactive tiers.

Includes:

- Active membership count per tier
- Sorted by `sortOrder`

#### `POST /api/admin/membership-tiers`

Creates a tier.

Body:

```json
{
  "venueId": "venue-id",
  "name": "Gold",
  "priceValue": 1500000,
  "sessionsIncluded": 12,
  "showBadge": true,
  "perks": ["10% coffee discount"]
}
```

Rules:

- Maximum four active tiers per venue
- `sessionsIncluded` defaults to `null` when omitted
- New sort order is current maximum + 1

#### `PATCH /api/admin/membership-tiers/[id]`

Can update:

- Name
- Price
- Session allowance
- Badge setting
- Perks
- Sort order

#### `DELETE /api/admin/membership-tiers/[id]`

Soft-deactivates the tier.

Returns a 400 error if active memberships still use the tier.

### 9.2 Membership Records

#### `GET /api/admin/memberships`

Required:

- `venueId`

Optional filters:

- `tierId`
- `status`
- `paymentStatus`

Returns:

- Membership list
- Player information
- Tier information
- Latest payment
- Effective current payment status
- Payment summary

The payment filter is applied in application memory after querying Memberships.

#### `POST /api/admin/memberships/activate`

Body:

```json
{
  "playerId": "player-id",
  "venueId": "venue-id",
  "tierId": "tier-id"
}
```

Validates:

- Tier exists, is active, and belongs to the venue
- Player exists

Then upserts by `(playerId, venueId)`.

Create and update paths both:

- Set selected tier
- Set status active
- Set activation time to now
- Set renewal to now + 30 days
- Reset usage to zero

It then creates a new unpaid payment.

#### `PATCH /api/admin/memberships/[id]`

Supports:

- `status: suspended | cancelled`
- `sessionsUsed`
- `tierId`

Tier change behavior:

- New tier must be active and belong to the same venue.
- The Membership changes tier immediately.
- If the latest payment is not paid, its amount is changed to the new tier price.
- A note is added identifying the old and new tiers.
- Paid current-period payments are not adjusted.
- There is no proration.

### 9.3 Membership Payments

#### `GET /api/admin/membership-payments`

Requires either:

- `membershipId`
- `venueId`

Optional:

- `status`

Returns payments with parent Membership, Player, and Tier details.

#### `PATCH /api/admin/membership-payments/[id]`

Supports:

- Mark paid
- Revert to unpaid
- Change amount
- Set method
- Set paid date
- Set note
- Set proof URL

Marking paid:

- Sets `status = PAID`
- Uses supplied `paidAt` or current time
- Stores payment method, note, and proof

Reverting:

- Sets `status = UNPAID`
- Clears `paidAt`
- Clears `paymentMethod`
- Does not automatically clear note or proof

### 9.4 Venue Membership Configuration

#### `PUT /api/admin/venues/[id]/membership-config`

Updates:

```json
{
  "contactWhatsApp": "+84...",
  "contactEmail": "memberships@venue.com"
}
```

The route:

- Requires admin access
- Enforces venue scope
- Merges defaults, current config, and request body
- Writes the result back to `Venue.settings`

---

## 10. Player API

### 10.1 `GET /api/membership/tiers?venueId=`

Requires player authentication.

Returns active tiers with:

- ID
- Name
- Price
- Session allowance
- Badge visibility
- Sort order

It does not currently return the tier `perks` field.

### 10.2 `GET /api/membership/mine?venueId=`

Requires player authentication.

Looks up the Membership using the authenticated player ID and venue ID.

Returns:

```json
{
  "membership": {},
  "sessionLimit": {
    "allowed": true,
    "used": 2,
    "limit": 8,
    "isUnlimited": false
  }
}
```

If no Membership exists:

```json
{
  "membership": null,
  "sessionLimit": null
}
```

Current implementation detail:

- It loads `membership`.
- Then it calls `checkSessionLimit()`, which may update the Membership cycle.
- The originally loaded Membership object is still returned.

If the cycle resets during this call, `sessionLimit` can represent the updated state while the returned `membership.renewalDate` and `membership.sessionsUsed` remain stale for that response.

### 10.3 Missing Player Actions

No player routes currently exist for:

- Purchasing a Membership
- Activating a Membership
- Paying a Membership invoice
- Cancelling a Membership
- Changing tier
- Updating payment method

The player API surface is read-only.

No direct web or React Native consumer of `/api/membership/mine` or `/api/membership/tiers` was found in `src/` during this audit.

---

## 11. Admin UI

Main page:

```text
/admin/memberships
```

Implementation:

```text
src/app/(admin)/admin/memberships/page.tsx
```

The page uses:

- Admin venue picker
- Admin i18n translations
- Shared `PaymentConfirmModal`
- Responsive tier cards and member table

### 11.1 Tabs

#### Memberships

Contains:

- Payment summary
- Tier management
- Membership list
- Activation flow
- Payment history

#### General Settings

Contains:

- Membership WhatsApp contact
- Membership email contact

### 11.2 Payment Summary

Four cards/actions:

- Collected this month
- Unpaid count and amount
- Overdue count
- Toggle to show unpaid memberships only

### 11.3 Tier Management

Displays active tiers as cards.

Each card shows:

- Optional crown badge
- Name
- Price `/mo`
- Limited or unlimited sessions
- Perk list
- Active member count
- Edit action
- Deactivate action

Creation is hidden when four active tiers exist.

Tier form fields:

- Name
- Price
- Sessions per month (`blank = unlimited`)
- Show badge
- Perks

Perks can be:

- Selected from perks already used by other tiers
- Added as a new free-text perk

### 11.4 Membership List

Filters:

- Tier
- Membership status
- Payment status

Columns:

- Player
- Tier
- Status
- Usage
- Payment
- Renewal
- Actions

Usage is directly editable inline.

Actions for active memberships:

- View payment history
- Change tier
- Suspend
- Cancel

Action for suspended memberships:

- Reactivate

### 11.5 Activation Modal

Staff:

1. Searches for a player by name or phone.
2. Selects an active tier.
3. Activates the Membership.

There is no payment collection step in the activation modal. Activation creates an unpaid payment, which staff handles afterward.

### 11.6 Change Tier Modal

Shows:

- Current tier
- New tier selector
- Upgrade/downgrade price difference
- Message that payment will be adjusted

Only the latest unpaid payment is actually adjusted. There is no proration or automatic collection/refund.

### 11.7 Payment Modal and History

The shared payment modal supports:

- Mark paid
- Amount
- Payment method
- Paid date
- Note
- Proof URL
- Revert paid payment to unpaid

The payment history drawer lists all periods newest first.

---

## 12. Reporting and Cross-Feature Integrations

### 12.1 Admin Dashboard

`/api/admin/dashboard` reports:

- Active Membership count
- Unpaid Membership payment count and amount
- Overdue Membership payment count and amount
- Membership revenue collected this month
- Memberships renewing within seven days

Membership revenue contributes to the dashboard's monthly cash total.

### 12.2 Venue Analytics

`/api/admin/venue-analytics` reports:

- Active Memberships
- Suspended Memberships
- Cancelled + expired Memberships
- New Memberships in selected period
- Estimated Membership MRR
- Tier breakdown
- Sessions used
- Sessions included
- Unlimited Membership count

Important:

- MRR is computed from active tier prices, not actual paid payment records.
- Usage analytics depend on `sessionsUsed`, which is not currently incremented automatically.

### 12.3 CourtPass Player Administration

Memberships are used in the CourtPass player administration APIs to:

- Include players associated with a venue
- Display Membership name and status
- Calculate pending Membership balance
- Show Membership details and available tiers
- Combine Membership payments with booking payments
- Prevent deletion while active Memberships exist

### 12.4 CourtPay Staff Player List

The staff/boss player API uses active Membership rows to mark CourtPass players as having a subscription-like entitlement.

This is separate from the CourtPay `PlayerSubscription` model used for CourtPay-native players.

### 12.5 Player Deletion

Admin player deletion:

- Blocks deletion when active Memberships exist
- Requires cancellation first
- Explicitly deletes Membership payments before deleting Membership rows

The broader CourtPass-player deletion transaction also deletes Membership payments and Memberships before deleting the Player.

---

## 13. KPI Calculations

### Membership Page Summary

The `/api/admin/memberships` summary queries payments whose `periodStart` is in the current calendar month.

It calculates:

| KPI | Calculation |
|---|---|
| `totalCollected` | Sum of `amountValue` for `PAID` records |
| `unpaidCount` | Number of stored `UNPAID` records |
| `unpaidAmount` | Sum of `UNPAID` amounts |
| `overdueCount` | Past-due `UNPAID` records plus records stored as `OVERDUE` |

Potential difference from dashboard metrics:

- Membership page uses `periodStart` for “this month.”
- Admin dashboard uses `paidAt` for collected-this-month revenue.

A payment for an older period paid this month can appear in dashboard revenue but not in the Membership page's current-period collection total.

---

## 14. Authentication and Venue Scope

Admin Membership routes use:

```ts
requireAdminAccess(request.headers)
```

This is broader than Program Pass routes, which commonly use `requireSuperAdmin`.

Player Membership routes use:

```ts
requireAuth(request.headers)
```

Venue configuration update additionally calls:

```ts
assertVenueAccess(auth, venueId)
```

Not every individual Membership route visibly rechecks that the requested record belongs to an authorized venue; the system relies partly on the behavior of `requireAdminAccess` and the IDs supplied by the client.

---

## 15. What Is Enforced Today

### Enforced

- Maximum four active tiers per venue
- One Membership per player per venue
- Tier must be active and belong to the venue during activation
- Player must exist during activation
- Tier cannot be deactivated while active members use it
- Tier changes remain within the Membership's venue
- Negative manually entered usage is clamped to zero
- Membership activation resets usage and starts a new 30-day period
- Payment history is retained across reactivation

### Not Enforced

- Payment before activation
- Suspension for unpaid or overdue payment
- Automatic Membership expiration through a wired scheduler
- Automatic session increment on participation
- Session-limit blocking during open play, booking, queue entry, or check-in
- Perk entitlement or discount application
- Calendar-month billing
- Automatic recurring payment collection
- Proration on tier change
- Duplicate payment-period prevention at database level

---

## 16. Known Product and Technical Gaps

### P0 — Core correctness gaps

#### Usage is not wired to participation

`incrementSessionCount()` exists but has no caller. Limited Memberships are therefore not enforced automatically.

Recommended direction:

- Identify the authoritative “consumed a session” event.
- Call `checkSessionLimit()` before acceptance.
- Increment usage in the same transaction as registration/check-in.
- Make the operation idempotent so retries cannot double-charge a session.

#### Expiration is not scheduled

`expireMemberships()` exists but has no cron or route caller.

Recommended direction:

- Decide whether Memberships auto-renew while unpaid or expire at renewal.
- Remove the current ambiguity between lazy renewal and expiration.
- Add one authoritative scheduled lifecycle process.

#### Renewal logic and expiration logic conflict conceptually

- `checkAndResetCycle()` automatically advances an overdue active Membership.
- `expireMemberships()` would expire that same Membership.

Whichever function runs first determines the outcome.

A product decision is required:

1. Auto-renew and create debt, keeping access active.
2. Expire/suspend until payment.
3. Apply a grace period.

### P1 — Commerce gaps

- No player checkout
- No online payment gateway subscription
- No stored payment method
- No auto-charge
- No invoice delivery or reminders
- No proration
- No refund automation
- No player cancellation or upgrade flow

### P1 — Player experience gaps

- Player APIs are read-only
- No identified web/mobile Membership screen consuming those APIs
- Public tier API omits perks
- Contact configuration is stored but no player consumer was found

### P1 — Access and entitlement gaps

- Perks are display-only strings
- No booking discount integration
- No lesson discount integration
- No priority-booking rules
- No explicit entitlement model
- No membership-only event/access check

### P2 — Data and reporting gaps

- MRR is estimated from active tier prices rather than collected revenue
- Usage analytics may be stale or manually entered
- Membership page and dashboard use different definitions of monthly collected revenue
- No churn rate, retention cohort, failed renewal rate, or LTV reporting
- No audit log for manual usage edits or status changes

---

## 17. Important Edge Cases

### Reactivating a suspended Membership

Reactivation calls the same activation endpoint:

- Existing Membership row is reused
- Activation date and renewal date are reset
- Usage resets to zero
- A new unpaid payment is created
- Old payment history remains

### Activating an already active Membership

The endpoint does not reject this:

- Current cycle is restarted
- Usage resets
- Another unpaid payment is created

The admin UI normally exposes activation through player selection, so duplicate activation remains possible if staff selects an already active player.

### Changing tier after payment

If latest payment is already paid:

- Membership changes tier immediately
- Paid amount remains unchanged
- No additional charge, credit, or proration is created

### Deactivated tier with suspended members

Because only active Memberships block deactivation:

- A tier can be deactivated while suspended Memberships still reference it.
- Reactivating through the normal activation endpoint requires selecting an active tier.

### Long-overdue lazy reset

`checkAndResetCycle()` advances through multiple 30-day periods but creates at most one payment using:

- `periodStart = previousRenewal`
- `periodEnd = final future renewal`
- One tier-price amount

This can represent multiple elapsed cycles with one payment amount.

---

## 18. Membership vs Program Pass

| Area | Membership | Program Pass |
|---|---|---|
| Admin page | `/admin/memberships` | `/admin/program-passes` |
| Product definition | `MembershipTier` | `ProgramPassType` |
| Player entitlement | `Membership` | `ProgramPass` |
| Payment table | `membership_payments` | `class_pass_payments` |
| Primary purpose | General recurring venue access | Class credits and structured programs |
| Cycle | Fixed rolling 30 days | Monthly, fixed-day, or custom |
| Session consumption | Intended open-play usage; not currently wired | Explicit class check-in |
| Scheduling | None | Program Runs and ClassInstances |
| Court blocking | None | Generated Program Runs create CourtBlocks |
| Coach assignment | None | Pass types, runs, and class blocks |
| Capacity | Per-tier session allowance | Pass session cap plus run/class capacity |
| Enrollment | Staff activation | Staff pass activation or run enrollment logic |
| Database relationship | Separate | Separate |

The two systems share:

- Player
- Venue
- Admin UI conventions
- Similar payment status concepts
- A `sessionsUsed` counter concept

They do not share:

- Product records
- Entitlement records
- Payment records
- Renewal logic
- Attendance/check-in records
- API routes
- Domain libraries

---

## 19. File Map

```text
src/
  app/
    (admin)/admin/memberships/
      page.tsx

    api/admin/
      memberships/
        route.ts
        activate/route.ts
        [id]/route.ts

      membership-tiers/
        route.ts
        [id]/route.ts

      membership-payments/
        route.ts
        [id]/route.ts

      venues/[id]/membership-config/
        route.ts

    api/membership/
      mine/route.ts
      tiers/route.ts

  lib/
    membership.ts
    booking.ts

  components/admin/
    PaymentConfirmModal.tsx

prisma/
  schema.prisma
    MembershipTier
    Membership
    MembershipPayment
    MembershipStatus
    MembershipPaymentStatus
```

Related reporting and player-management integrations:

```text
src/app/api/admin/dashboard/route.ts
src/app/api/admin/venue-analytics/route.ts
src/app/api/admin/players/[playerId]/route.ts
src/app/api/admin/courtpass-players/route.ts
src/app/api/admin/courtpass-players/[playerId]/route.ts
src/app/api/courtpay/staff/boss/players/route.ts
```

---

## 20. Recommended Product Decisions

Before extending Memberships, define these rules explicitly:

1. Does an unpaid renewal keep access active, enter grace, suspend, or expire?
2. What exact action consumes a session: open-play registration, physical check-in, queue join, or completed visit?
3. Can one visit consume more than one session?
4. Can staff override a reached session limit?
5. Are tiers rolling 30-day products or calendar-month products?
6. Do perks remain descriptive, or become enforceable discounts/entitlements?
7. Can players purchase and manage Memberships themselves?
8. How should upgrades and downgrades be prorated?
9. Should Membership and CourtPay `PlayerSubscription` eventually converge?
10. Which revenue definition is authoritative: payment period, payment date, or accrued MRR?

---

## 21. Concise Current-State Assessment

The Membership system currently provides a strong admin-facing foundation:

- Tier management
- One Membership per player/venue
- Manual activation and lifecycle controls
- Manual payment tracking with proof
- Payment history
- Dashboard and venue analytics
- Player-management integration

It is not yet a fully enforced or automated subscription engine:

- Session limits are not connected to participation.
- Renewal and expiration behavior is ambiguous and unscheduled.
- Payment does not control access.
- Player commerce and self-service are absent.
- Perks are informational only.

The safest product framing today is:

> Memberships is a staff-managed recurring entitlement and receivables ledger, with planned session-limit behavior that is not yet operationally enforced.

---

*End of document. Generated from the CourtFlow codebase on July 17, 2026.*
