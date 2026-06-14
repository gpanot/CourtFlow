#June 13,2026

# Booking & Payment Statuses

Reference for court bookings and coach+court sessions in CourtFlow. Both entity types use **two separate fields**: reservation status (`status`) and payment status (`paymentStatus`).

---

## Court booking (`Booking` model)

Schema: `prisma/schema.prisma` → `Booking`, enum `BookingStatus`.

### Reservation status — `status`

| Status | Meaning |
|--------|---------|
| `confirmed` | Default when created. Slot is reserved. |
| `cancelled` | Voided (player cancel within policy, or staff/admin). Sets `cancelledAt`. |
| `completed` | Session happened (typically set by staff/admin after the slot). |
| `no_show` | Player did not show up (staff/admin). |

### Payment status — `paymentStatus`

Free-form string used by the player portal (not a Prisma enum).

| Status | Meaning | Player UI label |
|--------|---------|-----------------|
| `pending` | VietQR payment required. Slot held for **5 minutes** (`holdExpiresAt`). | Pending payment |
| `proof_submitted` | Player uploaded a payment screenshot. Awaiting confirmation. | Verifying |
| `paid` | Payment confirmed (SePay auto-match when venue has auto-payment enabled). | Paid |
| `null` | Possible on older/admin-created bookings without online payment. | Confirmed (fallback) |

### Typical portal flow

```
pending → proof_submitted → paid
   ↓              ↓
(hold expires)  (SePay auto or manual confirm)
(slot freed)
```

**Notes**

- Booking `status` stays `confirmed` through the payment flow. Cancellation is tracked on `status`, not on payment.
- Hold expiry is enforced in the payment UI; expired `pending` rows are cleaned up when someone else tries to book the same slot.
- SePay auto-confirm only transitions `pending` → `paid` (not from `proof_submitted`).

**Key files**

- Create: `src/app/api/public/bookings/route.ts`
- Proof upload: `src/app/api/public/bookings/[id]/proof/route.ts`
- SePay: `src/modules/courtpay/lib/sepay.ts` → `handlePortalBookingPayment`
- Player UI: `src/app/(book)/book/bookings/[id]/page.tsx`, `src/app/(book)/book/pay/[id]/page.tsx`

---

## Coach + court session (`CoachLesson` model)

Schema: `prisma/schema.prisma` → `CoachLesson`, enum `CoachLessonStatus`. A lesson can reserve a court via `courtId` when one is available.

### Reservation status — `status`

| Status | Meaning |
|--------|---------|
| `confirmed` | Default. Lesson scheduled (+ court assigned if available). |
| `completed` | Lesson took place. |
| `cancelled` | Cancelled (admin DELETE or PATCH). |
| `no_show` | Player did not attend. |

### Payment status — `paymentStatus`

Two conventions coexist: **portal/online** (lowercase intermediate states) and **admin/staff** (uppercase paid/unpaid).

#### Portal / online booking

| Status | Meaning |
|--------|---------|
| `pending` | VietQR payment required (5-min hold returned in API response; not stored on the lesson row). |
| `proof_submitted` | Payment proof uploaded. |
| `PAID` | Paid — via SePay auto-match, admin confirmation, or coach credit (`paymentMethod: "credit"`). |

#### Admin / staff-created lessons

| Status | Meaning |
|--------|---------|
| `UNPAID` | Schema default for admin-created lessons. |
| `PAID` | Marked paid manually in admin coaching UI. |

### Typical flows

```
Pay with VietQR:     pending → proof_submitted → PAID
Pay with credit:     PAID (immediately, paymentMethod: "credit")
Admin-created:       UNPAID → PAID (manual in admin)
```

**Key files**

- Create: `src/app/api/public/coach-sessions/route.ts`
- Proof upload: `src/app/api/public/coach-sessions/[id]/proof/route.ts`
- Admin payment: `src/app/api/admin/coach-lessons/[id]/route.ts`
- SePay: `src/modules/courtpay/lib/sepay.ts` → `handlePortalLessonPayment`
- Player UI: `src/app/(book)/book/pay/lesson/[id]/page.tsx`, `src/app/(book)/book/bookings/page.tsx`

---

## Side-by-side comparison

| | Court booking | Coach + court session |
|---|---|---|
| **Reservation statuses** | `confirmed`, `cancelled`, `completed`, `no_show` | Same |
| **Unpaid (online)** | `pending` | `pending` |
| **Proof uploaded** | `proof_submitted` | `proof_submitted` |
| **Paid (online)** | `paid` (lowercase) | `PAID` (uppercase) |
| **Paid (admin/staff)** | — | `PAID` / `UNPAID` |
| **Paid with credit** | N/A | `PAID` + `paymentMethod: "credit"` |
| **Hold timer** | Stored in DB (`holdExpiresAt`) | Returned in API only |

---

## Implementation notes

### Naming inconsistency

Payment status values are **not unified** across entity types:

- Court bookings: `pending`, `proof_submitted`, `paid` (lowercase when paid)
- Coach lessons: `pending`, `proof_submitted`, then `PAID` / `UNPAID` (uppercase)

The player portal `PaymentPill` component maps both `paid` and `PAID` to “Paid”, and `UNPAID` to “Unpaid” (`src/app/(book)/book/bookings/page.tsx`).

