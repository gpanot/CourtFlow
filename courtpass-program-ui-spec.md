# CourtPass — Program UI Spec (Phase 2)

**Status:** Ready for build planning
**Owner:** Guillaume
**Date:** July 17, 2026
**Depends on:** Phase 1 cohort model (fully shipped)

---

## Problem Statement

Players currently have no way to discover, evaluate, or enroll in structured programs from CourtPass. Every enrollment happens through a staff member on the admin side, creating unnecessary friction for both staff and players. A player who wants to join Program Coebra Lv1 has to call the venue, wait for a response, and trust that their spot is being held — there is no self-serve path. As programs become a real revenue line for venues like 002, this gap will become a bottleneck.

---

## Goals

1. A player can discover, evaluate, and enroll in a program entirely from CourtPass with no staff involvement
2. Every enrollment is backed by confirmed prepayment, so staff never has to chase payment after the fact
3. An enrolled player can track their session attendance and see what is coming next without contacting the venue
4. Programs feel like a professional, structured product — not an afterthought bolted onto a booking app

---

## Non-Goals

- **Push notifications for upcoming sessions.** Session reminders are Phase 3. Players can see their next session from the Bookings tab.
- **Waitlist promotion logic.** The waitlist table exists in the schema from Phase 1. Recording waitlist interest is in scope here; automatic promotion when a spot opens is Phase 3.
- **Cancellation and refund flows.** Handled manually by staff contacting the player. No in-app cancel button or refund mechanism in this spec.
- **Multi-venue program discovery.** Programs shown are always scoped to the player's current venue. No cross-venue browse.
- **Coach profile deep-link from the program detail.** The coach name is shown but not tappable in this version. Full coach profile is accessible from the Coaches tab.

---

## Navigation Change

**Bottom nav:** Book / Coaches / Bookings / Programs / Profile — five tabs. Profile stays where it is.

Programs is added as a new fifth tab rather than replacing Profile. The credit-pill-in-header idea and moving Profile into a slide-over panel are parked, not adopted, revisit later if five tabs proves crowded in practice.

**Rationale:** Adding a tab is the safer, more reversible move than restructuring where Profile lives. If Programs turns out to need the visibility, the nav can be revisited then with real usage data instead of a guess made before launch.

---

## Screens

### Screen 1 — Programs tab (listing)

**Entry point:** Programs icon in the bottom nav (fifth tab).

**Layout:**
- Header: "Programs" title left, credit count optional in header if it already appears there today, no new header pattern required
- Filter pills below header: All / Beginner / Intermediate / Advanced / Kids / Adults (scroll horizontally, first pill always "All", active pill filled green)
- Program cards in a vertical list, one per Run that has status `upcoming` or `in_progress`

**Program card anatomy:**
- Hero image (from `ProgramPassType.imageUrl`), gradient placeholder if no image set
- Program name (from `ProgramPassType.name`)
- Spots badge top-right: "X spots" in green if available, "Full" in pink/red if at capacity
- Badge row: level (Beginner / Intermediate / Advanced / Pro) + age range + session count
- Coach name and schedule summary (e.g. "Coach Ben Johns · Thu 8am")
- Price right-aligned

**Full programs:** remain visible in the list at reduced opacity with a "Full" badge. Tapping a full program opens its detail page with a "Join waitlist" CTA instead of "Enroll and pay".

**Empty state:** "No programs scheduled right now. Check back soon." — shown when venue has no upcoming or in-progress Runs.

**Acceptance criteria:**
- Filter by level/age filters the visible cards client-side without a new API call
- Cards are ordered by `start_date` ascending (soonest first)
- Full programs render visually distinct (opacity 0.65) but are still tappable
- Image loads from `imageUrl`; if null, the gradient placeholder renders without layout shift

---

### Screen 2 — Program detail

**Entry point:** Tap any program card from the listing.

**Layout:**
- Back button top-left ("Programs")
- Hero image full-width, 140px tall, rounded corners, gradient placeholder if no image
- Program name (large, bold)
- Badge row: level badge (green), age range badge (grey), total duration badge computed as `sessionCount × durationMin` formatted as "X hrs total" (grey)
- Description paragraph
- Skill tag pills (from `ProgramPassType.skillTags`)
- Prerequisites box (amber/warning style) — only rendered if `prerequisites` is non-empty
- Coach name, schedule (days + time + session count), court name — three info rows with icons
- "Course content" section header
- Numbered curriculum list — one row per `ClassInstance`, showing topic (from `ClassInstance.topic`) and date. If topic is null, show the date only with no topic label.
- Capacity bar: "X of Y spots filled" label left, "Z left" right, filled green progress bar
- Price row: price large left, "full program, prepaid" note right
- Primary CTA button (see states below)

