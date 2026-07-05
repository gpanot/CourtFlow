# 30-Minute Booking Grid — Validation Report

**Date:** 2026-07-05  
**Scope:** Full migration from hourly to 30-min grid (Phases 1–8)

---

## Stage 1 — Kernel (`src/lib/booking.ts`)

**Tests:** `booking-grid.test.ts` — **30/30 PASS**  
`lesson-slot-selection.test.ts` — **FILE DOES NOT EXIST**

### Export inventory

| Export | Exists | Notes |
|---|---|---|
| `GRID_GRANULARITY_MINUTES` | Yes (line 19) | Returns 30 |
| `resolveBookingPrice` | Yes (line 211) | See trace below |
| `generateTimeSlots` | Yes (line 293) | Private — not directly exported; exposed via `getAvailableSlots` |
| `intervalsOverlap` | Yes (line 234) | Half-open intervals, all edge cases pass |
| `validateBookingDuration` | Yes (line 266) | Player min 2 / staff min 1, max from config |
| `isValidGridStartTime` | Yes (line 244) | Rejects :15, :45 etc. |
| `findConsecutiveAvailableSpan` | Yes (line 340) | Exported, checks contiguous availability |

### `resolveBookingPrice` trace — user spec: 18:00–19:30, 100k@18h, 200k@19h → expected 200k

```
Cell 0: startTime = 18:00  → hour bucket 18 → resolveSlotPrice = 100k → cell cost = 100k / 2 = 50k
Cell 1: startTime = 18:30  → hour bucket 18 → resolveSlotPrice = 100k → cell cost = 100k / 2 = 50k
Cell 2: startTime = 19:00  → hour bucket 19 → resolveSlotPrice = 200k → cell cost = 200k / 2 = 100k
Total = Math.round(200k) = 200k ✓
```

Test `"example from user spec"` confirms 200k output. **PASS.**

### Issues

- `generateTimeSlots` is not directly exported — callers use `getAvailableSlots`. Not a defect, just a naming note.
- `lesson-slot-selection.test.ts` was listed in the spec but was never created. **Missing file.**

---

## Stage 2 — General Settings

**`GeneralSettingsSection`** reads `allow30MinBookings`, `defaultDurationMinutes`, `maxDurationMinutes` from `parseCfg(settings)` (`admin/bookings/page.tsx` lines 1289–1291) and writes them via `PUT /api/admin/venues/[id]/booking-config` (lines 1169–1173). **PASS.**

### `slotDurationMinutes` grep — remaining live references outside the deprecated comment

| File | Line | Nature |
|---|---|---|
| `src/app/api/admin/venues/route.ts` | 95 | Venue creation seed — hardcodes `slotDurationMinutes: 60`; new fields (`allow30MinBookings`, `maxDurationMinutes`) are **not seeded** for new venues |
| `src/app/api/public/venue/route.ts` | 46 | Exposes `slotDurationMinutes` in the public API response — harmless but stale |
| `src/app/(admin)/admin/bookings/page.tsx` | 1279 | `parseCfg` reads it from raw JSON — harmless backward-compat read |
| `src/lib/booking.ts` | 37, 52, 163 | Interface field + default + `getBookingConfig` reader — covered by the `@deprecated` comment |

### Issues

- **New venue creation** via `POST /api/admin/venues` does not seed `allow30MinBookings`, `defaultDurationMinutes`, or `maxDurationMinutes`. New venues use `DEFAULT_BOOKING_CONFIG` fallbacks silently; the admin settings panel will show "default" values on first open until the admin explicitly saves.

---

## Stage 3 — Booking APIs

### `POST /api/bookings` removed

File `src/app/api/bookings/route.ts` does not exist. **PASS.**

`GET /api/bookings/availability` still exists and is used by four callers (correct side-channel). **PASS.**

`/api/bookings/mine/route.ts` still exists with a `GET` handler using `staff_token` auth. No callers found in the frontend. Orphaned but not harmful.

### `public/bookings` — player min 2 cells

- `maxCells` from config, `slotCount` capped, then `validateBookingDuration(config, slotCount, "player")` at lines 54–58. **PASS.**
- `resolveBookingPrice` used at line 67. **PASS.**
- Full-span overlap check inside `$transaction` at lines 87–98. **PASS.**

### `staff/bookings` — staff min 1 cell

- `validateBookingDuration(config, slotCount, "staff")` at lines 75–79. **PASS.**
- `resolveBookingPrice` used at line 88. **PASS.**

### `staff/bookings/[id]` — reschedule preserves duration