### Availability / slot blocking

A court slot is considered taken when:

- Booking `status` is `confirmed` or `completed`, **and**
- Either `holdExpiresAt` is null/expired, **or** `paymentStatus` is not `pending`

See `src/lib/booking.ts` and conflict checks in `src/app/api/public/coach-sessions/route.ts`.

### SePay auto-payment

When the venue has `autoPaymentEnabled` and `sepayEnabled` in settings, incoming transfers matching `paymentRef` and amount can auto-confirm:

- Court booking: `pending` → `paid`
- Coach lesson: `pending` → `PAID` (+ `paidAt`, `paymentMethod: "vietqr"`)

Requires exact or sufficient transfer amount; does not apply from `proof_submitted`.

---

## User journeys

### Journey A — Court booking WITHOUT auto-payment (manual proof)

```
/book                         Player selects venue, date, court, time slot(s)
       ↓
/book/confirm                 Reviews summary (court, time, price breakdown)
       ↓                      Taps "Confirm & Pay"
POST /api/public/bookings     Creates booking:
                                status: "confirmed"
                                paymentStatus: "pending"
                                holdExpiresAt: now + 5 min
                                paymentRef: "CF-BK-xxxxx"
       ↓
/book/pay/[id]                Payment screen shows:
                                • VietQR code (bank, account, amount, paymentRef)
                                • 5-minute countdown timer
                                • Upload area for payment screenshot
```

**Option A — Player uploads proof before timer expires:**

```
Player attaches screenshot → taps "I HAVE PAID"
       ↓
POST /api/public/bookings/[id]/proof
       paymentStatus: "pending" → "proof_submitted"
       holdExpiresAt → null (slot safe)
       ↓
UI: "Verifying payment — venue will verify shortly"
       ↓
Staff reviews proof in admin → confirms
       paymentStatus: "proof_submitted" → "paid"
```

**Option B — Timer expires before payment:**

```
secondsLeft reaches 0
       ↓
Client calls DELETE /api/public/bookings/[id]
       status → "cancelled", slot freed
       ↓
UI: "Payment window expired — slot available for others"

Server-side backup: /api/cron/expire-holds catches any missed client-side cancellations
```

---

### Journey B — Court booking WITH auto-payment (SePay enabled)

Steps 1–3 identical to Journey A.

```
/book/pay/[id]                Payment screen shows:
                                • VietQR code (same as Journey A)
                                • 5-minute countdown timer
                                • NO upload area (hidden when autoPayment = true)
                                • "Waiting for auto-confirmation…" spinner
                                • Client polls GET /api/public/bookings/[id] every 5s
```

**Happy path — SePay confirms within 5 min:**

```
Player scans VietQR in banking app → makes transfer
       ↓
Bank notifies SePay → SePay webhook hits POST /api/webhooks/sepay
       ↓
processSepayWebhook() extracts paymentRef "CF-BK-xxxxx"
handlePortalBookingPayment() checks:
  a. booking exists with paymentStatus "pending"
  b. transferAmount >= priceInCents
  c. venue has autoPaymentEnabled + sepayEnabled
       ↓
paymentStatus: "pending" → "paid"
       ↓
Next client poll detects "paid" → auto-redirects to /book/bookings/[id]
```

**Fallback — Player taps "I HAVE PAID" without screenshot:**

```
POST /api/public/bookings/[id]/proof  body: { proofUrl: "pending_proof" }
       paymentStatus → "proof_submitted", hold cleared
       Falls back to manual staff verification
```

**Timer expires:** Same as Journey A, Option B.

---

### Journey C — Coach lesson booking (VietQR)

Same flow as Journey A/B but uses:

| | Court booking | Coach lesson |
|---|---|---|
| Payment ref prefix | `CF-BK-` | `CF-CL-` |
| Model | `Booking` | `CoachLesson` |
| Paid status | `paid` (lowercase) | `PAID` (uppercase) |
| Payment page | `/book/pay/[id]` | `/book/pay/lesson/[id]` |
| Proof route | `/api/public/bookings/[id]/proof` | `/api/public/coach-sessions/[id]/proof` |
| SePay handler | `handlePortalBookingPayment` | `handlePortalLessonPayment` |

---

### Journey D — Credit package purchase (VietQR)

Same flow as Journey A/B but uses:

| | Court booking | Credit purchase |
|---|---|---|
| Payment ref prefix | `CF-BK-` | `CF-CR-` |
| Model | `Booking` | `PlayerCoachCredit` |
| Payment page | `/book/pay/[id]` | `/book/pay/credit/[id]` |
| Proof route | `/api/public/bookings/[id]/proof` | `/api/public/credits/[id]/proof` |
| SePay handler | `handlePortalBookingPayment` | `handlePortalCreditPayment` |

---

### Journey E — Coach lesson paid with credits

Instant payment — no timer, no VietQR, no proof upload.

```
Player selects coach → selects package → taps "Use Credits"
       ↓
POST /api/public/coach-sessions  body includes paymentMethod: "credit"
       ↓
Server deducts 1 credit from PlayerCoachCredit
Creates CoachLesson with:
  paymentStatus: "PAID"
  paymentMethod: "credit"
       ↓
Redirect to /book/bookings (lesson appears as "Paid" immediately)
```
