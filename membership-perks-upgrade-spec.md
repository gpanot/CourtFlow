# Membership Perks Upgrade — Spec v2

**Scope:** The venue Membership system (`MembershipTier`, `Membership`, `MembershipPayment`, admin page `/admin/memberships`)
**Out of scope:** Program Passes (`ProgramPassType`, `ProgramPass`, cohort/class system at `/admin/program-passes`), CourtPay Packages, `PlayerSubscription`
**Status:** All open questions resolved with Connor, ready for the investigate-first Cursor prompt (section 9, Prompt 1)

**Correction note (v2):** v1 of this spec was written against the wrong system, `program_pass_types`, which is the Program Pass/class-credit product. Memberships and Program Passes are separate CourtFlow products with separate tables, separate admin pages, and separate payment records, confirmed by the actual Membership system analysis. This version targets the real tables: `membership_tiers`, `memberships`, `membership_payments`.

---

## 1. Why

Right now a membership tier is a price, a session count, and a list of descriptive perk strings with no enforcement behind them. Every US pickleball, tennis, and padel club researched for this spec follows the same shape:

- A base price, sometimes $0 for a loyalty or community tier
- A discount on court bookings (typically 10 to 25 percent, or a flat $ off per hour)
- A discount on lessons and clinics (often steeper than the court discount, 20 to 30 percent)
- A bucket of included sessions per cycle (open play, not court reservations)
- An advance booking window longer than non-members get
- Guest passes per cycle
- A pro shop / retail discount
- A one-time initiation fee separate from the recurring price, and a minimum commitment length, both confirmed directly from a real US club's published pricing (see below)

Sources: Newport Pickleball Club, Play Pickleball Club (Louisville), Pickleball Athletic Club, Club Pickleball USA, Edmonton Pickleball Center, plus a screenshot of a real US club's membership page ($80/month, 20% member discount on bookings/programming/select purchases, advance registration window, 2-month minimum commitment, $50 initiation fee on the non-promotional variant).

The goal is to let a venue build any of those tiers as data, and to make the existing `perks` field actually do something instead of being decorative text.

---

## 2. What changes, what does not

| Stays the same | Changes |
|---|---|
| Program Passes, `program_pass_types`, `ProgramRun`, `ClassInstance`, coach binding | `MembershipTier.perks` becomes structured, not just descriptive strings |
| `Membership` one-per-`(playerId, venueId)` constraint | New fields on `MembershipTier`: initiation fee, minimum commitment |
| Rolling 30-day cycle (`CYCLE_DAYS = 30`), not calendar month | Checkout flow for bookings and lessons needs to look up active membership perks |
| `membership_payments`, manual staff-recorded payments, no auto-charge | Open Play check-in needs to call the existing but currently-unused `incrementSessionCount()` |
| CourtPay, Sepay, VietQR, `PlayerSubscription` | Cancel-membership flow needs a minimum commitment guard |
| Max 4 active tiers per venue | Admin UI (`/admin/memberships`) gets a perks builder instead of a free-text list |

This spec does not touch Program Passes at all. A player can have both a Membership and one or more Program Passes today, that stays true, the two systems still never share records.

---

## 3. Foundational gaps this spec runs into

The existing Membership analysis already identified these as P0 gaps, independent of perks. This spec either depends on them or directly fixes them, worth naming explicitly so nobody thinks perks are being added to a fully-working system.

**Usage is not wired to participation.** `incrementSessionCount()` exists in `src/lib/membership.ts` but has no caller anywhere in the codebase. This spec's Open Play credit work (section 7) is the fix for this exact gap, not new scope layered on top of it.

**Expiration is not scheduled.** `expireMemberships()` exists but nothing calls it, no cron job runs it. This matters for minimum commitment enforcement, if a membership can sit in an ambiguous state past its renewal date, "has this member fulfilled their 2-month commitment" gets fuzzy. Recommend deciding this alongside the commitment work, not after it.