- Line 147: `const durationMs = existing.endTime.getTime() - existing.startTime.getTime()` — original duration preserved. **PASS.**
- Line 165: `resolveBookingPrice(config, startTime, durationMinutes, venueTimezone)` — repriced at new time. **PASS.**

### Callers of deprecated routes

None found. **PASS.**

---

## Stage 4 — Admin Grids

### VenueDayPlanner 1h/30min toggle

`VenueDayPlanner` has a `court` vs `time` view toggle stored under `viewModeStorageKey` (e.g. `"bookings-view-mode"`).

**There is no `bookings-slot-granularity` key and no 1h/30min granularity toggle.** The component has no `displayGranularity` prop. The admin grid always displays all 30-min rows. The "1h compact / 30min granular" toggle was in the plan but was never implemented. **FAIL.**

### `BookingCourtGrid` / `BookingTimeGrid` `displayGranularity` prop

Neither component accepts a `displayGranularity` prop. There is no hour-view aggregation logic. **FAIL.**

### `BookingCourtGrid` booking span calculation

Line 264–268: `Math.round((endTime - startTime) / (1000 * 30 * 60))` — correctly spans 30-min rows. A 9:30–11:00 booking (90 min) computes 3 rows. **PASS.**

The `bookingsByKey` map (line 180) stores bookings keyed by `courtId_startTime`. A 9:30-start booking is correctly found when the slot's `startTime` ISO string matches. **PASS.**

### Now-indicator precision

Line 176: `currentRowOffset = (nowHour - firstHour) * 2 * ROW_H` where `nowHour` is fractional (e.g., 10.75 for 10:45). The `* 2` converts from hours to 30-min rows correctly. **PASS for accuracy.** The indicator does not auto-update — it is computed once at render time.

### `BookingSelectionBar` duration label

Line 152: Shows `{summary.slotCount} {slotLabel}` (e.g. "3 slots"), not "1h 30" style labels. Time range and total price are displayed correctly.

- Duration label format: **PARTIAL/FAIL** — raw slot count shown, not "1h 30" per spec.
- Price sum via `sl.priceValue`: **PASS.**

### `EditBookingModal` preserves duration on reschedule

`EditBookingModalController` sends `PATCH { courtId, date, startTime }`. Server derives `endTime` from `existing.endTime - existing.startTime` (line 147). **PASS.**

---

## Stage 5 — Coach Lessons

### `lesson-slot-selection.ts` helper file

Does not exist. The spec references `cellsPerLesson`, `lessonCount`, `validateLessonSelection`, `formatLessonDuration`, `lessonEndTime` as exports from a dedicated file. None of these exist. Logic is inline in `StaffBookingModal.tsx` and `admin/coaching/page.tsx`. **FAIL — missing file, missing named exports.**

### `StaffBookingModal` lesson mode validation

No `cellsPerLesson` / `validateLessonSelection` check exists. The modal allows any number of consecutive 30-min cells regardless of `pkg.durationMin`. A user can select 1 cell (30 min) for a 90-min package with no warning. **FAIL.**

Display label: Line 528 shows `{selectedSlots.length} slot{...} · {fmtDuration(selectedSlots.length * 30)}`. For 3 slots this renders "3 slots · 1h30" — not "1h30 · 1 session" as specified. **PARTIAL.**

### ⚠ `StaffBookingModal` lesson `endTime` bug — HIGH PRIORITY

`submitLesson` at line 424 sends `endTime: last.endTime` where `last` is the last 30-min grid slot.

For a 90-min package with 3 cells selected (10:00, 10:30, 11:00):
- `last.endTime = 11:30` → lesson stored as 10:00–11:30 (90 min) ✓ coincidentally correct

For a 90-min package with 2 cells selected (10:00, 10:30):
- `last.endTime = 11:00` → lesson stored as 10:00–11:00 (60 min) ✗ wrong duration + wrong price

There is no guard preventing this mismatch. The only thing standing between the user and a wrong-duration lesson is the UI allowing any number of consecutive 30-min cells.

**File:** `StaffBookingModal.tsx:424`

### `api/admin/coach-lessons` duration validation

The route does not validate that `(endTime - startTime)` is a multiple of `pkg.durationMin`. Line 199 computes `slotCount = Math.round(durationMin / pkg.durationMin)` which silently rounds. No 400 error is returned for non-multiple durations. **FAIL.**

### `admin/coaching/page.tsx` duration presets

Lines 652–654 confirm dropdown options of 60, 90, 120. **PASS.**

