# CourtFlow — Program Passes: Complete Technical & Product Analysis

**Date:** July 16, 2026  
**Purpose:** Full Program Pass system snapshot for product and technical analysis. Covers current state, data model, API surface, UI, domain logic, business rules, and known gaps.

> **Scope clarification:** Program Passes and Memberships are separate CourtFlow products with separate database tables, APIs, payment records, and business logic. This document covers only `/admin/program-passes`. The venue subscription system at `/admin/memberships` is documented separately in [`membership-system-analysis.md`](membership-system-analysis.md).

---

## 1. What Is This Feature?

**Program Passes** is CourtFlow's class-credit and structured-program system. It is designed for coaching programs and scheduled cohorts, not for general venue membership.

It supports two related Program Pass modes that share the same underlying data model:

1. **Class-credit Pass** — a player receives N check-ins during a configured cycle (monthly, fixed-duration, or custom dates). Staff activates the pass and checks the player into eligible class instances.

2. **Cohort / Program Run** — a structured program with fixed class dates, one or more courts, coaches, and a cohort enrollment cap. A Program Run is one scheduled cohort of a Pass Type (for example, “Cobra Lv1 — July 2026”). Its generated classes block the court calendar and participate in coach-conflict checks.

Both modes are managed from `/admin/program-passes` and share `ProgramPassType`, `ProgramPass`, and `ClassInstance`. They do not use `MembershipTier`, `Membership`, or `MembershipPayment`.

---

## 2. Database Schema

### 2.1 Entity Overview

```
ProgramPassType (program_pass_types)
  └── has many ProgramRun (program_runs)            ← NEW — Phase 1
  └── has many ClassInstance (class_instances)
  └── has many ProgramPass (class_passes)
  └── has many ProgramPassTypeCoach (program_pass_type_coaches)

ProgramRun (program_runs)                            ← NEW — Phase 1
  └── has many ClassInstance
  └── has many ProgramPass (enrollments)
  └── has many ProgramRunCoach (program_run_coaches)
  └── has many ProgramRunWaitlistEntry (program_run_waitlist)  ← schema only
  └── has many CourtBlock (via program_run_id FK)

CourtBlock (court_blocks)
  └── has many CourtBlockCoach (program_run_court_block_coaches)  ← NEW
  └── has many ClassInstance (via court_block_id)

ClassInstance (class_instances)
  └── has many ClassCheckIn (class_check_ins)
  └── belongs to CourtBlock                          ← NEW — Phase 1
  └── belongs to ProgramRun                          ← NEW — Phase 1

ProgramPass (class_passes)
  └── has many ClassCheckIn
  └── has many ProgramPassPayment (class_pass_payments)
  └── belongs to ProgramRun (optional)               ← NEW — Phase 1

ClassCheckIn (class_check_ins)
  └── unique(programPassId, classInstanceId)
```

### 2.2 Table Details

#### `program_pass_types`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `venue_id` | TEXT | FK → venues |
| `name` | TEXT | e.g. "Cobra Lv1 — Bronze Package" |
| `price` | INT | In VND (Vietnamese Dong) |
| `sessions_included` | INT | Default 12 |
| `cycle_length_days` | INT | Legacy/informational, 30 default |
| `linked_coach_id` | TEXT? | Nullable FK → staff_members (legacy single-coach field) |
| `is_active` | BOOL | Soft delete flag |
| `pass_mode` | TEXT | Enum-like: `monthly`, `days_30`, `days_45`, `days_60`, `days_90`, `custom` |
| `is_one_time` | BOOL | If true, pass does not renew |
| `description` | TEXT? | NEW — long-form program description |
| `image_url` | TEXT? | NEW — path to WebP image served from `/uploads/program-passes/` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `(venue_id, is_active)`, `(linked_coach_id)`

