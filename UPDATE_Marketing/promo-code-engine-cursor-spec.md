# Promo Code Engine — Build Spec for Cursor

## Context

CourtFlow needs a promo code system that powers two things at once:
1. Marketing Campaigns page (admin side) — generates trackable links per channel (`?promo=CODE&utm_source=facebook`)
2. CourtPass (player side) — players redeem the code at checkout for a discount on court bookings, coaching, or open play

This is a shared discount mechanic. Build it once, reuse for both promo codes and (later) membership perks.

Follow the standard workflow: investigation-first, report only, no changes, before any code is written. Do not guess schema names, column names, or file paths. Confirm findings before proceeding to the fix prompt.

---

## Stage 1 — Investigation (report only)

Investigate and report back on:

- Current CourtPass booking/checkout flow: which files handle court booking, coaching booking, and open play checkout
- Where price is calculated and where the final charge amount is set, for all three booking types
- Existing `Venue.settings` JSON structure, to confirm the convention for venue-scoped config
- Existing migration pattern (`dbmate`) and current schema for `Booking`, `Session`, and any existing promo/discount related tables (none expected, but confirm)
- How query params are currently handled (if at all) on CourtPass page loads, and whether there's an existing session/cookie mechanism for persisting values across a user's browsing session
- Confirm whether analytics/event logging already exists for booking funnel steps (page view, slot selected, checkout started, booking confirmed) or if this needs to be added

Do not write any code in this stage. Report findings only.

---

## Stage 2 — Schema (migration only)

Using `npm run db:new create_promo_codes`, create a migration with explicit up/down blocks.

### `promo_codes` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `venue_id` | uuid, FK → Venue | promo codes are venue-scoped |
| `code` | text, unique per venue | stored uppercase, case-insensitive match at redemption |
| `discount_type` | enum: `percent`, `fixed`, `free` | `free` forces final price to 0 regardless of `original_price`; `discount_value` is unused/null when type is `free` |
| `discount_value` | numeric, nullable | percent (0-100) or fixed amount in the venue's organization currency, depending on type; null when `discount_type` is `free`. `Organization.currency` already exists in the schema (VN=VND, TH=THB, etc. per the Organization model) — read from there, don't hardcode VND. This applies to both the admin form (label/hint should show the correct currency symbol) and the stored amount itself. |
| `applies_to` | enum: `court_booking`, `coaching`, `open_play`, `all` | works identically for all three discount types, including `free` — a `free` code scoped to `coaching` only applies to coaching bookings |
| `max_redemptions` | integer, nullable | null = unlimited |
| `redemption_count` | integer, default 0 | incremented atomically on redemption; **never decremented**, including on booking cancellation or refund — a redemption is permanent once it happens |
| `max_redemptions_per_player` | integer, nullable, default 1 | prevents one player reusing the same code repeatedly; null = unlimited per player |
| `starts_at` | timestamp | constructed using the same noon-local +07:00 convention documented in `timezone-handling.mdc`, never plain midnight construction; this is the same UTC midnight trap that affects booking dates elsewhere in the codebase |
| `ends_at` | timestamp, nullable | same timezone handling as `starts_at`; null = no end date |
| `is_active` | boolean, default true | manual kill switch, independent of dates/limits |
| `created_at`, `updated_at` | timestamp | |

**No discount stacking.** A booking can have at most one active discount applied at checkout: either a promo code or a membership perk, never both. If a player has an active membership with a matching perk and also enters a promo code, the checkout flow must block combining them (surface this as a choice or a block in Stage 4, decide the exact UX there, but the backend `validate` endpoint in Stage 5 should reject a promo code redemption if a membership perk discount is already applied to the same booking, and vice versa).

**No reversal on cancellation or refund.** If a booking redeemed with a promo code is later cancelled or refunded, `redemption_count` is not decremented and the `promo_redemptions` row is not deleted or reversed. The redemption is permanent the moment it's written. This means a code with a tight cap can effectively "lose" a slot to a cancelled booking — that's accepted behavior, not a bug to fix.

