# CourtPay Billing System

Per-venue usage-based billing. Weekly invoices generated automatically every Monday. Venue owners pay Guillaume via VietQR; SePay confirms payment automatically.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Check-in happens (vietqr / cash / subscription)                 │
│  → CheckInRecord written to DB                                   │
└──────────────────────┬───────────────────────────────────────────┘
                       │ every Monday 00:01 UTC
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  CRON  /api/cron/generate-invoices                               │
│  • For each active venue: generateWeeklyInvoice()                │
│  • Mark pending invoices >7 days → "overdue"                     │
│  • Suspend venues with overdue >14 days                          │
└──────────────────────┬───────────────────────────────────────────┘
                       │ invoice created
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Boss Dashboard — Billing tab                                    │
│  • Live current-week counter (no DB write)                       │
│  • Pending invoice card → [Pay now] → VietQR displayed           │
│  • Invoice history with drill-down detail                        │
└──────────────────────┬───────────────────────────────────────────┘
                       │ venue owner scans QR, transfers money
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SePay webhook  /api/webhooks/sepay  POST                        │
│  • extractPaymentRef() matches CF-BILL-XXXX-YYYYWnn              │
│  • handleBillingPayment() confirms invoice, restores suspension  │
│  • emitToVenue("billing:invoice_paid")                           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ socket event received in browser / app
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Boss Dashboard animates "Payment received — thank you!"         │
│  Invoice moves to paid history                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database models

### `BillingConfig` (singleton, id = `"default"`)

| Field | Type | Default | Description |
|---|---|---|---|
| `bankBin` | String | `""` | Guillaume's NAPAS bank BIN (e.g. `970436` for Vietcombank) |
| `bankAccount` | String | `""` | Account number |
| `bankOwner` | String | `""` | Account holder name |
| `defaultBaseRate` | Int | `5000` | VND per check-in, used when no per-venue override |
| `defaultSubAddon` | Int | `1000` | Add-on when player has active subscription |
| `defaultSepayAddon` | Int | `1000` | Add-on when payment was confirmed via SePay (VietQR) |

### `VenueBillingRate` (one per venue, optional)

Overrides `BillingConfig` defaults for a specific venue.

| Field | Type | Default |
|---|---|---|
| `venueId` | String (unique FK) | — |
| `baseRatePerCheckin` | Int | `5000` |
| `subscriptionAddon` | Int | `1000` |
| `sepayAddon` | Int | `1000` |

### `BillingInvoice`

One invoice per venue per calendar week.

| Field | Type | Notes |
|---|---|---|
| `venueId` | FK → Venue | |
| `weekStartDate` | DateTime | Monday 00:00:00 local |
| `weekEndDate` | DateTime | Sunday 23:59:59 local |
| `totalCheckins` | Int | Count of billed check-ins (excludes `subscription_free`) |
| `subscriptionCheckins` | Int | Check-ins where player had active sub |
| `sepayCheckins` | Int | Check-ins paid via VietQR |
| `baseAmount` | Int | `totalCheckins × baseRate` |
| `subscriptionAmount` | Int | `subscriptionCheckins × subAddon` |
| `sepayAmount` | Int | `sepayCheckins × sepayAddon` |
| `totalAmount` | Int | Sum of all three |
| `status` | String | `"pending"` / `"overdue"` / `"paid"` |
| `paymentRef` | String (unique) | `CF-BILL-{SHORT}-{YEAR}W{WW}` |
| `paidAt` | DateTime? | Set when paid |
| `confirmedBy` | String? | `"sepay"` or `"manual_admin"` |

**Unique constraint:** `(venueId, weekStartDate)` — safe to call `generateWeeklyInvoice` multiple times.

### `BillingLineItem`

One row per check-in per invoice. Used for audit; the API only returns totals.

### `Venue.billingStatus`

`"active"` (default) or `"suspended"`. Suspension blocks check-in and registration APIs.

---

## Rate resolution