#### `program_runs` ← NEW Phase 1

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (uuid) | PK |
| `pass_type_id` | TEXT | FK → program_pass_types |
| `venue_id` | TEXT | FK → venues |
| `name` | TEXT | Human name for this cohort run |
| `status` | TEXT | `upcoming` / `in_progress` / `completed` / `cancelled` |
| `start_date` | DATE | Calendar date of first class (local date, stored as DATE) |
| `recurrence_start_hour` | INT | Hour of day (local) the class starts, e.g. 8 = 8:00 AM |
| `recurrence_duration_min` | INT | Duration in minutes, e.g. 90 |
| `recurrence_count` | INT? | Total number of occurrences (mutually exclusive with recurrence_end_date) |
| `recurrence_end_date` | DATE? | Last possible date (alternative to count) |
| `max_capacity` | INT | Enrollment cap, default 20 |
| `court_id` | TEXT? | FK → courts, nullable |
| `note` | TEXT? | Staff notes |
| `created_by` | TEXT? | Staff member ID |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Key design decision:** Day-of-week is **not stored** — it's derived at runtime from `start_date` via `new Date(startDate + 'T12:00:00+07:00').getDay()`. All classes repeat weekly on the same day.

**Indexes:** `(pass_type_id)`, `(venue_id, status)`

#### `class_passes` (model name: ProgramPass)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `player_id` | TEXT | FK → players |
| `venue_id` | TEXT | FK → venues |
| `pass_type_id` | TEXT | FK → program_pass_types |
| `program_run_id` | TEXT? | FK → program_runs — NEW, links pass to a cohort |
| `status` | ENUM | `active`, `paused`, `expired`, `cancelled` |
| `activated_at` | TIMESTAMPTZ | When staff activated it |
| `deferred_start_date` | TIMESTAMPTZ? | Resume date when paused |
| `cycle_start` | TIMESTAMPTZ | Start of current billing cycle |
| `cycle_end` | TIMESTAMPTZ | End of current billing cycle |
| `sessions_used` | INT | Count of check-ins this cycle |

**Indexes:** `(player_id, venue_id)`, `(pass_type_id)`, `(venue_id, status)`, `(program_run_id)`

#### `class_instances` (model name: ClassInstance)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `venue_id` | TEXT | FK → venues |
| `coach_id` | TEXT | FK → staff_members (required — first run coach or created_by) |
| `pass_type_id` | TEXT | FK → program_pass_types |
| `program_run_id` | TEXT? | FK → program_runs — NEW |
| `court_block_id` | TEXT? | FK → court_blocks — NEW, replaces old `court_id` |
| `start_at` | TIMESTAMPTZ | Class start (local time) |
| `end_at` | TIMESTAMPTZ | Class end |
| `max_players` | INT | Capacity |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Legacy note:** `court_id` column was dropped in Phase 1 migration. Court info is now accessed via `courtBlock.courtIds[]`.

#### `class_check_ins` (model name: ClassCheckIn)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `class_pass_id` | TEXT | FK → class_passes |
| `class_instance_id` | TEXT | FK → class_instances |
| `checked_in_at` | TIMESTAMPTZ | Default now() |

**Unique constraint:** `(class_pass_id, class_instance_id)` — prevents double check-in at DB level.

#### `class_pass_payments` (model name: ProgramPassPayment)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `class_pass_id` | TEXT | FK → class_passes |
| `period_start` | TIMESTAMPTZ | |
| `period_end` | TIMESTAMPTZ | |
| `amount_value` | INT | VND |
| `status` | ENUM | `PAID`, `UNPAID`, `VOID` |
| `payment_method` | TEXT? | `cash`, `bank_transfer`, `other` |
| `paid_at` | TIMESTAMPTZ? | |
| `proof_url` | TEXT? | Uploaded payment proof |
| `note` | TEXT? | Free text (used for free/comp passes) |
| `void_reason` | TEXT? | |

#### `program_pass_type_coaches` — Many-to-many: PassType ↔ Coach

| Column | Type |
|---|---|
| `id` | TEXT (uuid) |
| `pass_type_id` | TEXT |
| `coach_id` | TEXT |
| `created_at` | TIMESTAMPTZ |

**Unique:** `(pass_type_id, coach_id)`

#### `program_run_coaches` — Many-to-many: ProgramRun ↔ Coach (default run coaches)