**Renewal and expiration logic conflict.** `checkAndResetCycle()` auto-advances an overdue active Membership through missed cycles; `expireMemberships()` would instead expire it. Whichever runs first wins, and neither is scheduled today. A product decision is needed here regardless of this spec (auto-renew and create debt, vs. expire/suspend, vs. grace period), flagged again in open questions.

**Payment status does not control access, decided: 7-day grace period then suspend.** An active Membership can currently have an unpaid or overdue payment and nothing changes, `expireMemberships()` exists but nothing calls it. Decided behavior: when `renewalDate` passes with the period's `MembershipPayment` still unpaid, the Membership stays active for 7 more days (a grace period, people forget or are waiting on a paycheck), then automatically flips to `suspended` if still unpaid. This replaces the ambiguous conflict between `checkAndResetCycle()` (which lazily advances overdue memberships) and `expireMemberships()` (which would expire them), the grace-then-suspend rule becomes the one authoritative lifecycle process. Needs a real scheduled job, not the current lazy-on-read pattern, since staff shouldn't have to open the admin panel for suspension to happen. Detailed in section 7.4.

All four are now decided, section 3.1 covers the grace-then-suspend build. Nothing here blocks starting the perks work, but the grace period logic should land early since the minimum commitment feature depends on "is this membership still active" being unambiguous.

### 3.1 Grace period build

- Cron job (matches existing pattern, `CRON_SECRET` bearer auth, Railway schedule), runs daily rather than lazily on read.
- For each active Membership whose latest `MembershipPayment` is `UNPAID` or `OVERDUE` and `periodEnd + 7 days < now`: set status to `suspended`.
- Suspension does not touch `sessionsUsed` or `renewalDate`, those stay as-is so reactivation (existing flow) resumes cleanly.
- Grace period window (7 days) should be a constant, not hardcoded inline, in case a venue ever needs a different window, though there is no ask for per-venue configuration right now.
- This directly replaces `expireMemberships()`'s current unused logic, that function's intent (mark overdue payments, mark lapsed memberships) gets folded into this one cron rather than living as dead code.

---

## 4. Data model

### 4.1 Changes to `membership_tiers`

```sql
ALTER TABLE membership_tiers ADD COLUMN structured_perks JSONB NOT NULL DEFAULT '[]';
ALTER TABLE membership_tiers ADD COLUMN initiation_fee_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE membership_tiers ADD COLUMN minimum_commitment_cycles INTEGER;
```

Follows dbmate workflow: `npm run db:new add_membership_structured_perks` then write up/down SQL, `dbmate migrate`, `prisma db pull`, commit all four artifacts.

New column is named `structured_perks`, not a replacement of the existing `perks` column, to avoid a destructive migration. The existing `perks` column (`JSON`, array of descriptive strings like `"10% coffee discount"`) stays as-is and keeps rendering wherever it renders today. `structured_perks` is the new, enforceable version. Admin UI writes to both: structured entries go into `structured_perks`, and a matching human-readable string gets appended to `perks` automatically so nothing on the display side breaks. This is a deliberate double-write, not a long-term state, flagged in the rollout plan as a follow-up cleanup once the old `perks` rendering paths are confirmed unused.

- `initiation_fee_value`: same unit convention as `price_value` (smallest configured currency unit, UI treats as VND). Charged once at signup, on top of the first cycle's `MembershipPayment`. Zero by default.
- `minimum_commitment_cycles`: null means no minimum, cancel anytime. A value of 2 means the member is locked in for 2 rolling 30-day cycles before cancellation is allowed. Given the cycle is rolling, not calendar-month, "2-month minimum" in practice means 60 days from `activatedAt`, not 2 calendar months.

### 4.2 Perk type catalog (v1)

`structured_perks` is a JSONB array. Each entry:

```json
{ "type": "COURT_BOOKING_DISCOUNT_PERCENT", "value": 10 }
```