### `promo_redemptions` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `promo_code_id` | uuid, FK → promo_codes | |
| `player_id` | uuid, FK → Player | |
| `booking_id` | uuid, nullable | polymorphic-ish: references whichever booking type redeemed it, store `booking_type` alongside |
| `booking_type` | enum: `court_booking`, `coaching`, `open_play` | |
| `utm_source` | text, nullable | captured from the original link click if available |
| `discount_amount` | numeric | actual amount discounted (venue's org currency), snapshot at redemption time (not recalculated later); when `discount_type` is `free`, this equals `original_price` |
| `original_price` | numeric | price before discount |
| `final_price` | numeric | price after discount; always 0 when `discount_type` is `free` |
| `first_click_id` | uuid, nullable, FK → promo_link_clicks | the earliest matching click this redemption is attributed to, used to compute time-to-convert; null if no matching click was found (direct code entry with no link click, or the click predates this feature) |
| `redeemed_at` | timestamp | |

### `promo_link_clicks` table

Logs every link click carrying a `promo` param, before the player is necessarily identified. This is what makes "time to convert" possible.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `promo_code_id` | uuid, FK → promo_codes | |
| `player_id` | uuid, nullable, FK → Player | null at click time if the player isn't logged in yet; backfilled once they log in or book, if attribution is possible (see below) |
| `utm_source` | text, nullable | |
| `device_session_id` | text | a client-side generated id (or reuse whatever session/cookie mechanism CourtPass already has, confirm in Stage 1) persisted alongside the promo code capture in Stage 3, used to attribute an anonymous click to a player once they identify themselves later in the same session |
| `clicked_at` | timestamp | |

**Attribution note:** most clicks will be anonymous. Attribution to `player_id` and `first_click_id` on the redemption row happens at redemption time: look up the most recent `promo_link_clicks` row matching the same `device_session_id` (or player_id, if the click happened while already logged in) and the same `promo_code_id`. If found, link it. If not found, `first_click_id` stays null and the detail view shows "no click on record" rather than guessing. Do not attempt cross-device attribution — if the player clicked on mobile and booked on a different device, this stays unattributed. That's an accepted limitation, not a bug.

Index `promo_codes` on `(venue_id, code)` unique. Index `promo_redemptions` on `promo_code_id` and on `player_id`. Index `promo_link_clicks` on `promo_code_id` and on `device_session_id`.

After migration: `dbmate migrate` then `prisma db pull` to regenerate the Prisma client. Commit all four artifacts (migration up/down SQL, dbmate schema, Prisma schema, Prisma client).

---

## Stage 3 — CourtPass: capture promo param on link click

- On CourtPass page load, read `promo` and `utm_source` from the URL query string
- Persist both values for the duration of the player's session (session storage or short-lived cookie, confirm which mechanism CourtPass already uses for similar cases in Stage 1 investigation; reuse it, don't introduce a second pattern)
- These values should survive navigation across CourtPass screens until checkout completes or the session ends
- Do not validate the code at this point, just capture and carry it
- Fire a fire-and-forget write to `promo_link_clicks` on this same page load: `promo_code_id` (look up by code, silently no-op if the code doesn't exist rather than surfacing an error to the player), `utm_source`, `device_session_id`, `clicked_at`, `player_id` if already logged in. This should not block or slow down the page render — log asynchronously

---

## Stage 4 — CourtPass: "Have a promo code?" entry point at checkout

Add a "Have a promo code?" collapsed link/button at the checkout step, across all three booking flows (court booking, coaching, open play).

- Collapsed by default, expands to a text input + "Apply" button on tap
- If a promo code was already captured from a link (Stage 3), pre-fill the input and auto-apply on checkout load, but still show it as an editable field so the player can change or remove it
- On "Apply": call a validation endpoint (see Stage 5) with the code, venue, player, and booking type
- Valid code: show the discount applied, updated total, and a way to remove it
- Invalid code: show a clear inline error (expired, not applicable to this booking type, redemption limit reached, code not found) without blocking the rest of checkout
- Only one promo code active per booking

---

## Stage 5 — Backend: validation and redemption endpoints

### `POST /api/courtpass/promo/validate`
Input: `code`, `venue_id`, `player_id`, `booking_type`, `original_price`
Checks in order:
1. Code exists for venue (case-insensitive)
2. `is_active` is true
3. Current time is within `starts_at` / `ends_at`
4. `applies_to` matches `booking_type` (or is `all`)
5. `redemption_count < max_redemptions` (if `max_redemptions` is set)
6. Player's existing redemption count for this code `< max_redemptions_per_player` (if set)
7. No membership perk discount is already applied to this booking (no stacking — reject if one is present)

Returns discount amount and final price, or a specific error reason matching the checks above (used for the inline error message in Stage 4).

### Redemption (on booking confirmation, not on validate)
- Re-run all validation checks at confirmation time, not just at the earlier "Apply" tap, since time may have passed and the limit may have been hit by someone else in between
- If still valid: atomically increment `promo_codes.redemption_count`, insert the `promo_redemptions` row, apply `discount_amount` to the final charge
- Before inserting, attempt click attribution: look up the most recent `promo_link_clicks` row matching this `promo_code_id` and either the current `device_session_id` or `player_id` (see attribution note in Stage 2). If found, set `first_click_id` on the new `promo_redemptions` row. If not found, leave it null
- If no longer valid (race condition on max_redemptions): fail gracefully, tell the player the code just reached its limit, proceed to checkout at full price without blocking the booking

This two-step validate-then-redeem pattern prevents overselling a capped code under concurrent checkouts.

---

## Stage 6 — Admin: Marketing Campaigns page wiring

- Campaign creation form writes a `promo_codes` row (code, discount type/value, applies_to, max_redemptions, max_redemptions_per_player, start/end dates)
- Campaigns list reads redemption counts and revenue from `promo_redemptions`, joined by `promo_code_id`
- Campaign rows are clickable, opening a detail view (drawer or dedicated page, match whatever pattern the admin panel already uses elsewhere for row-to-detail navigation)
- Detail view shows:
  - Summary: total redemptions, total revenue, median time-to-convert (median of `redeemed_at - clicked_at` across all redemptions that have a `first_click_id`; exclude nulls from the median rather than treating them as zero)
  - A redemption table: player name, phone, `redeemed_at`, `discount_amount`, and a time-to-convert badge derived from `redeemed_at - promo_link_clicks.clicked_at` (via `first_click_id`). Bucket into roughly: instant (same session, a few minutes), same day (under 24h), deliberated (24h+). If `first_click_id` is null, show "no click on record" rather than a fabricated bucket — this covers direct code entry with no prior link click
- Analytics tab (funnel, channel split, recent redemptions) all read from `promo_redemptions`, grouped by `utm_source` and `redeemed_at`
- "Link clicks" KPI on the campaigns list and analytics tab now reads from `promo_link_clicks` count, real data now that Stage 2/3 log it
- "Reached booking" / "started checkout" funnel steps still depend on additional event logging inside the booking flow itself, which is separate from promo click logging; confirm in Stage 1 whether this already exists, if not scope it as a smaller follow-up rather than blocking this spec

---

## Not in scope for this pass

- Custom segment builder (CRM stays pre-defined segments)
- Membership perk discount application (separate spec, but reuse this same discount engine pattern: `discount_type`, `discount_value`, `applies_to`)
- Facebook auto-publish / Ads Manager integration
- Waitlist
- Cross-device click attribution (a click on one device followed by a booking on another device stays unattributed, accepted limitation)

---

## Sequencing

1. Stage 1 investigation first, confirm findings before writing any code
2. Stage 2 schema, review migration diff before proceeding
3. Stage 3 + 4 together (CourtPass capture + UI), since 4 depends on 3
4. Stage 5 backend endpoints, including click attribution at redemption time
5. Stage 6 admin wiring last, once redemption and click data actually exist to display