```
getBillingRates(venueId):
  1. Look up VenueBillingRate for this venue
     → if found: use custom rates
  2. Look up BillingConfig "default"
     → if found: use defaultBaseRate / defaultSubAddon / defaultSepayAddon
  3. Hard fallback: 5000 / 1000 / 1000
```

---

## Line-item calculation

For each `CheckInRecord` in the week:

```
hasSubscription = player has ≥1 active PlayerSubscription
isSepayPayment  = checkIn.source === "vietqr"

subAmount   = hasSubscription ? subAddon : 0
sepayAmount = isSepayPayment  ? sepayAddon : 0
lineTotal   = baseRate + subAmount + sepayAmount
```

**Excluded from billing:** check-ins with `source = "subscription_free"`.

---

## Payment reference format

```
CF-BILL-{SHORT}-{YEAR}W{WW}

SHORT = first 4 chars of venue name, uppercased, spaces removed
YEAR  = 4-digit year
WW    = ISO week number, zero-padded to 2 digits

Examples:
  "MM Pickleball"  → CF-BILL-MMPI-2026W16
  "Saigon Padel"   → CF-BILL-SAIG-2026W16
  "A"              → CF-BILL-A-2026W16
```

---

## SePay webhook flow for billing

```
POST /api/webhooks/sepay
  body: { content: "...CF-BILL-MMPI-2026W16...", transferAmount: 846000 }

1. validateSepayWebhook(headers) → check SEPAY_WEBHOOK_SECRET
2. extractPaymentRef(content)   → "CF-BILL-MMPI-2026W16"
3. ref.startsWith("CF-BILL-")   → route to handleBillingPayment()
4. Find BillingInvoice by paymentRef
   • Must have status "pending" or "overdue"
5. Validate amount:
   • transferAmount >= invoice.totalAmount - 5000  (±5,000 VND tolerance)
6. Update invoice: status="paid", paidAt=now, confirmedBy="sepay"
7. If venue was "suspended": restore to "active"
8. emitToVenue(venueId, "billing:invoice_paid", { invoiceId, amount, ... })
9. Return { matched: true }
```

---

## Weekly cron

**Schedule:** `1 0 * * 1` (Monday 00:01 UTC, configured in `vercel.json`)

**Auth:** `Authorization: Bearer ${CRON_SECRET}`

**Steps:**
1. Compute previous week bounds (Mon 00:00 → Sun 23:59)
2. Iterate all `active` venues → `generateWeeklyInvoice()` (idempotent)
3. `UPDATE billing_invoices SET status='overdue' WHERE status='pending' AND created_at < now - 7 days`
4. Find venues with overdue invoices older than 14 days → `billingStatus = "suspended"`

---

## Suspension lifecycle

```
Invoice created (pending)
  → 7 days pass without payment
  → cron marks "overdue"
  → 14 days total pass
  → cron suspends venue (billingStatus = "suspended")
  → kiosk check-in returns 403 VENUE_SUSPENDED
  → staff dashboard shows amber banner
  → venue boss pays via QR or admin marks paid manually
  → billingStatus restored to "active" immediately
```

---

## API reference

### Staff (boss) endpoints — require `requireStaff`

| Method | Path | Returns |
|---|---|---|
| GET | `/api/staff/boss-dashboard/billing/current?venueId=` | Current week live usage |
| GET | `/api/staff/boss-dashboard/billing/invoices?venueId=` | All invoices list |
| GET | `/api/staff/boss-dashboard/billing/invoices/:id` | Invoice detail |
| GET | `/api/staff/boss-dashboard/billing/invoices/:id/qr` | VietQR data |

**QR endpoint response:**
```json
{
  "qrUrl": "https://img.vietqr.io/image/970436-...",
  "amount": 846000,
  "reference": "CF-BILL-MMPI-2026W16",
  "status": "pending"
}
```
Returns `503` if `BillingConfig` has no bank details set.