| Type | Value meaning | Applies at |
|---|---|---|
| `COURT_BOOKING_DISCOUNT_PERCENT` | Integer 1 to 100 | Booking creation, walk-in court reservations |
| `LESSON_DISCOUNT_PERCENT` | Integer 1 to 100 | Coach lesson booking |
| `OPEN_PLAY_DISCOUNT_PERCENT` | Integer 1 to 100 | Open Play check-in fee, once included sessions are used up for the cycle |
| `ADVANCE_BOOKING_WINDOW_DAYS` | Integer days | Booking availability window, overrides venue default for this player |
| `GUEST_PASSES_PER_CYCLE` | Integer count | Deferred to v1.1, reuse CourtPay package pattern when a client asks |
| `PRO_SHOP_DISCOUNT_PERCENT` | Integer 1 to 100 | On the roadmap, not this pass, display-only whenever it ships |

Note what is not in this list: included open play sessions. That already exists as `sessionsIncluded` / `sessionsUsed` directly on `MembershipTier` / `Membership`, it does not need to become a perk type, it needs to become an enforced counter (section 7). `OPEN_PLAY_DISCOUNT_PERCENT` is the perk that kicks in once that counter is exhausted, the two work together: a Gold tier can include 10 open play sessions per cycle, and once a member goes past that, instead of paying full walk-in price they get 10% off. This is the piece the walk-in fallback in section 7 was missing.

---

## 5. Discount application logic

New shared module, following the existing module isolation pattern:

```
src/modules/memberships/
  lib/
    getActivePerks.ts       — getActiveMembershipPerks(playerId, venueId): Perk[]
    applyDiscount.ts        — applyMembershipDiscount(basePrice, perkType, perks): number
  types.ts
```

`getActiveMembershipPerks` loads the player's active (`status='active'`) `Membership` for the venue, joins to `MembershipTier.structured_perks`, returns the parsed array. Cached per-request, not per-session.

`applyMembershipDiscount` is a pure function: given a base price and a perk type to look for, returns the discounted price or the original if no matching perk exists.

### 5.1 Call sites

