# CourtFlow — Email Notifications Reference

Last updated: 2026-07-06

This document lists **every transactional email** currently sent by CourtFlow, where it is triggered in code, who receives it, and what conditions apply.

---

## Infrastructure

| Setting | Value |
|---|---|
| Provider | [Resend](https://resend.com) via `src/lib/email/client.ts` |
| Env var | `RESEND_API_KEY` |
| From address | `noreply_bookings@thecourtflow.com` |
| Base URL for links | `APP_URL` or `NEXT_PUBLIC_COURTPASS_URL` (auth emails) |

### Sending helpers

| Helper | File | Purpose |
|---|---|---|
| `sendBookingEmail()` | `src/lib/email/send.ts` | Court, open play, and coach booking lifecycle emails |
| `sendLessonEventEmails()` | `src/lib/email/send.ts` | Lesson emails to **player + coach + venue staff** in one call |
| `buildLessonEmailContext()` | `src/lib/email/send.ts` | Loads lesson, player, coach, venue from DB for lesson emails |
| `sendBillingProofNotification()` | `src/lib/email/send.ts` | Platform billing — manager submits invoice payment proof |
| `requestPasswordReset()` | `src/lib/player-reset-password.ts` | Player password reset link (15 min TTL) |
| `sendAccountActivationEmail()` | `src/lib/player-reset-password.ts` | New player account invite / set-password link (72 h TTL) |

All booking-related sends are **non-fatal**: errors are logged to the server console but never cause the API request to fail.

---

## Booking email types

Used by `sendBookingEmail` and `sendLessonEventEmails`:

| Type | Meaning | Typical trigger |
|---|---|---|
| `staff_confirmed` | Staff created or rescheduled a booking; payment still pending | Staff booking modal |
| `pending` | Player submitted payment proof; awaiting staff review | Player uploads proof |
| `approved` | Staff approved payment | Admin approve-payment action |
| `rejected` | Staff rejected payment proof | Admin reject-payment action |
| `auto_confirmed` | SePay webhook matched payment automatically | Sepay auto-payment enabled |
| `cancelled` | Booking or registration was cancelled | Staff or player cancel |

### Booking labels (used in subject/body)

| `bookingType` | Label in email |
|---|---|
| `court` | court booking |
| `open_play` | open play session |
| `coach` | coaching lesson |

### Lesson recipient roles

`sendLessonEventEmails` sends to up to three roles per event:

| Role | Email source |
|---|---|
| `student` | `player.email` |
| `coach` | `staffMember.email` (coach record) |
| `staff` | `venue.settings.notificationEmail` |

Lesson emails are also written to the `EmailLog` table (`bookingType: "coach"`, `recipientRole`, `emailType`).

---

## Court bookings

### Staff / admin actions

| Trigger | API route | Email type | Recipient | Notes |
|---|---|---|---|---|
| Staff creates single-court booking | `POST /api/staff/bookings` | `staff_confirmed` | Player | Includes **Pay now** button → `/book/pay/:id`. Skipped if player has no email. |
| Staff creates multi-court batch | `POST /api/staff/bookings/batch` | `staff_confirmed` | Player | Pay link points to first booking in group. Total group price in email. |
| Staff reschedules booking | `PATCH /api/staff/bookings/:id` | `staff_confirmed` | Player | Fires on court/date/time/duration change (not on status-only updates). |
| Staff cancels booking | `PATCH /api/staff/bookings/:id` (`status=cancelled`) | `cancelled` | Player | Includes venue, date, time in details. |
| Staff approves payment | `PATCH /api/admin/bookings/:id/approve-payment` | `approved` | Player | Works for single and group bookings. |
| Staff rejects payment | `PATCH /api/admin/bookings/:id/reject-payment` | `rejected` | Player | Includes rejection reason when provided. |

### Player portal actions

| Trigger | API route | Email type | Recipient | Notes |
|---|---|---|---|---|
| Player submits payment proof | `POST /api/public/bookings/:id/proof` | `pending` | Player | Acknowledgement that proof was received. |
| Player cancels paid booking | `DELETE /api/public/bookings/:id` | `cancelled` | Player | Only when cancellation policy allows (paid, confirmed). |
| Player cancels paid group booking | `DELETE /api/public/bookings/:id` | `cancelled` | Player | Cancels entire group; one email to player. |
| Player cancels (legacy auth route) | `DELETE /api/bookings/:id` | `cancelled` | Player | Older player-auth cancel endpoint. |

### SePay auto-payment

| Trigger | Code location | Email type | Recipient | Notes |
|---|---|---|---|---|
| SePay confirms single booking | `src/modules/courtpay/lib/sepay.ts` → `handlePortalBookingPayment` | `auto_confirmed` | Player | Requires `autoPaymentEnabled` + `sepayEnabled` on venue. |
| SePay confirms group booking | Same | `auto_confirmed` | Player | Updates all courts in group. |

### No email sent

| Scenario | Reason |
|---|---|
| Player self-books via portal (`POST /api/public/bookings`) | No email on creation — player pays in-app |
| Player cancels unpaid hold (before payment) | Booking is deleted; no confirmation email |
| Hold expires (`reason=expired_hold`) | Status set to `expired_hold`; no email |
| Staff marks `no_show` | Intentional — player not notified |

---

## Open play sessions

### Staff / admin actions

| Trigger | API route | Email type | Recipient | Notes |
|---|---|---|---|---|
| Staff registers player | `POST /api/admin/open-play/register` | `staff_confirmed` | Player | Pay link → `/book/open-play/pay/:id` |
| Staff cancels registration | `PATCH /api/admin/open-play/:id` (`action=cancel`) | `cancelled` | Player | |
| Staff approves payment | `PATCH /api/admin/open-play/:id/approve-payment` | `approved` | Player | |
| Staff rejects payment | `PATCH /api/admin/open-play/:id/reject-payment` | `rejected` | Player | |

### Player portal actions

| Trigger | API route | Email type | Recipient | Notes |
|---|---|---|---|---|
| Player submits payment proof | `POST /api/public/open-play/:id/proof` | `pending` | Player | |
| Player cancels registration | `DELETE /api/public/open-play/:id` | `cancelled` | Player | Not sent for `expired_hold` reason |

### SePay auto-payment

| Trigger | Code location | Email type | Recipient |
|---|---|---|---|
| SePay confirms open play payment | `sepay.ts` → `handlePortalOpenPlayPayment` | `auto_confirmed` | Player |

### No email sent

| Scenario | Reason |
|---|---|
| Player self-registers (`POST /api/public/open-play`) | No email on creation |
| Hold expires | Status → `expired_hold`; no email |

---

## Coach lessons

### Staff / admin actions

| Trigger | API route | Email type | Recipients | Notes |
|---|---|---|---|---|
| Staff creates lesson | `POST /api/admin/coach-lessons` | `staff_confirmed` | Player + Coach + Staff | Via `sendLessonEventEmails` |
| Staff reschedules lesson | `PATCH /api/admin/coach-lessons/:id` | `staff_confirmed` | Player + Coach + Staff | When `date`, `startTime`, `endTime`, or `coachId` changes |
| Staff cancels lesson (status) | `PATCH /api/admin/coach-lessons/:id` | `cancelled` | Player + Coach + Staff | |
| Staff deletes lesson | `DELETE /api/admin/coach-lessons/:id` | `cancelled` | Player + Coach + Staff | |
| Staff approves payment | `PATCH /api/admin/coach-lessons/:id/approve-payment` | `approved` | Player + Coach + Staff | |
| Staff rejects payment | `PATCH /api/admin/coach-lessons/:id/reject-payment` | `rejected` | Player + Coach + Staff | Includes rejection reason |

### Player portal actions

| Trigger | API route | Email type | Recipients | Notes |
|---|---|---|---|---|
| Player submits payment proof | `POST /api/public/coach-sessions/:id/proof` | `pending` | Player + Coach + Staff | |
| Player self-cancels lesson (>48 h) | `POST /api/public/coach-sessions/:id/cancel` | `cancelled` | Player + Coach + Staff | Credit lessons refund 1 session |

### SePay / credit auto-confirm

| Trigger | Code location | Email type | Recipients | Notes |
|---|---|---|---|---|
| SePay confirms lesson payment | `sepay.ts` → `handlePortalLessonPayment` | `auto_confirmed` | Player + Coach + Staff | Also creates Google Calendar event if coach has sync enabled |
| Player books with coach credit | `src/lib/coach-lesson.ts` | `auto_confirmed` | Player + Coach + Staff | Lesson created as `paid` immediately |

### No email sent

| Scenario | Reason |
|---|---|
| Player books lesson via VietQR (pending approval) | Email fires only after proof submission or SePay match |
| Coach edits own profile via Coach Portal | No booking lifecycle event |

---

## Coach credit packages (SePay)

When a player purchases a coach credit package and SePay auto-confirms:

| Trigger | Code location | Email type | Recipients |
|---|---|---|---|
| SePay confirms credit purchase | `sepay.ts` → `handlePortalCreditPayment` | `auto_confirmed` | Player + Coach + Staff |

Uses `sendBookingEmail` directly (not `sendLessonEventEmails`). No `EmailLog` row for credit purchases.

---

## Account & authentication emails

Separate from booking emails — sent directly via Resend from `src/lib/player-reset-password.ts`.

| Trigger | API route | Subject | Recipient | TTL |
|---|---|---|---|---|
| Player requests password reset | `POST /api/public/auth/reset-password/request` | Reset your CourtPass password | Player (credentials account) | 15 minutes |
| Staff creates player with email | `POST /api/admin/players` | Set up your CourtPass account | New player | 72 hours |

Both emails link to `/book/reset-password/confirm?token=<jwt>`.

Security notes:
- Password reset always returns HTTP 200 (no email enumeration).
- Rate-limited to 1 token per player per 2 minutes.
- Tokens are single-use (tracked in `player_password_reset_tokens`).

---

## Platform billing emails

| Trigger | API route | Subject | Recipient |
|---|---|---|---|
| Manager submits invoice payment proof | `POST /api/admin/manager/billing/invoices/:invoiceId/submit-proof` | `[CourtFlow] Payment proof submitted — {venue} · {amount} VND` | `billingConfig.notificationEmail` (platform superadmin) |

Sent via `sendBillingProofNotification`. Includes links to view the proof image and open the admin billing review page.

---

## Subject line reference

All booking emails use the pattern `[REF] Subject` when a `paymentRef` is present.

### Court / open play (player)

| Type | Subject |
|---|---|
| `staff_confirmed` | Your {court booking \| open play session} is booked — payment pending |
| `pending` | Payment proof received — your {label} is pending review |
| `approved` | Payment approved — your {label} is confirmed |
| `rejected` | Payment proof rejected — action required for your {label} |
| `auto_confirmed` | Payment confirmed — your {label} is booked |
| `cancelled` | Your {label} has been cancelled |

### Coach lessons (by role)

| Type | Student | Coach | Staff |
|---|---|---|---|
| `staff_confirmed` | Your coaching lesson is booked — payment pending | New lesson booked — {student} | [New booking] coaching lesson created — {student} |
| `pending` | Payment proof received… | New lesson booking pending — {student} | [Action required] New coaching lesson pending approval |
| `approved` | Payment approved… | Lesson confirmed — {student} | [Confirmed] coaching lesson approved |
| `rejected` | Payment proof rejected… | Lesson booking rejected — {student} | [Rejected] coaching lesson rejected |
| `auto_confirmed` | Payment confirmed… | Lesson auto-confirmed — {student} | [Auto-confirmed] coaching lesson confirmed via Sepay |
| `cancelled` | Your coaching lesson has been cancelled | Lesson cancelled — {student} | [Cancelled] coaching lesson cancelled |

Lesson `approved` and `auto_confirmed` emails to students and coaches include **Add to Google Calendar** and **Apple Calendar** buttons when `startTimeISO` / `endTimeISO` are provided.

---

## When emails are skipped

An email is never sent when:

1. **Recipient has no email address** — `player.email`, `coach.email`, or `venue.settings.notificationEmail` is null/empty.
2. **SePay auto-payment is disabled** — venue must have both `autoPaymentEnabled` and `sepayEnabled` in settings.
3. **Transfer amount is below booking price** — SePay webhook rejects underpayment.

All skips are logged with `[sendBookingEmail] No email address provided — skipping` or route-specific log lines like `[staffBooking] no email on player`.

---

## Debugging

### Server logs

Search Railway/production logs for:

```
[sendBookingEmail] Sent to=
[staffBooking]
[staffBatchBooking]
[staffEditBooking]
[staffLesson]
[staffEditLesson]
[staffOpenPlayRegister]
[lessonEmail]
[requestPasswordReset]
[sendAccountActivationEmail]
```

### Admin modal debug panel

The **Staff Booking Modal** (`src/components/admin/StaffBookingModal.tsx`) shows a live **Email debug** panel above the Book/Save button. Logic is in `src/lib/staff-booking-email-preview.ts`.

### EmailLog table

Coach lesson sends via `sendLessonEventEmails` write rows to `email_log` with `bookingType`, `bookingId`, `emailType`, `recipientRole`, and `status`. Court and open play emails are **not** currently logged to `EmailLog`.

---

## Source file index

| Area | Primary files |
|---|---|
| Email templates & send | `src/lib/email/send.ts` |
| Resend client | `src/lib/email/client.ts` |
| Court booking (staff) | `src/app/api/staff/bookings/route.ts`, `batch/route.ts`, `[id]/route.ts` |
| Court booking (player) | `src/app/api/public/bookings/[id]/route.ts`, `[id]/proof/route.ts` |
| Court payment (admin) | `src/app/api/admin/bookings/[id]/approve-payment/route.ts`, `reject-payment/route.ts` |
| Open play (staff) | `src/app/api/admin/open-play/register/route.ts`, `[id]/route.ts` |
| Open play (player) | `src/app/api/public/open-play/[id]/route.ts`, `[id]/proof/route.ts` |
| Lessons (staff) | `src/app/api/admin/coach-lessons/route.ts`, `[id]/route.ts` |
| Lessons (player) | `src/app/api/public/coach-sessions/[id]/proof/route.ts`, `cancel/route.ts` |
| Lessons (credit book) | `src/lib/coach-lesson.ts` |
| SePay webhook | `src/modules/courtpay/lib/sepay.ts` |
| Auth emails | `src/lib/player-reset-password.ts` |
| Player creation invite | `src/app/api/admin/players/route.ts` |
| Billing proof | `src/app/api/admin/manager/billing/invoices/[invoiceId]/submit-proof/route.ts` |
| Debug preview | `src/lib/staff-booking-email-preview.ts` |

---

## Related docs

- [`docs/roles-rights-matrix.md`](./roles-rights-matrix.md) — includes a condensed email matrix in the roles doc