**CTA button states:**
- Available: "Enroll and pay" — green, full width
- Full: "Join waitlist" — grey/outline, full width
- Already enrolled: "View my progress" — navigates to Screen 5 (session progress), no payment step

**Acceptance criteria:**
- Curriculum list renders in instance order (sorted by `startAt` ascending)
- If `topic` is null on an instance, that row shows only the date, no placeholder text like "TBD"
- Total duration computes as `sessionCount × durationMin / 60` rounded to nearest 0.5, formatted as "8 hrs total"
- Capacity bar percentage is `enrolledCount / maxCapacity` clamped to 100%
- Back navigation returns to the Programs listing at the same scroll position

---

### Screen 3 — Enroll and pay flow

**Entry point:** "Enroll and pay" CTA on Screen 2.

This is a two-step bottom sheet, not a full-screen navigation.

**Step 1 — Order summary:**
- Program name, coach, schedule, price
- "Confirm and pay" button
- "Cancel" text link dismisses the sheet

**Step 2 — Payment:**
- VietQR code generated for the enrollment amount
- Reference code displayed below the QR
- "Waiting for payment..." status with a pulsing indicator
- Once Sepay webhook confirms: status updates to "Payment confirmed" with a green checkmark, sheet transitions to Step 3 automatically

**Step 3 — Confirmation:**
- Success icon
- "You're enrolled in [Program name]"
- Next session date and topic
- "View my program" button — navigates to Screen 5
- Sheet dismisses and listing refreshes to show the player's enrolled state

**Error states:**
- If the Run fills up between the player opening the detail page and completing payment: "Sorry, this program just filled up. You've been added to the waitlist." — no charge taken
- If the QR expires (5 min timeout): "Payment timed out. Tap to generate a new QR." — retries from the same Step 2 without restarting the flow

**Acceptance criteria:**
- Capacity is checked inside a serializable transaction at the point `enrollInRun` is called, not at QR generation time
- No `ProgramPass` record is created until Sepay confirms payment, so a pending QR does not hold a capacity slot
- The same VietQR pattern used for CourtPay session check-ins is reused here (same reference format, same Sepay webhook handler)

---

### Screen 4 — Join waitlist

**Entry point:** "Join waitlist" CTA on Screen 2 (full program).

Single-step bottom sheet:
- Program name + "This program is full"
- "We'll notify you if a spot opens"
- "Join waitlist" confirm button
- On confirm: writes a `program_run_waitlist` row with status `waiting`, shows "You're on the waitlist" confirmation and closes the sheet

**Acceptance criteria:**
- A player already on the waitlist sees "You're on the waitlist" instead of "Join waitlist" on Screen 2 — no double-entry possible
- Joining the waitlist does not trigger any payment or capacity change

---

### Screen 5 — Session progress (enrolled player view)

**Entry point:** Tap an enrolled program card in Bookings tab, or "View my program" from enrollment confirmation.

**Layout:**
- Back button top-left ("My Bookings")
- Program name (large, bold)
- Sub-line: coach, court, schedule summary
- Progress label: "X of Y sessions" + percentage right-aligned
- Progress bar (green fill)
- Session timeline list — one row per ClassInstance, ordered by date ascending, three visual states:
  - **Attended** (green filled circle with checkmark): `ClassCheckIn` exists for this player + instance
  - **Next** (white circle with green border, highlighted card): first instance with no check-in and `startAt` in the future
  - **Future** (light grey circle): all remaining instances after "next"
- Each row shows: topic (if set), date, and status label (Attended / Next session / no label for future)

**Acceptance criteria:**
- "Next session" is always the first future instance with no check-in, not just the next instance by date (handles rescheduled or skipped sessions correctly)
- If all instances have check-ins, no "next" state renders; the progress bar shows 100% and a "Program complete" note appears below the list
- Scroll position persists if the player navigates away and returns within the same session

---