`fmtLessonDuration` helper exists at line 137. **PASS.**

Pricing uses `editSelectedSlots.length * 30`. **PASS.**

---

## Stage 6 — Player Portal and CourtPass

### `book/page.tsx`

- 30-min cells: `formatSlotTime(s.startTime)` used for headers and buttons. **PASS.**
- Min 2 cells: Lines 287–289 enforce unless `allow30MinBookings`. **PASS.**
- Max from config: Lines 263–265 compute `maxSlots = maxDurationMinutes / 30`. **PASS.**
- `canBook` gates the CTA button (lines 336, 686). **PASS.**

### `confirm/page.tsx`

- `slotCount` capped at 32 (16h max). **PASS.**
- `slotTimes` steps by 30 min (lines 41–43). **PASS.**
- Duration shown as `fmtDuration(durationMinutes)` (line 126). **PASS.**
- Min 2 cells: The confirm page does not re-validate minimum. If `slotCount=1` is in the URL, it will display and attempt to book 1 cell regardless of `allow30MinBookings`. **Minor gap.**

### `courtpass-players/page.tsx` `NewBookingModal`

- 30-min start times: `timeOptions` in 30-min steps (lines 497–500). **PASS.**
- Sends to `POST /api/staff/bookings` which enforces `validateBookingDuration(config, slotCount, "staff")` — min 1 cell. **PASS.**
- Default `slotCount = 2`; staff can select `slotCount = 1` from dropdown. **PASS.**
- Dead code: `void hh; void mm;` at lines 508–509 — destructured but unused. Not a bug.

---

## Stage 7 — Phase 8 Player Coach Portal

### `api/public/coaches/[id]/route.ts`

- Uses `GRID_GRANULARITY_MINUTES` loop (lines 153–162). **PASS.**
- `isAnyCourtAvailableAtHour` is **not called** (confirmed by grep). **PASS.**
- Coach availability probed with a 30-min window (`slotEnd = slotStart + 30min`), not `pkg.durationMin`. A coach with 30 min free but not the full package duration will appear available — the authoritative check happens in `createCoachLesson`. This is a deliberate design choice, not a defect.
- Court free check uses `intervalsOverlap` over `courtMatrix`. **PASS.**

### `book/coaches/[coachId]/page.tsx`

- Uses ISO `startTime` strings, `selectedSlots`, `toggleSlot`. **PASS.**
- **No minimum 2 cells (60 min) enforcement.** `goToSummary` only checks `selectedSlots.length === 0`. A player can confirm 1×30-min slot for a 60-min package.
  - DB integrity is preserved because `createCoachLesson` computes `endTime = startTime + pkg.durationMin × 1` regardless of UI slot count.
  - But the summary page shows wrong time range and wrong price. **FAIL against spec.**