| Column | Type |
|---|---|
| `run_id` | TEXT PK part |
| `coach_id` | TEXT PK part |

Composite PK `(run_id, coach_id)`. These are the **default coaches** for a run, automatically copied to `program_run_court_block_coaches` when the schedule is generated.

#### `program_run_court_block_coaches` — Many-to-many: CourtBlock ↔ Coach

| Column | Type |
|---|---|
| `court_block_id` | TEXT PK part |
| `coach_id` | TEXT PK part |

**Single source of truth** for coach-to-block assignment. Coach conflict detection queries this table.

#### `program_run_waitlist` — Schema-only, Phase 2

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `run_id` | TEXT | FK → program_runs |
| `player_id` | TEXT | FK → players |
| `status` | TEXT | Default `waiting` |
| `promoted_at` | TIMESTAMPTZ? | |
| `note` | TEXT? | |

**Unique:** `(run_id, player_id)`. Table exists but no promotion logic is implemented yet.

#### `court_blocks` — Extended with Phase 1 columns

| New Column | Type | Notes |
|---|---|---|
| `program_run_id` | TEXT? | FK → program_runs ON DELETE SET NULL |

`CourtBlockType` enum extended with `program_class` value. All 7 values block a court cell uniformly in the availability check (`getAvailableSlots()` in `src/lib/booking.ts`) — no special-casing needed.

---

## 3. Pass Modes

| Mode | Description | Cycle Calculation |
|---|---|---|
| `monthly` | Calendar-month billing. Cycle aligns to 1st of month. | `cycleEnd` = last ms of same calendar month |
| `days_30` | Rolling 30-day window from activation. | `cycleStart + 30 days - 1` at 23:59:59 |
| `days_45` | Rolling 45 days. | Same pattern |
| `days_60` | Rolling 60 days. | Same pattern |
| `days_90` | Rolling 90 days. | Same pattern |
| `custom` | Staff picks exact start and end dates at activation. | Caller provides explicit `cycleEnd` |

Cycle computation lives in `src/lib/program-pass.ts → computeCycleEnd()`. Always uses local-time methods (never UTC) per venue timezone rules.

---

## 4. Pass Statuses

| Status | Meaning | Transitions |
|---|---|---|
| `active` | Pass is usable. Check-in allowed. | → paused, → cancelled |
| `paused` | Temporarily frozen. `deferredStartDate` set. | → active (resume), → cancelled |
| `expired` | Cycle end has passed. No further check-ins. | Terminal |
| `cancelled` | Manually cancelled by staff. | Terminal |

---

## 5. Program Run Statuses

| Status | Meaning |
|---|---|
| `upcoming` | Future cohort, not started. Enrollment is open. |
| `in_progress` | Currently running (manual status change by staff today — no auto-transition yet). |
| `completed` | All classes delivered. |
| `cancelled` | Run cancelled. Enrolled players' passes are freed (no automated refund). |

Status transitions are manual today. Auto-transition based on class dates is a Phase 2 item.

---

## 6. API Routes