### Screen 6 — Account panel (parked, not in scope)

Originally specced as a slide-over triggered from a header avatar. Since Profile stays as its own bottom nav tab, this screen isn't needed, the existing Profile tab (My Account) already covers this. Left here only as reference in case the nav gets revisited later.

---

## API Surface Needed (new endpoints only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/courtpass/program-runs?venueId=` | List upcoming/in-progress Runs with enrollment count, pass type details, instances |
| `GET` | `/api/courtpass/program-runs/[id]` | Single Run detail with full instance list including topics |
| `POST` | `/api/courtpass/program-runs/[id]/enroll` | Create enrollment + initiate payment (calls `enrollInRun`, returns VietQR payload) |
| `GET` | `/api/courtpass/program-runs/[id]/enrollment` | Current player's enrollment status + check-in history for session progress screen |
| `POST` | `/api/courtpass/program-runs/[id]/waitlist` | Join waitlist (writes to `program_run_waitlist`) |
| `GET` | `/api/courtpass/program-runs/[id]/waitlist/status` | Whether current player is already on the waitlist |

All routes: authenticated with the existing CourtPass player JWT. No superadmin or staff auth required.

---

## Confirmed Codebase Facts (from Phase 1 investigation and build)

- VietQR generation, Sepay webhook matching, and payment confirmation already exist in `src/modules/courtpay/lib/` — reuse these exactly, do not rebuild
- `enrollInRun` in `src/lib/program-run.ts` handles capacity checking and `ProgramPass` creation inside a serializable transaction — call it from the new enroll API route, do not duplicate the logic
- `program_run_waitlist` table exists in the schema from the Phase 1 migration, schema-only, no promotion logic — this spec only adds the write (join) and read (status check) operations
- CourtPass player auth uses a custom JWT separate from the staff/admin auth — new routes must use the player auth middleware, not `requireSuperAdmin`
- Sepay webhook fires on the same `noreply_bookings@thecourtflow.com` / Sepay endpoint as CourtPay session payments — the payment reference format for program enrollment needs to be distinct from session references (e.g. `CF-PRG-XXXXXX` vs existing `CF-SES-XXXXXX`) so the webhook handler can route correctly

---

## Decisions

- No capacity slot is held at QR generation time. The slot is only confirmed once Sepay webhook fires and `enrollInRun` writes the `ProgramPass`. If a Run fills between QR generation and payment, the player is moved to the waitlist with no charge.
- Full programs remain visible in the listing, not hidden. They show a "Full" badge and open to a detail page with a "Join waitlist" CTA.
- Profile stays as its own bottom nav tab, unchanged. Programs is added as a fifth tab. The header-avatar/credit-pill approach is parked for a later revisit, not built now.
- Course content rows show the date only if `topic` is null — no "TBD" placeholder, no empty row.
- Cancellation and refunds are out of scope. Staff handles these manually.

---

## Open Questions

- **[Engineering]** The existing `enrollInRun` creates a `ProgramPassPayment` record immediately on enrollment. For the CourtPass flow, payment has not happened yet when `enrollInRun` is first called — should the payment record be created in `UNPAID` status and updated to `PAID` on Sepay webhook confirm, or should `enrollInRun` be called only after the webhook fires? The second approach is cleaner but means the capacity slot is not reserved during the payment window. Confirm preferred approach before building the enroll route.
- **[Guillaume]** Should the CourtPass program listing show programs from all Pass Types at the venue, or only Pass Types that have at least one active Run with upcoming/in-progress status? (Recommendation: the latter — no point showing a Pass Type with no schedulable runs.)
- **[Guillaume]** When an enrolled player opens the Programs listing, should their enrolled program card show a different state (e.g. "Enrolled" badge instead of spots remaining), or is the enrolled state only visible from the Bookings tab?
- **[Guillaume]** Five tabs is more than the current four. Worth a quick check that the bottom nav still fits comfortably on smaller phone widths before this ships, rather than finding out after build.

---

## Timeline

- Phase 2 (this spec) depends on Phase 1 being fully stable and tested at 002 before build starts
- No hard external deadline, but enrolling players into Program Coebra Lv1 without staff intervention is the unlock
- Suggested build order: API routes first (can be tested with Postman), then Programs tab listing, then detail + enroll flow, then session progress, then nav restructure last (most visible change, easiest to validate in isolation)