- **Court booking:** `src/lib/booking.ts`, wherever the price is computed before writing a `Booking` row. Look up `COURT_BOOKING_DISCOUNT_PERCENT`.
- **Coach lesson booking:** `POST /api/admin/coach-lessons`, same place pricing is finalized. Look up `LESSON_DISCOUNT_PERCENT`.
- **Open Play check-in fee, post-limit:** wherever the check-in fee gets computed once `sessionsUsed` has passed `sessionsIncluded` (the shared function identified in section 7's investigation prompt). Look up `OPEN_PLAY_DISCOUNT_PERCENT`.
- **Advance booking window:** wherever `getAvailableSlots()` enforces the venue's booking window, check for `ADVANCE_BOOKING_WINDOW_DAYS` on the player and take the max of venue default and perk value.

### 5.2 Stacking with promo codes

The approved promo code engine spec already states promo and membership perk are mutually exclusive, no stacking.

**Decided:** if a player has an active membership with a matching discount perk, that discount applies and the promo code is not evaluated, even if the promo code would have been larger. Membership always wins, no comparison needed.

---

## 6. Admin UI changes (`/admin/memberships`)

### 6.1 Tier form modal

- Price field gets a "Free membership" checkbox that zeroes and disables the price input
- New "Initiation fee" field, optional, defaults to 0, sits next to the recurring price field
- New "Minimum commitment" field, optional dropdown (No minimum, 1 cycle, 2 cycles, 3 cycles, 6 cycles, 12 cycles), null by default, labeled with the rolling-cycle framing ("2 cycles ≈ 60 days") so staff aren't misled into thinking it is calendar months
- Perks section: repeatable rows, each a type dropdown (from the catalog in 4.2) plus a value input whose label and unit change based on selected type (percent, days)
- "Add perk" button appends a row, trash icon removes one
- Existing free-text perks list is kept underneath as a fallback for anything not in the structured catalog, still writes to the legacy `perks` column
- Existing 4-active-tier-per-venue limit is unaffected, still enforced

### 6.2 Tier list / cards

Cards gain a structured perk summary row under the price, for example: "10% off courts · 20% off lessons · 10 open plays included, 10% off after." If `initiation_fee_value` is set, show it next to the price the way the reference screenshot does, "$80/month + $50 initiation." If `minimum_commitment_cycles` is set, show a small note, "2-cycle minimum."

### 6.3 Checkout surfaces (booking grid, coach lesson modal)

When staff books for a member, show the discounted price with a small "Member" badge and the original price struck through, same visual pattern already used for promo codes.

---

## 7. Open Play session credit: wiring the existing gap

This is not new scope, it is the fix for the P0 gap named in section 3. `sessionsIncluded` / `sessionsUsed` already exist and already reset on cycle renewal, they are just never incremented.

**Decided:** "5 open plays" means 5 real-time Open Play check-ins, not court booking credits.

Work needed:

1. Identify the single shared function behind the three finalized Open Play check-in paths (coach roster tap, self-check-in QR, manual staff search). Report this back before writing any decrement logic, per standard investigate-first practice, since if these three paths don't already funnel through one function, that's a bigger finding than this spec anticipated.
2. At that shared point, call `checkSessionLimit()` before allowing check-in for a player with an active limited Membership, and call `incrementSessionCount()` after a successful check-in. Both functions already exist in `src/lib/membership.ts`, this is wiring, not new logic.
3. **Decided:** once a member's `sessionsUsed` reaches `sessionsIncluded`, check-in is not blocked. It falls back to a discounted price if the tier has an `OPEN_PLAY_DISCOUNT_PERCENT` perk, or full normal walk-in price if it doesn't. Example, a Gold tier with 10 included sessions and a 10% `OPEN_PLAY_DISCOUNT_PERCENT` perk means session 11 onward costs 10% off, not free, not full price.
4. **Decided:** staff can manually let a member check in past their limit even before hitting normal walk-in fallback, for example a court issue that costs the player a session through no fault of their own. This is an extension of the existing manual `sessionsUsed` edit already available on `/admin/memberships`, the check-in flow needs a staff-only "override, don't count this one" action alongside the normal check-in button, not a new permission model.

---

## 8. Player-facing surface (Phase 2, not this spec)

Read-only player APIs already exist (`GET /api/membership/mine`, `GET /api/membership/tiers`), but the public tier API currently omits perks entirely, and no web or mobile screen was found consuming either endpoint. Once perks are structured data, the natural follow-up is surfacing them in CourtPass, "Member price: $18 (10% off)" at checkout, plus a membership tab in the player profile. Flagging so the data model does not paint you into a corner, not proposing to build it now.

---

## 9. Rollout plan

Staged, report-only investigation phase before any code changes, matching standard practice.

**Prompt 1 (investigate only):** confirm exact call sites for court booking price computation and coach lesson price computation, confirm the single shared function (if one exists) behind the three Open Play check-in paths. Report back before writing any code.

**Prompt 2 (migration):** add `structured_perks`, `initiation_fee_value`, `minimum_commitment_cycles` to `membership_tiers` via dbmate, regenerate Prisma client, no application code yet.

**Prompt 2.5 (grace period cron):** build the daily suspension cron described in section 3.1. Independent of the perks work, can ship on its own, recommend doing this early since the commitment feature (prompt 7) depends on membership status being unambiguous.

**Prompt 3 (perk application lib):** build `getActiveMembershipPerks` and `applyMembershipDiscount` as pure, tested functions. No call sites wired yet.

**Prompt 4 (wire court booking):** wire the court booking discount only. Ship and verify with a real membership before moving on.

**Prompt 5 (wire lessons):** same for `LESSON_DISCOUNT_PERCENT`.

**Prompt 6 (admin UI):** tier form modal perks builder, initiation fee field, minimum commitment field, card summary.

**Prompt 7 (initiation fee + commitment enforcement):** charge `initiation_fee_value` only on genuine first activation, guarded against the reactivation double-charge fixed in 10.1 item 1. Add a `cyclesSinceActivation < minimumCommitmentCycles` guard to the cancel-membership flow, the clock runs continuously including through any suspended periods, no pause logic needed.

**Prompt 8 (Open Play credit wiring):** the work in section 7, including the `OPEN_PLAY_DISCOUNT_PERCENT` fallback pricing once `sessionsIncluded` is exceeded. Depends on prompt 1's finding about the shared check-in function, and on prompt 3's `applyMembershipDiscount` helper.

Guest passes and pro shop discount display are v1.1, not in this rollout.

---

## 10. Decisions confirmed with Connor

Nothing open here anymore, kept as a record of what was decided and why, since these four decisions shape several of the prompts above.

**Decided:** free tiers are a loyalty program, not a lead-gen funnel. Perks on a $0 tier are a genuine reward, not a deliberately weak upsell hook. This means the admin UI should not warn or restrict staff from giving a free tier a real perk (5% off courts is a reasonable free-tier perk under this model, not a mistake).

Flagged for later, not building now: an automated rule like "10 check-ins at this venue auto-grants the free loyalty membership" would need a rule engine that does not exist today, count-based triggers on `checkSessionLimit()` history or similar. Worth another look once the manual version (staff activates the free tier by hand) has been used for a while and the pattern of who qualifies is clearer.

---

## 10.1 Additional gaps found in review

Found on a closer pass after the first round of decisions, now resolved except currency which is non-blocking.

1. **Decided: fix it.** Reactivation must not double-charge the initiation fee. `/api/admin/memberships/activate` needs a check, does a `MembershipPayment` with an initiation-fee line already exist for this `membershipId`, before charging it again. Folds into prompt 7, this is not optional.
2. **Decided: no pause, keep it simple.** The minimum commitment clock keeps running during suspension, no special-case logic for the suspended-mid-commitment scenario. Reasoning: this is an edge case under 5% of memberships, not worth the added complexity of tracking active-vs-suspended cycles separately.
3. **Decided: applies immediately.** Tier upgrades mid-cycle apply the new session allowance right away, `sessionsUsed` carries over unchanged. Matches the realistic reason someone upgrades, they're running out of what they have.
4. **Decided: one-time only.** Changing tiers, upgrade or downgrade, never re-triggers the initiation fee. It is charged exactly once, on genuine first activation.
5. **Currency**, still open, not blocking: `price_value` and `initiation_fee_value` are VND-shaped today, CourtFlow also targets Thailand. Worth reusing the promo code engine's precedent of reading from `Organization.currency` rather than assuming VND, so it doesn't need revisiting the first time a Thai venue sets up a tier.

---

## 11. User stories (for validation)

Each one has a plain acceptance check under it, this is what "done" looks like for testing purposes, not exhaustive QA, just enough to confirm the behavior actually does what the story says.

### Venue manager, setting up a tier

- **US-1:** As a venue manager, I want to create a membership tier with a monthly price, so that I can offer a paid membership.
  - *Test:* Create a tier with price $80. Confirm it appears on the tier list at $80 and is selectable when activating a membership.
- **US-2:** As a venue manager, I want to mark a tier as free ($0), so that I can offer a loyalty or intro tier with no charge.
  - *Test:* Check "Free membership" on a new tier. Price field zeroes and locks. Save. Tier shows $0 on the card.
- **US-3:** As a venue manager, I want to set a one-time initiation fee separate from the recurring price, so that new members pay a signup cost the way the reference screenshot showed.
  - *Test:* Set initiation fee $50 on an $80/month tier. Card shows "$80/month + $50 initiation."
- **US-4:** As a venue manager, I want to set a minimum commitment length in cycles, so that members can't join and cancel after one cycle.
  - *Test:* Set minimum commitment to 2 cycles. Card shows "2-cycle minimum."
- **US-5:** As a venue manager, I want to add a percent discount on court bookings to a tier, so that members get cheaper court time.
  - *Test:* Add `COURT_BOOKING_DISCOUNT_PERCENT: 10` to a tier. Save. Perk shows in the tier's perk summary as "10% off courts."
- **US-6:** As a venue manager, I want to add a percent discount on lessons to a tier, separate from the court discount, so that I can price the two differently.
  - *Test:* Set court discount to 10% and lesson discount to 20% on the same tier. Both show separately in the perk summary, not merged into one number.
- **US-7:** As a venue manager, I want a tier's existing session allowance to actually limit or track Open Play usage, so that "8 sessions per 30 days" means something instead of being a number nobody checks.
  - *Test:* Activate a member on an 8-session tier. Check them into Open Play once. Confirm `sessionsUsed` moves from 0 to 1 on `/admin/memberships`.
- **US-7b:** As a venue manager, I want to give a tier a discount on Open Play once a member exceeds their included sessions, so that going over the limit costs less than full walk-in price instead of jumping straight to it.
  - *Test:* Member with `sessionsUsed = sessionsIncluded` and `OPEN_PLAY_DISCOUNT_PERCENT: 10` checks in again. Fee charged is 10% off normal walk-in, not free, not full price.
- **US-8:** As a venue manager, I want to give a tier a longer advance booking window than non-members get, so that members can reserve courts before the general public.
  - *Test:* Set `ADVANCE_BOOKING_WINDOW_DAYS: 14` on a tier, venue default is 7 days. A member on that tier can see and book a slot 14 days out; a non-member cannot see past 7 days out for the same slot.
- **US-9:** As a venue manager, I want to see a summary of each tier's perks on the tier cards, so that I don't have to open every tier to remember what it includes.
  - *Test:* Tier with 3+ structured perks shows the first 3 inline on its card with a "+N more" if there are extras.

### Front desk staff, at checkout

- **US-10:** As front desk staff, I want a member's court booking to automatically show the discounted price, so that I don't have to calculate it by hand.
  - *Test:* Book a court for a member with a 10% court discount perk. Booking price shown is 90% of the normal rate, no manual entry.
- **US-11:** As front desk staff, I want a member's lesson booking to automatically show the discounted price, so that lesson pricing stays consistent.
  - *Test:* Same as US-10, applied to a coach lesson booking with `LESSON_DISCOUNT_PERCENT`.
- **US-12:** As front desk staff, I want to see a "Member" badge with the original price struck through, so that I can confirm the discount applied correctly.
  - *Test:* Any discounted booking for a member shows the strikethrough original price next to the discounted price and a "Member" label.
- **US-13:** As front desk staff, I want a member's included Open Play sessions to be consumed automatically at check-in, so that I don't have to track usage manually.
  - *Test:* Check a member in via any of the three check-in paths (coach roster tap, self-check-in QR, manual staff search), confirm `sessionsUsed` increments regardless of which path was used.
- **US-14:** As front desk staff, I want a member to be charged the correct fallback price once their included sessions run out, so that the venue doesn't lose revenue after the free sessions are used.
  - *Test:* Same as US-7b, from the staff-facing checkout view rather than the admin panel.

### Player / member

- **US-15:** As a player, I want my membership discount to apply automatically when I check in for Open Play, so that I don't have to ask staff for it.
  - *Test:* Player with an active membership perk checks in, discount is applied without staff manually selecting anything.
- **US-16:** As a player with both a membership and a promo code, I want the system to apply my membership discount and not the promo code, so that pricing is predictable and doesn't need me to pick.
  - *Test:* Apply a promo code to a booking for a player who also has a matching membership discount perk. Confirm the membership discount is the one applied, and the promo code is shown as not used, not stacked.
- **US-17:** As a player, I want to be told I'm still under my minimum commitment period if I try to cancel early, so that I understand why cancellation isn't available yet.
  - *Test:* Attempt to cancel a membership with `minimum_commitment_cycles = 2` after 1 cycle. Cancellation is blocked with a message stating the remaining lock-in period.

### Venue manager, ongoing management

- **US-18:** As a venue manager, I want to see which of my membership tiers have a minimum commitment and what it is, so that I can answer member questions about lock-in periods.
  - *Test:* Tier list clearly shows commitment length per tier without opening the edit modal.
- **US-19:** As a venue manager, I want the initiation fee to appear as its own line in the member's payment history, so that accounting (Jamie) can distinguish it from recurring charges.
  - *Test:* Activate a member on a tier with an initiation fee. Payment history shows two distinct entries, the initiation fee and the first cycle's recurring payment, not combined into one amount.
- **US-20:** As a venue manager, I want existing tiers with no structured perks to keep working exactly as they do today, so that nothing breaks for tiers I've already set up.
  - *Test:* Open a pre-existing tier that has never had structured perks added. Confirm it still activates, bills, and displays correctly with no errors and no unexpected perk text appearing.

### Grace period and suspension (from section 3.1)

- **US-21:** As a venue manager, I want a member's access to stay active for 7 days after a missed renewal payment, so that people who simply forgot don't lose access immediately.
  - *Test:* Let a membership's `renewalDate` pass with its payment unpaid. Confirm status stays `active` for 7 days.
- **US-22:** As a venue manager, I want a membership to auto-suspend if payment still hasn't come in after the grace period, so that non-paying members don't keep indefinite access.
  - *Test:* Same setup as US-21, advance past day 7 still unpaid. Confirm status flips to `suspended` without staff intervention.
- **US-23:** As a venue manager, I want a suspended member to not get charged the initiation fee again when they pay and get reactivated, so that returning members aren't billed twice for signing up once.
  - *Test:* Activate a member on a tier with a $50 initiation fee. Let them lapse into suspension via US-22. Reactivate them. Confirm only one initiation-fee payment line exists across the membership's full payment history, not two.
- **US-24:** As a venue manager, I want a member's session allowance to update immediately when they upgrade tiers mid-cycle, so that upgrading actually solves the problem that made them upgrade.
  - *Test:* Member on a 4-session tier with `sessionsUsed = 3` upgrades to a 10-session tier. Confirm `sessionsIncluded` updates to 10 immediately, `sessionsUsed` stays at 3, and they can check in 7 more times before the cycle resets.

Not included as stories yet, deferred with the rest of that scope: guest pass redemption, pro shop discount redemption, any player-facing CourtPass membership purchase flow.

---

## 12. Flagged for later: prepaid fixed-duration session packs (not in this spec)

Raised during planning, not building now, written down so it doesn't get lost.

Everything in this spec assumes a membership tier is **recurring**: a price per rolling cycle, perks and included sessions that reset every cycle. CourtPay already has a different shape that clients are used to: pay once (for example 1,000,000 VND), get a fixed number of sessions (for example 10), no cycle, no renewal, just a bank of credits that gets used up. This is a punch card, not a subscription.

The client at 002 may ask for this exact thing on the Membership side, a one-time paid Open Play pack instead of a monthly plan. As currently scoped, `MembershipTier` and `Membership` assume a cycle exists (`renewalDate`, `checkAndResetCycle()`). A true one-time pack has no cycle to renew, it just counts down to zero and stops.

This is the same "recurring vs. fixed-duration toggle" already identified as the eventual path to folding CourtPay Packages into a unified Memberships model. Not solving it here. When it comes up, the likely shape is a `billing_type` field on `membership_tiers` (`recurring` | `one_time`), where `one_time` skips cycle renewal entirely and the membership simply expires when `sessionsUsed` hits `sessionsIncluded` or an optional validity window runs out. Flagging now so whoever picks this up later knows it was anticipated, not missed.