### Program Pass Types

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/program-passes/types?venueId=` | SuperAdmin | List all active pass types for a venue, with coach associations and active pass count |
| `POST` | `/api/admin/program-passes/types` | SuperAdmin | Create new pass type. Body: `{venueId, name, price, sessionsIncluded, passMode, isOneTime, description?, coachIds[]}` |
| `PATCH` | `/api/admin/program-passes/types/[id]` | SuperAdmin | Update name, price, sessions, passMode, isOneTime, description, coachIds (full replace) |
| `DELETE` | `/api/admin/program-passes/types/[id]` | SuperAdmin | Soft-delete (sets `isActive = false`). Blocks if any active passes exist. |
| `POST` | `/api/admin/program-passes/types/[id]/image` | SuperAdmin | Upload program image (PNG/JPEG/WebP, max 5 MB). Resizes to 800×800 inside, converts to WebP via `sharp`. Stores at `/uploads/program-passes/{id}.webp`. |

### Program Passes (Subscriptions / Enrollments)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/program-passes?venueId=&passTypeId=&status=` | SuperAdmin | List passes with player, passType, latest payment. Returns KPI block (monthly collected, unpaid count, overdue count). |
| `POST` | `/api/admin/program-passes/activate` | SuperAdmin | Activate a new pass for a player. Body: `{playerId, venueId, passTypeId, cycleStart, cycleEnd?, paymentMethod?, amountValue?, isFree?, note?}` |
| `PATCH` | `/api/admin/program-passes/[id]` | SuperAdmin | Update pass status: pause (with `deferredStartDate`), resume (clear deferral), cancel |
| `DELETE` | `/api/admin/program-passes/[id]` | SuperAdmin | Hard delete pass + cascade check-ins + payments |
| `POST` | `/api/admin/program-passes/check-in` | SuperAdmin | Check player into a class instance. Body: `{programPassId, classInstanceId}`. Runs in serializable transaction. |
| `GET` | `/api/admin/program-passes/class-instances?venueId=&date=YYYY-MM-DD` | SuperAdmin | List class instances at a venue on a given date (for check-in modal) |

