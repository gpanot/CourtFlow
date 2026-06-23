# Coach Lesson Booking Upgrade — Spec

**Version 1.0 · June 21, 2026**
**Owner request source:** Court 002 (priority feature)

---

## 1. Purpose

Today CourtFlow has coach packages, coach lessons, and a 10-credit system already modeled in the database, but the student-facing booking flow does not check real coach availability, has no staff approval step, and sends no email to coaches or staff. This upgrade closes those gaps so students can book a coach class through CourtPass, with two payment paths, full availability checking against the coach's real schedule (including external Google Calendar appointments), and complete email notifications to student, coach, and staff at every step.

---

## 2. What already exists (confirmed by codebase investigation)

| Component | Status |
|---|---|
| Coach model (`StaffMember.isCoach = true`) | Exists |
| Lesson package model (`CoachPackage`) | Exists |
| Lesson booking model (`CoachLesson`) | Exists |
| 10-credit package model (`PlayerCoachCredit`) | Exists, fully wired to Sepay (`CF-CR-` prefix) |
| Manual QR proof upload for lessons | Exists (`POST /api/public/coach-sessions/[id]/proof`) |
| Sepay auto-payment for lessons | Exists (`CF-CL-` prefix) |
| Sepay auto-payment for credit packages | Exists (`CF-CR-` prefix) |
| Email to student on booking | Exists (`sendBookingEmail`, Resend) |
| `CoachAvailability` / `CoachHoliday` models | Exist, but **not read** at booking time |
| Rejection fields on `CoachLesson` | Exist (`rejectedAt`, `rejectedBy`, `rejectionReason`) |

## 3. Gaps to close

| Gap | Why it matters |
|---|---|
| Coach availability and holidays not checked when booking | Students can currently double-book a coach outside their real hours |
| No `pending_approval` status on `CoachLessonStatus` | Manual QR flow needs a holding state before staff approves |
| No email to coach or staff on any lesson event | Staff cannot claim "I didn't see it" if no email exists |
| No link between `Player` and `StaffMember` | Coaches cannot be recognized inside CourtPass to see their own nav section |
| No Google Calendar sync | External/on-demand coaches have appointments outside CourtFlow that must block availability |
| No coach-facing section in CourtPass | Coaches currently need no admin access per requirement, but have nowhere to manage anything either |
| No per-coach credit package expiry default | Owner wants 90 days, configurable per coach |

---

## 4. Data model changes

### 4.1 `CoachLessonStatus` enum

```
enum CoachLessonStatus {
  pending_approval   // NEW
  confirmed
  completed
  cancelled
  no_show
}
```

### 4.2 `StaffMember` (coach fields, additive)

```
googleRefreshToken        String?   @map("google_refresh_token")
googleCalendarId          String?   @map("google_calendar_id")
calendarSyncEnabled       Boolean   @default(false) @map("calendar_sync_enabled")
creditPackageValidityDays Int       @default(90) @map("credit_package_validity_days")
```

### 4.3 `Player`

```
coachStaffId   String?   @map("coach_staff_id")
coachStaff     StaffMember? @relation(fields: [coachStaffId], references: [id])
```

Set manually by staff when linking a coach's player account, or matched by email at first login if emails align. No automatic merge without a clear signal, consistent with the "never guess" principle already used for player identity reconciliation elsewhere in the platform.

### 4.4 `PlayerCoachCredit`

No schema change needed. `expiresAt` already exists. At purchase confirmation, set it to `purchaseDate + StaffMember.creditPackageValidityDays`.

### 4.5 `CreditTransaction` (new, for audit trail)

```
model CreditTransaction {
  id         String   @id @default(cuid())
  creditId   String   @map("credit_id")
  credit     PlayerCoachCredit @relation(fields: [creditId], references: [id])
  lessonId   String?  @map("lesson_id")
  amount     Int      // -1 on booking, +1 on refund
  reason     String   // "booked" | "cancelled_refund" | "completed"
  createdAt  DateTime @default(now()) @map("created_at")
}
```

---

## 5. Booking flows

### 5.1 Flow A — One-time booking, manual QR

