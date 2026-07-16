# Program Passes: Cohort Model

**Status:** Draft for review
**Owner:** Guillaume
**Date:** July 16, 2026

---

## Problem Statement

Program Passes today is an admin-only credit system. Staff can activate a pass and check players into classes, but there is no way to actually schedule a cohort's calendar, the scheduled classes never touch the court booking grid, and none of it is visible or purchasable from CourtPass. A program like "Program Coebra Lv1", 16 classes over 90 days with a fixed group of players, cannot currently be run end to end without manual database work. This blocks selling structured, professional-looking programs to venues like 002 Pickleball Club and makes the feature invisible to the player side of the product entirely.

## Goals

- Staff or a coach can generate a cohort's full class schedule in one action, and every class occupies a real court slot on the booking grid
- A program's description, image, dates, coach, and remaining spots are visible in CourtPass, and a player can enroll directly
- Enrollment is capped at the cohort level, not just per individual class instance
- The data model supports a waitlist without further schema rework when that gets built

## Non-Goals

- **Full waitlist implementation.** This spec adds the capacity check and the hook point. Actual waitlist queue and promotion logic is a separate build, already planned as a Phase 2 item on the roadmap.
- **Flexible, punch-card style passes.** The existing session-credit model (redeem anytime within a window) already works and stays as-is for programs that don't need fixed dates.
- **Membership discount perks (pay X, get Y% off bookings and lessons).** Structurally unrelated to Program Passes, needs its own spec, likely building on the promo code engine's discount type structure.
- **A separate per-class attendance model.** `sessionsUsed` plus the existing check-in log already cover this. Not adding a new attended/no-show/excused status field.
- **Automated makeup classes for no-shows.** Rescheduling a missed class for one player is a manual staff action for now.
- **Renaming the class_pass / ClassInstance database objects.** Flagged as tech debt in the investigation, worth doing, but not blocking this feature and safer as its own isolated migration.

## User Stories

- As a staff member, I want to set a start date, court, coach, and weekly time slot for a program so that all 16 class dates get created and blocked on the court calendar automatically
- As a staff member, I want to raise a program's capacity if it's more popular than expected so that I can enroll more players without recreating the whole program
- As a staff member, I want to reschedule a single class date or swap the coach on one session so that I can handle a coach being sick without touching the other 15 dates
- As a staff member, I want to see how many spots are left in a cohort before I sell it so that I don't overbook a program
- As a player browsing CourtPass, I want to see a program's description, photo, coach, and schedule before I buy so that I understand what I'm signing up for
- As a player, I want to enroll and pay for a specific program run from CourtPass so that I don't have to visit the venue to sign up
- As a coach, I want the court booking grid to show I'm running a program so that I don't get booked for a private lesson at the same time
- As an admin, I want a program run to show as full once capacity is hit so that CourtPass stops selling it automatically

## Requirements

### Must-Have (P0)

**1. Program Run as a new layer above Pass Type**
- New entity representing one instance of a program: start date, court, one or more coaches, capacity, enrolled count, status (upcoming / in progress / completed / cancelled)
- A Pass Type can have multiple Runs over time
- Capacity and assigned coach(es) are editable after the Run is created, not fixed at creation
- Acceptance: creating a Run does not modify or duplicate the Pass Type; a Pass Type with zero Runs is still a valid draft product

**2. Cohort scheduling generates real class instances**
- Staff/coach defines a recurrence (day of week, time, duration, number of occurrences or end date) and the system creates all class occurrence rows in one action
- Each occurrence inherits the Run's coach(es) and court by default
- Acceptance: creating a Run with 16 weekly occurrences produces exactly 16 occurrence rows with correct dates

**3. Class instances are CourtBlocks tagged to the program**
- Reuse the existing `CourtBlock` model rather than building a parallel blocking system. Staff/manager schedules program classes the same way they'd block a court today, on the existing booking grid
- Add a program reference (e.g. `programRunId`) and a coach field to `CourtBlock` so each generated class occupies the court like any other block
- Because a coach is attached to the block, that coach becomes unavailable for private lesson bookings during that slot. Coach availability and conflict checks need to include these program `CourtBlock`s, not just `coach_availabilities` windows
- Acceptance: attempting to book a private lesson with a coach who's assigned to a program block during that time shows staff a clear conflict warning but does not hard-block the booking, staff can proceed if they choose to. Attempting to double-book the court itself is still rejected the same way a normal court conflict is rejected

**4. Cohort-level capacity, adjustable after creation**
- `maxCapacity` lives on the Run, not on individual class instances, and can be raised or lowered after creation (e.g. 12 to 14 if the program is popular)
- Acceptance: raising capacity immediately allows further enrollment up to the new number; lowering capacity below the current enrolled count is rejected with a clear error rather than silently dropping enrolled players

**5. Class date and coach editability**
- Individual class dates within a Run can be rescheduled without affecting the other occurrences
- Coach(es) on a Run or on a single class instance can be changed, including assigning a second coach to a session that needs extra coverage
- Acceptance: rescheduling or changing the coach on one instance does not alter the other 15 dates in the Run

**6. Description and image on Pass Type**
- Add `description` (long text) and `imageUrl` fields to `ProgramPassType`
- Acceptance: both fields are optional, editable from the existing New/Edit Pass Type modal, and persist correctly

### Nice-to-Have (P1)