### Program Runs ← NEW Phase 1

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/program-runs?venueId=&passTypeId=` | SuperAdmin | List runs with pass type, court, coaches, enrollment and instance counts |
| `POST` | `/api/admin/program-runs` | SuperAdmin | Create a run (no schedule generated yet). Body: `{venueId, passTypeId, name, startDate, recurrenceStartHour, recurrenceDurationMin, recurrenceCount?, recurrenceEndDate?, maxCapacity, courtId?, note?, coachIds[]}` |
| `PATCH` | `/api/admin/program-runs/[id]` | SuperAdmin | Edit name, status, maxCapacity (enforces enrolled guard), note, coachIds |
| `POST` | `/api/admin/program-runs/[id]/generate` | SuperAdmin | Generate CourtBlocks + ClassInstances for the run. Idempotent guard: returns 409 if schedule already exists. |
| `GET` | `/api/admin/program-runs/[id]/instances` | SuperAdmin | List all ClassInstances for a run, including CourtBlock date/time and per-block coaches |
| `PATCH` | `/api/admin/program-runs/[id]/instances/[instanceId]` | SuperAdmin | Reschedule a single instance (does not affect siblings) |

---

## 7. Domain Logic (`src/lib/program-run.ts`)

### `generateRunSchedule(runId, tx?)`

Generates all `CourtBlock` + `ClassInstance` rows for a run in a single serializable transaction.

**Algorithm:**
1. Load run + coaches from DB.
2. **Idempotency check:** if any `ClassInstance` already exists for this run, return the existing count/blockIds without creating duplicates.
3. Parse `start_date` as a local-midnight Date using `T00:00:00+07:00`.
4. Loop until `recurrenceCount` is reached OR `currentDate > recurrenceEndDate`:
   - Compute start/end timestamps using `setHours(recurrenceStartHour, …)` (local, not UTC).
   - Create one `CourtBlock` of type `program_class`, with `programRunId`, `courtIds`, `date` (noon-local for Prisma DATE safety), `startTime`, `endTime`.
   - Copy run-level coaches → `CourtBlockCoach` rows for that block.
   - Create one `ClassInstance` linked to the CourtBlock.
   - Advance `currentDate` by 7 days via `setDate(getDate() + 7)`.
5. Return `{ instanceCount, blockIds }`.

**Timezone rules strictly followed:**
- Date arithmetic: `setDate(getDate() + n)` (local)
- Hour arithmetic: `setHours(h, m, 0, 0)` (local)
- Prisma DATE writes: `new Date('YYYY-MM-DDT12:00:00+07:00')` (noon local to avoid UTC midnight drift)

### `checkProgramBlockConflict(coachId, date, startTime, endTime)`

Soft conflict check: does a coach have a `program_class` CourtBlock overlapping the given window?

- Queries `court_blocks WHERE type='program_class' AND date=date AND startTime<endTime AND endTime>startTime` joined to `program_run_court_block_coaches WHERE coach_id=coachId`.
- Returns `{ hasConflict: boolean, blockInfo? }` — **does NOT throw / reject**.
- Called from the admin coach-lesson API route. If a conflict exists, a `{ warning: { code: "COACH_PROGRAM_CONFLICT", blockInfo } }` is appended to the 201 response. Staff sees a yellow banner but the lesson is still created.

### `enrollInRun(params)`

Enrolls a player in a ProgramRun. Serializable transaction:
1. Load run — validate status is `upcoming` or `in_progress`.
2. Live COUNT of current enrollments (never stored counter).
3. Reject if `enrolledCount >= maxCapacity` → `ProgramRunError("RUN_FULL")`.
4. Dedup check — reject if player already enrolled → `ALREADY_ENROLLED`.
5. Create `ProgramPass` with `programRunId`.
6. Create `ProgramPassPayment` if `amountValue > 0`.

### `updateRunCapacity(runId, newMax)`

Rejects (typed error `CAPACITY_BELOW_ENROLLED`) if `newMax < live enrolled count`. Otherwise updates `program_runs.max_capacity`.

### `rescheduleInstance(instanceId, newDateKey, newStartTime, newEndTime)`

Updates both `ClassInstance` (timestamps) and its linked `CourtBlock` (date + timestamps) atomically. No effect on sibling instances in the same run.

---

## 8. Domain Logic (`src/lib/program-pass.ts`)

### `checkInToClassInstance(programPassId, classInstanceId)`

Full serializable transaction with 6 sequential checks before creating a check-in:

1. Load pass — throw `PASS_NOT_FOUND` if missing.
2. Verify `pass.status === 'active'` — throw `PASS_NOT_ACTIVE` if paused/expired/cancelled.
3. Verify `sessionsUsed < sessionsIncluded` — throw `SESSIONS_EXHAUSTED` if capped.
4. Load class instance — throw `INSTANCE_NOT_FOUND` if missing.
5. Count existing check-ins — throw `CLASS_FULL` if `checkedInCount >= maxPlayers` (Phase 2 waitlist hook point).
6. Dedup check — `findUnique` on `(programPassId, classInstanceId)` — throw `ALREADY_CHECKED_IN` if exists.
7. Create `ClassCheckIn` row.
8. Increment `ProgramPass.sessionsUsed`.

**Retry logic:** On `P2034` (serialization failure), retries once. Second failure → `TRANSACTION_CONFLICT` (409). On `P2002` (unique constraint violation from race) → maps to `ALREADY_CHECKED_IN`.

### `computeCycleEnd(cycleStart, passMode)`

Pure function. Calculates cycle end using local-time methods only:
- `monthly`: last millisecond of the same calendar month.
- `days_N`: cycleStart + N days - 1, at 23:59:59.999.

---

## 9. KPI Calculations

The pass list endpoint returns a `kpi` block computed per-request:

| KPI | Query |
|---|---|
| `collected` | SUM of `class_pass_payments.amount_value WHERE status='PAID' AND paid_at` in current calendar month |
| `unpaidCount` | COUNT of UNPAID payments where `period_end >= now` (not yet overdue) |
| `overdueCount` | COUNT of UNPAID payments where `period_end < now` AND pass type is NOT one-time |

One-time passes are excluded from overdue count because an expired one-time pass is not an actionable financial item.

---

## 10. Admin UI (`src/app/(admin)/admin/program-passes/page.tsx`)

### Tab Structure

The page has **3 tabs**:

#### Tab 1: Program Passes

The main member roster. Shows all active/paused/expired/cancelled passes.

**KPI row:** 3 stat cards — Collected this month (green), Unpaid count (amber), Overdue count (red).

**Filters:** Pass Type dropdown, Status dropdown.

**Table columns:** Player, Pass Type, Status badge, Usage (X/N sessions, amber if capped), Cycle ends, Actions.

**Actions per row (context-sensitive):**
- Active + not capped → Check-in icon, Pause icon, Delete icon
- Active + capped → Lock icon (no check-in available)
- Paused → Resume icon, Cancel icon
- Expired/Cancelled → No actions

**Activate button** → triggers ActivateModal (2-step wizard).

#### Tab 2: Pass Types

Card grid showing all active pass types for the selected venue.

**Card contents:**
- Image thumbnail (if `imageUrl` set)
- Name
- Price (formatted VND) + pass mode label (`/mo`, `/30 days`, etc.)
- Session count badge, pass mode badge, one-time badge
- Coach name tags
- Description excerpt (2-line clamp)
- Active pass count
- Edit (pencil) → PassTypeFormModal, Delete (trash) → soft-delete after confirmation

**Add Pass Type button** → PassTypeFormModal for creation.

#### Tab 3: Program Runs ← NEW Phase 1

Currently shows Run cards with: name, passType badge, status badge, capacity gauge, date range, coaches, court.

**Actions:**
- "Generate Schedule" (only if `instanceCount === 0`) → POST `.../generate`
- "Edit" → Edit Run modal (name, capacity, coaches, status)
- Expand row → shows instance list with date, time, coaches, check-in count, Reschedule

**Create Run modal** (2-step):
- Step 1: PassType, name, court, capacity, coaches
- Step 2: recurrence config (hour, duration, count or end date), date preview

**Note:** The Program Runs tab UI is listed as `in_progress` in the build plan — the backend is fully functional but some UI elements may still be incomplete.

---

## 11. Modals

### PassTypeFormModal

Full CRUD for a pass type. Fields:
- Name (text)
- Duration/mode (select: monthly / 30d / 45d / 60d / 90d / custom)
- Price (VND, formatted number input)
- Sessions included (number)
- One-time checkbox
- Description (textarea, optional)
- Image picker (PNG/JPEG/WebP, uploaded via POST `/image`, converted to WebP 800×800 via sharp)
- Coaches (multi-select checkboxes)

### ActivateModal (2-step wizard)

**Step 1: Player search** — debounced search (300ms) against `GET /api/admin/players?search=`. Shows avatar/name/phone. Player must be selected before proceeding.

**Step 2: Pass details:**
- Pass Type selector (shows price + mode)
- Cycle start (month picker for `monthly` mode, date picker for `days_N`, date pair for `custom`)
- Free/complimentary checkbox (skips payment record)
- Payment method (Cash / Bank Transfer / Other) if not free
- Free reason note if complimentary

On submit: `POST /api/admin/program-passes/activate`.

### CheckInModal

Loads today's class instances for the venue (`GET /api/admin/program-passes/class-instances?date=today`). Displays clickable session cards (pass type, time, coach, current check-in count). On confirm: `POST /api/admin/program-passes/check-in`.

### PauseModal

Staff picks a resume date (default: 1st of next month). PATCH with `{ status: "paused", deferredStartDate }`.

### DeletePassModal

Double-confirmation (2-step) before hard delete. Shows pass summary and warns the action is irreversible.

---

## 12. Auth

All program pass routes require `requireSuperAdmin` — they verify a valid staff JWT with `superAdmin: true` (or equivalent admin role). Player-facing enrollment has no routes yet (Phase 2).

---

## 13. Image Upload Pipeline

1. `POST /api/admin/program-passes/types/[id]/image` (multipart/form-data)
2. Validates MIME type (PNG/JPEG/WebP) and file size (≤ 5 MB)
3. Reads raw buffer from FormData
4. Passes through `sharp`: resize to 800×800 inside (preserves aspect ratio), encode as WebP quality 80
5. Writes to `/uploads/program-passes/{id}.webp` (creates dir if missing)
6. Updates `program_pass_types.image_url` to `/uploads/program-passes/{id}.webp`
7. Returns `{ imageUrl }`

The client previews the file immediately via `URL.createObjectURL(file)` before upload.

---

## 14. Court Conflict Integration

**How program classes block the court:**

When `generateRunSchedule` runs, it creates one `CourtBlock` of type `program_class` per occurrence. This type is part of the `CourtBlockType` Postgres enum. The existing `getAvailableSlots()` function in `src/lib/booking.ts` treats all 7 `CourtBlockType` values uniformly — they all occupy a court cell. No special-casing was needed for `program_class`.

**Effect:** Any existing court-booking code that calls `getAvailableSlots()` will correctly show program class time slots as unavailable for regular bookings.

**Coach conflict (soft-warning):**

When staff books a private lesson for a coach via `POST /api/admin/coach-lessons`, the route now additionally calls `checkProgramBlockConflict()`. If the coach is assigned to a `program_class` CourtBlock overlapping the lesson time, the response includes:
```json
{
  "lesson": { ... },
  "warning": {
    "code": "COACH_PROGRAM_CONFLICT",
    "blockInfo": { "programRunId": "...", "title": "Cobra Lv1 July", "date": "...", "startTime": "...", "endTime": "..." }
  }
}
```
The lesson is **still created** (no hard block). The admin UI (`StaffBookingModal`) shows a yellow `AlertTriangle` banner if the response contains `warning`. Staff acknowledges and proceeds.

**Player-facing booking** keeps the existing hard-reject behavior (program coach blocks appear as unavailable slots, not a soft warning).

---

## 15. Timezone Handling

All date/time logic follows the workspace rule: **server runs in `Asia/Saigon` (UTC+7)**, all local time methods used.

| Pattern | Code | When Used |
|---|---|---|
| Prisma DATE write | `new Date('YYYY-MM-DDT12:00:00+07:00')` | `start_date`, `recurrence_end_date`, `date` on CourtBlock |
| Local midnight (arithmetic) | `new Date('YYYY-MM-DDT00:00:00+07:00')` | Schedule iteration start |
| Weekly advance | `setDate(getDate() + 7)` | `generateRunSchedule` loop |
| Class time | `setHours(h, m, 0, 0)` | StartTime/endTime on CourtBlock and ClassInstance |
| Cycle end (monthly) | `new Date(y, m+1, 0, 23, 59, 59, 999)` | `computeCycleEnd` |

**Rationale for noon pattern on Prisma DATE writes:** Prisma serializes `Date` objects as `.toISOString()` (UTC). On a UTC+7 server, local midnight = `17:00 UTC previous day`. Storing noon local (`05:00 UTC`) keeps the correct calendar date in Postgres's `DATE` cast regardless of timezone.

---

## 16. Known Gaps & Phase 2 Backlog

### Not Built Yet (Phase 2)

| Feature | Notes |
|---|---|
| **Player-facing CourtPass enrollment** | No player UI, no enrollment API for the mobile/PWA player portal. Players cannot currently see or buy program runs. |
| **Waitlist promotion logic** | Table exists (`program_run_waitlist`). No auto-promotion when capacity raises or enrollment cancels. No player-facing "join waitlist" button. |
| **Auto status transitions** | Run status (`upcoming` → `in_progress` → `completed`) must be changed manually by staff today. No scheduled job. |
| **Recurring run auto-renewal** | No mechanism to auto-create the next cohort when one ends. |
| **Refund / credit automation** | All refunds for cancelled runs or rescheduled classes are manual staff actions (calling/messaging the player). No automated payment reversal. |
| **Per-session attendance status** | `sessionsUsed` + check-in log is the only tracking. No explicit `attended / no_show / excused` status on ClassInstance. |
| **Program analytics dashboard** | No fill-rate, coach utilization, or revenue-by-program reporting. |
| **Mobile app parity** | Program Runs and enrollment flow are not implemented in the React Native app (`mobile/src/`). |
| **PWA program listing page** | No player-facing page listing active program runs at a venue. |

### Technical Debt (deferred)

| Item | Notes |
|---|---|
| `class_passes` table name | Should be `program_passes` for clarity. Flagged, not blocking. |
| `class_instances` table name | Should be `program_class_instances`. Same situation. |
| `ClassInstance.coachId` column | Required field, populated with `coaches[0].coachId` or `createdBy` as a sentinel when no coach. Multi-coach reality is now in `program_run_court_block_coaches`, making this column redundant. |
| Program Runs tab UI | Backend complete, UI `in_progress` per plan — Create/Edit Run modals and instance expandable list still being built. |

### Business Rules Not Enforced by Code

| Rule | Status |
|---|---|
| Lowering capacity below enrolled count | ✅ Enforced (`updateRunCapacity` throws `CAPACITY_BELOW_ENROLLED`) |
| Double check-in prevention | ✅ Enforced at both app and DB level |
| Deactivating a pass type with active passes | ✅ Blocked by API (returns 400 with count) |
| Enrolling in a cancelled/completed run | ✅ Blocked by `enrollInRun` status check |
| Coach double-booking for program + lesson | ⚠️ Soft warning only (staff can override) |
| Refunds on cancellation | ❌ Manual process, no code enforcement |
| Session cap reset on cycle renewal | ❌ No automatic renewal logic exists — `sessionsUsed` is not reset automatically; pass expiry and renewal is a manual staff action |

---

## 17. File Map

```
src/
  app/
    (admin)/admin/program-passes/
      page.tsx                          ← Main UI (3 tabs, all modals)
    api/admin/program-passes/
      route.ts                          ← GET (list + KPI)
      activate/route.ts                 ← POST (activate pass)
      check-in/route.ts                 ← POST (check-in)
      class-instances/route.ts          ← GET (today's classes)
      [id]/route.ts                     ← PATCH (pause/resume/cancel), DELETE
      types/route.ts                    ← GET (list types), POST (create type)
      types/[id]/route.ts               ← PATCH (edit type), DELETE (soft delete)
      types/[id]/image/route.ts         ← POST (upload image)
    api/admin/program-runs/             ← NEW Phase 1
      route.ts                          ← GET (list runs), POST (create run)
      [id]/route.ts                     ← PATCH (edit run)
      [id]/generate/route.ts            ← POST (generate schedule)
      [id]/instances/route.ts           ← GET (list instances)
      [id]/instances/[instanceId]/route.ts ← PATCH (reschedule instance)
  lib/
    program-pass.ts                     ← checkInToClassInstance, computeCycleEnd
    program-run.ts                      ← generateRunSchedule, checkProgramBlockConflict,
                                           enrollInRun, updateRunCapacity, rescheduleInstance
  components/admin/
    StaffBookingModal.tsx               ← Coach-lesson soft-conflict warning UI

db/migrations/
  20260716120000_program_run_cohort.sql ← Phase 1 migration (10 steps)

prisma/
  schema.prisma                         ← ProgramPassType, ProgramPass, ClassInstance,
                                           ClassCheckIn, ProgramPassPayment,
                                           ProgramPassTypeCoach, ProgramRun,
                                           ProgramRunCoach, CourtBlockCoach,
                                           ProgramRunWaitlistEntry

uploads/
  program-passes/                       ← WebP images for pass types
```

---

## 18. Entity Relationship Summary (Simplified)

```
Venue
 ├── ProgramPassType (products/templates)
 │    ├── description: optional long text
 │    ├── imageUrl: optional WebP
 │    ├── passMode: monthly | days_30 | days_45 | days_60 | days_90 | custom
 │    ├── sessionsIncluded, price
 │    ├── coaches (many-to-many via ProgramPassTypeCoach)
 │    └── ProgramRun (cohort instances of this product)
 │         ├── status: upcoming | in_progress | completed | cancelled
 │         ├── start_date, recurrence config, maxCapacity, courtId
 │         ├── coaches (default coaches → copied to per-block coaches on generate)
 │         ├── ClassInstance (generated occurrences)
 │         │    └── CourtBlock (occupies court, blocks coach)
 │         │         └── CourtBlockCoach (per-block coach assignments)
 │         └── ProgramPass (enrollments)
 │              ├── sessionsUsed, status, cycleStart, cycleEnd
 │              ├── ProgramPassPayment (PAID | UNPAID | VOID)
 │              └── ClassCheckIn → ClassInstance
 │
 └── Player
      └── ProgramPass (many, across venues)
```

---

*End of document. Generated from codebase read on July 16, 2026.*