1. Student opens CourtPass → Coaches → picks coach, date, time
2. System runs the three-layer availability check (section 6). If unavailable, suggest nearest open slot for that coach
3. Student confirms → sees VietQR → uploads proof of payment
4. `CoachLesson.status = pending_approval`, `paymentStatus = proof_submitted`
5. Email to student: payment received, pending approval
6. Email to staff: new booking awaiting approval, with proof image link (always sent, no exceptions)
7. Email to coach: tentative booking notice, with calendar sync prompt if not yet connected
8. Staff approves in admin panel → `status = confirmed`, `paymentStatus = paid`
9. Email to student: confirmed
10. Email to coach: confirmed (calendar event auto-created if synced)
11. Email to staff: confirmed (always sent)

If staff rejects: `status = cancelled`, `rejectedAt/rejectedBy/rejectionReason` populated, email to student with reason, email to coach, email to staff confirming the rejection was processed.

### 5.2 Flow A — One-time booking, Sepay auto

Same as above through step 3, then Sepay webhook matches `CF-CL-` reference and auto-confirms. Steps 4 to 8 collapse into one event: `status = confirmed`, `paymentStatus = paid` immediately. All three confirmation emails (9, 10, 11) fire immediately, no pending state ever shown.

### 5.3 Flow B — 10-credit package purchase

Package purchase (the `PlayerCoachCredit` record itself) follows the same manual-QR-or-Sepay pattern as flow A, using the `CF-CR-` reference prefix already wired. On confirmation, `expiresAt` is set per section 4.4.

### 5.4 Flow B — Booking a class with credits

1. Student picks coach, date, time, same three-layer availability check as flow A
2. On confirm, 1 credit is deducted immediately: `PlayerCoachCredit.usedSessions += 1`, `CreditTransaction` row created with `amount: -1, reason: "booked"`
3. `CoachLesson.status = confirmed` directly, no pending state, since payment was already settled at package purchase
4. Email to student, coach, and staff fire immediately, all confirmed

---

## 6. Availability checking (three layers)

New function `isCoachAvailable(coachId, date, startTime, endTime)`:

1. **CoachAvailability** — the requested time falls inside the coach's recurring weekly window for that `dayOfWeek`
2. **CoachHoliday** — the date is not inside a blackout range
3. **Existing CoachLesson conflicts** — no overlapping `confirmed` or `pending_approval` lesson for that coach (already partially implemented, extend to include `pending_approval`)
4. **Google Calendar free/busy** — if `calendarSyncEnabled`, call the free/busy API for the coach's connected calendar; treat any busy block as unavailable. Skipped entirely if the coach has not connected a calendar

If any layer fails, suggest the nearest open slot for that coach: same day first, then next available day, scanning forward.

This function is called from both `GET /api/public/coaches/[id]/route.ts` (to show available slots) and the booking creation route (to validate before accepting).

---

## 7. Email notifications

Extend `sendBookingEmail` (or add a parallel function) with a `recipientRole: "student" | "coach" | "staff"` parameter. `bookingType: "coach"` already has templates for `pending | approved | rejected | cancelled | auto_confirmed`, these need a coach-facing and staff-facing variant each.

| Event | Student | Coach | Staff |
|---|---|---|---|
| Proof submitted (manual) | Yes | Yes | Yes |
| Auto-confirmed (Sepay) | Yes | Yes | Yes |
| Staff approves | Yes | Yes | Yes |
| Staff rejects | Yes | Yes | Yes |
| Credit booking confirmed | Yes | Yes | Yes |
| Cancellation (any reason) | Yes | Yes | Yes |

Staff email fires on every single event without exception, per explicit requirement, so staff cannot claim they were not notified even though the same information also appears on screen.

`EmailLog` model already tracks sends by booking type/id/email type, extend it to also log `recipientRole` so coach and staff sends are auditable separately from student sends.

---

## 8. Google Calendar sync

Two directions, both needed since some coaches are external and take on-demand appointments outside CourtFlow.

**Outgoing (push):** on `CoachLesson` confirmation, create an event on the coach's connected Google Calendar via `googleCalendarId`. On cancellation, delete or update the event.

**Incoming (pull):** before confirming a slot, call the calendar free/busy endpoint for the coach's calendar and treat busy blocks as unavailability (layer 4 in section 6).