**7. CourtPass program listing and enrollment**
- Player-facing page listing active Program Runs at a venue: name, description, image, coach, schedule, price, spots remaining
- Enrollment requires full prepayment to confirm the spot, no partial or deferred payment for CourtPass-originated enrollments
- Acceptance: an unpaid enrollment attempt does not reserve a capacity slot; the slot is only held once payment is confirmed. A confirmed enrollment produces the same `ProgramPass` record and payment flow as an admin-activated one, so admin reporting doesn't fork into two systems

**8. Waitlist hook**
- When a Run is at capacity, expose a "join waitlist" action that records interest, even if full promotion logic isn't built yet
- Acceptance: waitlist entries are stored and queryable, satisfying the existing `CLASS_FULL` hook point noted in `program-pass.ts`, and are ready to be surfaced first when capacity is later raised

### Future Considerations (P2)

- Waitlist auto-promotion when capacity is raised or a spot opens from a cancellation
- Recurring Runs that auto-renew into a new cohort when one ends
- Program-level analytics (fill rate, coach utilization) surfaced on the CEO dashboard

## Decisions

- Capacity lives on the Run and is mutable, not fixed at creation. It can be raised if a program proves popular, pulling from the waitlist once that exists.
- `ClassInstance` blocking reuses the existing `CourtBlock` model directly, tagged with a program reference, rather than a parallel system. Staff/manager schedules program classes on the current booking grid like any other block.
- `sessionsUsed` stays as the tracking mechanism. No separate attendance status model needed.
- No enrollments exist yet on Program Coebra Lv1, this is greenfield, no coordination with Connor needed before shipping the schema change.
- CourtPass enrollment requires full prepayment to confirm a spot.
- A coach conflict with a program block warns staff rather than hard-blocking the lesson booking attempt. Staff can see the conflict and decide.
- Refunds or credits for rescheduled or cancelled class dates are handled manually by staff contacting the affected player. No automated refund flow in this spec.

## Open Questions

None outstanding. Ready to move to build planning.

## Confirmed Codebase Facts (from investigation, do not re-derive these)

- `CourtBlock` (`court_blocks`) has no coach field of any kind today, and no bulk/recurring creation, every block is created one at a time via `POST /api/admin/court-blocks`. `CourtBlockType` is a real Postgres enum with six values today (`private_competition`, `private_event`, `maintenance`, `open_play`, `competition`, `alobo`); a `program` value needs to be added the same way `alobo` was added, `ALTER TYPE ... ADD VALUE IF NOT EXISTS` inside a `DO $$` guard.
- All six existing `CourtBlockType` values block a court cell uniformly in `getAvailableSlots()` (`src/lib/booking.ts` ~609-723), a `program` type should follow the same path with no special-casing needed for availability.
- The only multi-coach pattern anywhere in the schema is `program_pass_type_coaches` (pass type to many coaches). Every other coach reference in the codebase (`CoachLesson.coachId`, `ClassInstance.coachId`, `ProgramPassType.linkedCoachId`) is a single nullable/non-nullable FK. New multi-coach needs (Run-level default coaches, per-block coaches) should follow the `program_pass_type_coaches` join-table shape rather than inventing a new pattern.
- Coach conflict checking today is `isCoachAvailable()` in `src/lib/coach-availability.ts`, four layers (schedule window, holiday, lesson conflict, Google Calendar), all hard-fail with no override path. It's called from player-facing `createCoachLesson()` (`src/lib/coach-lesson.ts`, hard 409) and from the AI chat coach finder. The admin coach-lesson route (`src/app/api/admin/coach-lessons/route.ts`) does **not** call `isCoachAvailable()` at all, it only checks for an existing confirmed/completed lesson at the same time, also a hard 409.
- There is no non-blocking "warning" UI pattern anywhere in the admin panel today. Every existing conflict becomes either a hard API rejection or an unavailable grid cell. The soft-warning behavior this spec asks for (requirement 3) is new UX, not a reuse of something that exists.
- `ProgramPassType` fields today: `id, venueId, name, price, sessionsIncluded, cycleLengthDays, linkedCoachId, isActive, passMode, isOneTime`. No `description`, `imageUrl`, start/end date, or capacity field exists.
- `ProgramPass` (`class_passes`) links only to `passTypeId` today, not to any specific run, that link needs to be added since a Pass Type can have multiple Runs.
- Recent migrations (see `20260713032737_program_pass_mode.sql`) use plain `TEXT` columns with an allowed-values comment instead of new Postgres enum types for simple status fields, follow that convention for Run status rather than creating a new enum type.
- Module isolation reference is `src/modules/courtpay/`: `types.ts` at the root (pure interfaces, no Prisma/Next.js imports) plus `lib/` (plain async functions) and `components/` (`"use client"` only). No `hooks/` folder actually exists despite earlier assumption, and there's no barrel `index.ts`, consumers import files directly. A new `src/modules/program-runs/` should mirror this exact shape.

## Assumptions Flagged for Confirmation

- The non-blocking coach conflict warning (requirement 3) applies only to staff/admin-initiated lesson booking. Player self-service booking through CourtPass keeps the existing hard-reject behavior, since there's no staff member present to make the override judgment call.

## Timeline Considerations

- Suggested phasing: P0 items (1 through 6) as Phase 1, shippable independently and immediately useful for admin-run cohort setup even before CourtPass is touched
- P1 items (7 and 8) as Phase 2, dependent on Phase 1's Run and capacity model being stable, and on an answer to the refund/reschedule open question above
- No hard external deadline, but Phase 1 unblocks properly running Program Coebra Lv1 as an actual scheduled cohort rather than an ad hoc credit pass