### Admin (superadmin) endpoints — require `requireSuperAdmin`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/billing/config` | Get BillingConfig |
| PUT | `/api/admin/billing/config` | Upsert BillingConfig (bank + rates) |
| GET | `/api/admin/billing/overview` | All venues with status + summary |
| GET | `/api/admin/billing/revenue` | Guillaume's revenue totals |
| GET | `/api/admin/billing/venue/:venueId` | Venue billing detail |
| PUT | `/api/admin/billing/venue/:venueId/rates` | Set custom rates |
| DELETE | `/api/admin/billing/venue/:venueId/rates` | Remove custom rates (revert to defaults) |
| POST | `/api/admin/billing/venue/:venueId/invoices/:invoiceId/mark-paid` | Manual mark paid |

---

## Tests to pass (coverage checklist)

### `src/lib/billing.test.ts`

#### `getWeekNumber`
- [ ] Known date: 2026-04-14 (Mon) → week 16
- [ ] Known date: 2026-12-31 → week 53 or 1 depending on year (ISO edge case)
- [ ] First day of year that is a Thursday → week 1

#### `getWeekBounds`
- [ ] Monday as input → weekStart = same day 00:00:00, weekEnd = Sunday 23:59:59
- [ ] Sunday as input → weekStart = previous Monday 00:00:00
- [ ] Midweek as input → correct Mon→Sun bounds

#### `computeLineItems` (via `getCurrentWeekUsage` / `generateWeeklyInvoice`)
- [ ] Cash check-in (no sub, no vietqr) → base rate only
- [ ] VietQR check-in (no sub) → base + sepay addon
- [ ] Cash check-in with subscription → base + sub addon
- [ ] VietQR check-in with subscription → base + sub + sepay (all three)
- [ ] Zero check-ins → totalAmount = 0, invoice auto-marked "paid"
- [ ] `subscription_free` source excluded from billing

#### `generateWeeklyInvoice`
- [ ] Idempotent: second call with same venueId + weekStart returns existing invoice
- [ ] Payment ref format matches `CF-BILL-{VENUESHORT}-{YEAR}W{WW}`
- [ ] Venue name with spaces → short code removes spaces

### `src/modules/courtpay/lib/payment-reference.test.ts`

- [ ] `extractPaymentRef("pay CF-BILL-MMPI-2026W16 thx")` → `"CF-BILL-MMPI-2026W16"`
- [ ] `extractPaymentRef("CF-SUB-ABC123")` → `"CF-SUB-ABC123"`
- [ ] `extractPaymentRef("CF-SES-XY3456")` → `"CF-SES-XY3456"`
- [ ] `extractPaymentRef("no ref here")` → `null`
- [ ] `extractPaymentRef("CF-BILL-A-2026W9")` → matches single-char venue code
- [ ] `extractPaymentRef("CF-BILL-MMPI-2026W16 CF-SUB-ABC123")` → billing ref takes priority

### `src/modules/courtpay/lib/sepay.billing.test.ts`

- [ ] `CF-BILL-` ref → routes to billing handler, not regular payment handler
- [ ] Invoice not found → `{ matched: false }`
- [ ] Invoice already paid → `{ matched: false }`
- [ ] Transfer amount exact match → `{ matched: true }`, invoice updated
- [ ] Transfer amount within tolerance (−4,999 VND) → `{ matched: true }`
- [ ] Transfer amount below tolerance (−5,001 VND) → `{ matched: false }`
- [ ] Suspended venue → restored to "active" on payment
- [ ] Non-suspended venue → venue not touched on payment
- [ ] `emitToVenue` called with correct event and payload

### `src/app/api/admin/billing/config.test.ts`

- [ ] GET without auth → 401
- [ ] GET with superadmin → returns config (auto-creates default if missing)
- [ ] PUT without auth → 401
- [ ] PUT with superadmin → persists bank details and rates

### `src/app/api/admin/billing/mark-paid.test.ts`

- [ ] POST without auth → 401
- [ ] POST on non-existent invoice → 404
- [ ] POST on wrong venue → 404
- [ ] POST on already-paid invoice → 400
- [ ] POST on pending invoice → sets paid, confirmedBy="manual_admin"
- [ ] POST on suspended venue → restores to active