**OAuth:** cannot reuse the existing player-login Google OAuth route since it only requests `openid email profile` with `access_type: "online"` (no refresh token). Coaches need a separate connect flow:
- New route, same Google client, scope `https://www.googleapis.com/auth/calendar.events`
- `access_type: "offline"`, `prompt: "consent"` to obtain a refresh token
- Token stored on `StaffMember.googleRefreshToken` / `googleCalendarId`
- Connect button lives in the new CourtPass coach section (section 9)
- If a coach has not connected a calendar, layer 4 of the availability check is simply skipped, no error

---

## 9. CourtPass coach section (no admin access required)

Add a `coachStaffId` link from `Player` to `StaffMember` (section 4.3). `usePlayerSession` exposes `isCoach: boolean`. `BottomNav.tsx` conditionally renders a 5th tab when `isCoach` is true, alongside the existing Book, Coaches, Bookings, Profile tabs.

New section contents:
- **My Lessons** — upcoming and past lesson bookings, view-only, no approve/reject power (staff retains sole approval authority per explicit decision)
- **My Availability** — edit `CoachAvailability` weekly windows and `CoachHoliday` blackout dates, reusing or exposing a public-facing version of the existing admin weekly-availability API, scoped to the logged-in coach only
- **Calendar Sync** — connect/disconnect Google Calendar button, shows current sync status

---

## 10. Cancellation and reschedule policy

- **More than 48h before start:** student can self-cancel or reschedule for free, no staff involvement. If credit-based, the credit is refunded (`CreditTransaction` with `amount: +1, reason: "cancelled_refund"`, `usedSessions -= 1`). If one-time paid, no refund is issued since there was no credit to give back, this is accepted as-is per explicit decision
- **Less than 48h before start:** self-service blocked in the UI, student must call staff. Staff cancels manually from the admin panel, applying the same credit-refund logic at their discretion

---

## 11. Open decisions already locked in

- Staff receives an email on every confirmed, pending, and cancelled booking, no exceptions
- Credits are coach-specific, not venue-wide, since coaches have different levels
- One-time bookings have no cancellation refund
- Coaches have no approval power, staff only, coaches are only responsible for keeping their availability and calendar synced
- Package expiry defaults to 90 days, configurable per coach via `StaffMember.creditPackageValidityDays`

---

## 12. Build order

1. **Migration** — `pending_approval` enum value, `Player.coachStaffId`, `StaffMember` new fields, `CreditTransaction` table
2. **Availability function** — `isCoachAvailable()` with the three-layer check (Google Calendar layer can be stubbed initially and wired in step 4), nearest-slot suggestion logic, wired into the coach detail GET route and the booking POST route
3. **Email functions** — coach and staff variants for all five existing email types, wired into proof upload, approval, rejection, cancellation, and Sepay auto-confirm paths, `EmailLog` extended with `recipientRole`
4. **Google Calendar sync** — new OAuth connect route with offline access and consent prompt, token storage, push on confirm, pull on availability check
5. **Coach detection in CourtPass** — `coachStaffId` exposed in session, `BottomNav.tsx` conditional 5th tab
6. **CourtPass coach section** — My Lessons, My Availability, Calendar Sync, all scoped to the logged-in coach with no admin access
7. **Cancellation/reschedule logic** — 48h rule, credit refund on credit-based cancellations, no refund on one-time cancellations

---

## 13. Testing checklist before considering complete

- Coach with no Google Calendar connected can still be booked using only `CoachAvailability` and `CoachHoliday`
- Coach with a connected calendar shows as unavailable during an external busy block even with no `CoachLesson` conflict
- Manual QR flow correctly holds at `pending_approval` and does not show as confirmed to the student until staff approves
- Sepay auto flow skips `pending_approval` entirely and confirms immediately
- Staff receives an email for every single event type, verified against `EmailLog`
- Credit booking deducts exactly 1 credit at booking time and refunds exactly 1 credit on a more-than-48h cancellation
- One-time booking cancellation does not attempt to refund anything
- Package `expiresAt` is set correctly using the coach's configured validity days, not a hardcoded 90
- A player account linked via `coachStaffId` sees the 5th nav tab, an unlinked player does not
- Reschedule within 48h is blocked in the UI with a clear "contact staff" message