- Consecutive check in `toggleSlot` uses `pkgDurationMin` spacing (lines 181–185). **PASS.**
- `lesson-slot-selection.ts` helpers not used (file doesn't exist). **FAIL.**

---

## Final Summary Table

| Stage | Status | Issues | File : Line |
|---|---|---|---|
| 1 — Kernel exports | PARTIAL | `lesson-slot-selection.test.ts` missing; `generateTimeSlots` not directly exported | — |
| 1 — `resolveBookingPrice` trace | PASS | Confirmed 200k for user spec example | `booking.ts:211` |
| 2 — GeneralSettingsSection | PASS | Reads and writes all three new fields | `bookings/page.tsx:1140` |
| 2 — New venue seed | NOTE | Missing `allow30MinBookings`, `maxDurationMinutes` in default seed | `venues/route.ts:95` |
| 2 — `slotDurationMinutes` references | NOTE | 3 live references outside deprecated comment; harmless but stale | `venues/route.ts:95`, `public/venue/route.ts:46`, `bookings/page.tsx:1279` |
| 3 — `POST /api/bookings` removed | PASS | File deleted | — |
| 3 — `public/bookings` pricing + min | PASS | `resolveBookingPrice`, `validateBookingDuration("player")`, transaction overlap | `public/bookings/route.ts:54–98` |
| 3 — `staff/bookings` pricing + min | PASS | `resolveBookingPrice`, `validateBookingDuration("staff")` | `staff/bookings/route.ts:75–88` |
| 3 — Reschedule duration | PASS | Server preserves `durationMs` from existing booking | `staff/bookings/[id]/route.ts:147` |
| 4 — VenueDayPlanner granularity toggle | FAIL | `bookings-slot-granularity` key and 1h/30min toggle not implemented | `VenueDayPlanner.tsx` — missing |
| 4 — `BookingCourtGrid` `displayGranularity` | FAIL | Prop not accepted; no hour-aggregation logic | `BookingCourtGrid.tsx` — missing |
| 4 — `BookingSelectionBar` duration label | PARTIAL | Shows "3 slots" not "1h 30"; time range and price are correct | `BookingSelectionBar.tsx:152` |
| 4 — `EditBookingModal` duration | PASS | Server-side duration preserved on reschedule | `staff/bookings/[id]/route.ts:147` |
| 5 — `lesson-slot-selection.ts` | FAIL | File does not exist; no `cellsPerLesson`, `validateLessonSelection`, `lessonEndTime` | — |
| 5 — `StaffBookingModal` lesson validation | FAIL | No guard that slot count is multiple of `pkg.durationMin / 30` | `StaffBookingModal.tsx:406–430` |
| 5 — `StaffBookingModal` lesson `endTime` | **CRITICAL** | `last.endTime` (30-min grid cell end) sent as lesson endTime; wrong cell count → wrong duration + wrong price | `StaffBookingModal.tsx:424` |
| 5 — `coach-lessons` API validation | FAIL | No validation that `(endTime - startTime)` is multiple of `pkg.durationMin` | `coach-lessons/route.ts:197–199` |
| 5 — `coaching/page.tsx` presets | PASS | 60/90/120 min options present | `coaching/page.tsx:652–654` |
| 6 — `book/page.tsx` | PASS | 30-min cells, min 2 cells, max from config, `canBook` gate | `book/page.tsx:263–336` |
| 6 — `confirm/page.tsx` | PASS with note | 30-min stepping correct; no re-validation of min 2 cells on confirm | `confirm/page.tsx:27–29` |
| 6 — CourtPass `NewBookingModal` | PASS | 30-min times, staff min 1 cell via server | `courtpass-players/page.tsx:488–516` |
| 7 — Coach availability API | PASS with note | 30-min probe, no `isAnyCourtAvailableAtHour`; probe window is 30 min not `pkg.durationMin` (intentional) | `coaches/[id]/route.ts:153–204` |
| 7 — `book/coaches` UI min cells | FAIL | No minimum 2 cells (60 min) enforcement for player coach bookings | `coaches/[coachId]/page.tsx:204` |
| 7 — lesson-slot-selection helpers | FAIL | Not used in coach UI (file doesn't exist) | — |

---

## High-Priority Items (Pricing / Booking-Integrity Sensitive)

| Priority | Issue | Impact | Location |
|---|---|---|---|
| **CRITICAL** | `StaffBookingModal` lesson mode sends `last.endTime` (30-min grid cell end) as lesson `endTime`. For wrong cell count (e.g. 2 cells of a 90-min package), lesson is stored with 60-min duration at 60-min price. | Wrong lesson duration + wrong price stored in DB | `StaffBookingModal.tsx:424`, `coach-lessons/route.ts:197` |
| **HIGH** | `api/admin/coach-lessons` accepts any `endTime` without validating it equals a multiple of `pkg.durationMin` from `startTime`. | Lesson duration and price can be arbitrarily wrong if client sends bad data | `coach-lessons/route.ts:197–203` |
| **HIGH** | `lesson-slot-selection.ts` and its test file do not exist. The helpers that would prevent the above issue are absent. | No client- or server-side enforcement layer for lesson slot multiples | Missing file |
| **MEDIUM** | `BookingSelectionBar` shows raw "N slots" not "1h 30" duration labels. Staff may misread selection duration. | UX / staff confusion; no financial impact | `BookingSelectionBar.tsx:152` |
| **MEDIUM** | `VenueDayPlanner` and `BookingCourtGrid` have no `displayGranularity` / `bookings-slot-granularity` toggle. Admin grid always shows 30-min rows with no compact 1h view. | Admin UX density increase; no data integrity impact | `VenueDayPlanner.tsx`, `BookingCourtGrid.tsx` — missing |
| **LOW** | `book/coaches/[coachId]/page.tsx` has no min 2-cell guard. Player can attempt 30-min lesson booking for a 60-min package — DB will still get correct 60-min lesson, but summary shows wrong time and price. | Misleading confirmation UI; DB integrity preserved by server | `coaches/[coachId]/page.tsx:204` |
| **LOW** | New venue creation seed omits `allow30MinBookings`, `defaultDurationMinutes`, `maxDurationMinutes`. | New venues get library defaults silently; no UI persistence until admin saves | `admin/venues/route.ts:95` |
