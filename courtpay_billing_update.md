Build the CourtPay billing system.
Two parts:
1. Boss dashboard — new Billing tab
2. Super admin — new CourtPay Billing page

Per-player usage-based billing.
Weekly invoices. VietQR payment.
Confirmed automatically via SePay webhook.
No minimum fees. No flat monthly charges.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Guillaume (super admin) charges venues:
  Base rate:          5,000 VND per check-in
  Subscription add-on:1,000 VND per check-in
                      where player has
                      active subscription
  SePay add-on:       1,000 VND per check-in
                      where payment was
                      confirmed via SePay
                      (not cash)

Rates are set per venue by super admin.
Default rates apply to all new venues.
Venue owner sees their usage and pays
Guillaume weekly via VietQR in their
boss dashboard.
Guillaume's SePay webhook confirms
their payment automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — DATABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to schema.prisma:

model VenueBillingRate {
  id                    String   @id @default(cuid())
  venueId               String   @unique
  baseRatePerCheckin    Int      @default(5000)
  subscriptionAddon     Int      @default(1000)
  sepayAddon            Int      @default(1000)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  venue Venue @relation(
    fields: [venueId], references: [id]
  )
}

model BillingInvoice {
  id                  String    @id @default(cuid())
  venueId             String
  weekStartDate       DateTime
  // Monday 00:00:00
  weekEndDate         DateTime
  // Sunday 23:59:59
  
  totalCheckins       Int       @default(0)
  subscriptionCheckins Int      @default(0)
  sepayCheckins       Int       @default(0)
  
  baseAmount          Int       @default(0)
  // totalCheckins × baseRate
  subscriptionAmount  Int       @default(0)
  // subscriptionCheckins × subscriptionAddon
  sepayAmount         Int       @default(0)
  // sepayCheckins × sepayAddon
  totalAmount         Int       @default(0)
  // sum of all three
  
  status              String    @default("pending")
  // "pending" | "paid" | "overdue"
  paymentRef          String?   @unique
  // CF-BILL-[venueCode]-[yyyyWnn]
  // e.g. CF-BILL-MM-2026W16
  paidAt              DateTime?
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  venue    Venue         @relation(
    fields: [venueId], references: [id]
  )
  lineItems BillingLineItem[]
}

model BillingLineItem {
  id              String   @id @default(cuid())
  invoiceId       String
  checkInRecordId String
  // links to CheckInRecord
  playerId        String
  checkedInAt     DateTime
  
  baseRate        Int
  subscriptionAddon Int    @default(0)
  // 0 if no subscription
  sepayAddon      Int      @default(0)
  // 0 if cash payment
  lineTotal       Int
  // sum of applicable rates

  invoice BillingInvoice @relation(
    fields: [invoiceId], references: [id]
  )
}

Run prisma migrate after schema changes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — BILLING CALCULATION LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE /lib/billing.ts

━━━━━━━━━━━━━━━━
WEEKLY INVOICE GENERATION
━━━━━━━━━━━━━━━━

export async function generateWeeklyInvoice(
  venueId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<BillingInvoice> {

  // 1. Get venue billing rates
  const rates = await prisma.venueBillingRate
    .findUnique({ where: { venueId } })
  
  // Use defaults if no rates set
  const baseRate = rates?.baseRatePerCheckin
    ?? 5000
  const subAddon = rates?.subscriptionAddon
    ?? 1000
  const sepayAddon = rates?.sepayAddon
    ?? 1000

  // 2. Get all check-ins for this week
  const checkIns = await prisma
    .checkInRecord.findMany({
      where: {
        venueId,
        checkedInAt: {
          gte: weekStart,
          lte: weekEnd,
        },
        source: { not: "subscription_free" }
        // only count paid check-ins
      },
      include: {
        player: {
          include: {
            subscriptions: {
              where: { status: "active" }
            }
          }
        },
        payment: true
        // the PendingPayment record
      }
    })

  // 3. Calculate line items
  let totalCheckins = 0
  let subscriptionCheckins = 0
  let sepayCheckins = 0
  let totalAmount = 0
  const lineItems = []

  for (const checkIn of checkIns) {
    totalCheckins++
    
    const hasSubscription =
      checkIn.player.subscriptions.length > 0
    
    const isSepayPayment =
      checkIn.payment?.paymentMethod
        === "vietqr" &&
      checkIn.payment?.confirmedBy
        === "sepay"

    const subAmount = hasSubscription
      ? subAddon : 0
    const sepayAmount = isSepayPayment
      ? sepayAddon : 0
    const lineTotal =
      baseRate + subAmount + sepayAmount

    if (hasSubscription) subscriptionCheckins++
    if (isSepayPayment) sepayCheckins++
    totalAmount += lineTotal

    lineItems.push({
      checkInRecordId: checkIn.id,
      playerId: checkIn.playerId,
      checkedInAt: checkIn.checkedInAt,
      baseRate,
      subscriptionAddon: subAmount,
      sepayAddon: sepayAmount,
      lineTotal,
    })
  }

  // 4. Generate reference code
  const weekNum = getWeekNumber(weekStart)
  const year = weekStart.getFullYear()
  const venue = await prisma.venue
    .findUnique({ where: { id: venueId } })
  const ref =
    `CF-BILL-${venue.venueCode}-${year}W${weekNum}`

  // 5. Create invoice + line items
  const invoice = await prisma
    .billingInvoice.create({
      data: {
        venueId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        totalCheckins,
        subscriptionCheckins,
        sepayCheckins,
        baseAmount: totalCheckins * baseRate,
        subscriptionAmount:
          subscriptionCheckins * subAddon,
        sepayAmount: sepayCheckins * sepayAddon,
        totalAmount,
        status: totalAmount === 0
          ? "paid" : "pending",
        // zero invoices auto-marked paid
        paymentRef: ref,
        lineItems: { create: lineItems }
      },
      include: { lineItems: true }
    })

  return invoice
}

━━━━━━━━━━━━━━━━
WEEK NUMBER HELPER
━━━━━━━━━━━━━━━━

function getWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 -
    (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(),
    0, 4)
  return 1 + Math.round(
    ((d.getTime() - week1.getTime())
      / 86400000 - 3 +
      (week1.getDay() + 6) % 7) / 7
  )
}

━━━━━━━━━━━━━━━━
CURRENT WEEK LIVE COUNTER
━━━━━━━━━━━━━━━━

export async function getCurrentWeekUsage(
  venueId: string
): Promise<{
  totalCheckins: number
  subscriptionCheckins: number
  sepayCheckins: number
  estimatedTotal: number
  weekStart: Date
  weekEnd: Date
}> {
  // Get Monday of current week
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() -
    day + (day === 0 ? -6 : 1)
  const weekStart = new Date(
    now.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // Same calculation as invoice
  // but without creating a record
  // ... same logic as above ...
  
  return {
    totalCheckins,
    subscriptionCheckins,
    sepayCheckins,
    estimatedTotal,
    weekStart,
    weekEnd,
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — WEEKLY CRON JOB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE /api/cron/generate-invoices/route.ts

Runs every Sunday at 23:59
(or Monday 00:01 to be safe)

Add to vercel.json:
{
  "crons": [
    {
      "path": "/api/cron/generate-invoices",
      "schedule": "1 0 * * 1"
    },
    {
      "path": "/api/cron/expire-subscriptions",
      "schedule": "0 0 * * *"
    }
  ]
}

Handler logic:
  Validate CRON_SECRET header
  
  Get all active venues
  For each venue:
    Calculate previous week
    (Mon 00:00 → Sun 23:59)
    
    Check if invoice already exists
    for this week + venue
    (idempotent — safe to re-run)
    
    If not exists:
      Call generateWeeklyInvoice()
    
    If totalAmount > 0:
      Mark status: "pending"
      (zero-amount invoices auto-paid)

Also update overdue status:
  Find all invoices where:
    status = "pending"
    createdAt < now - 7 days
  Update status: "overdue"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — SEPAY WEBHOOK UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update existing /api/webhooks/sepay/
route.ts to also handle billing payments.

In the webhook handler, after parsing
the content field:

Check if reference matches billing format:
  if (content.startsWith("CF-BILL-")) {
    → handle billing payment
  } else {
    → existing check-in/subscription
      payment handling (unchanged)
  }

Billing payment handler:

  Find BillingInvoice where:
    paymentRef = content (from webhook)
    status = "pending" OR "overdue"
  
  If not found: log and return 200
  (could be unrelated transfer)
  
  Validate amount:
    Allow ±5,000 VND tolerance
    (slight rounding differences)
  
  If found and amount valid:
    Update invoice:
      status: "paid"
      paidAt: now()
    
    Emit socket event to boss dashboard:
      billing:invoice_paid → {
        invoiceId,
        venueId,
        amount,
        weekStartDate
      }
  
  Always return 200

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 5 — BOSS DASHBOARD: BILLING TAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add "Billing" tab to boss dashboard.

Updated bottom navigation:
  Today | History | Sessions | Billing
                               | Settings

Route: /staff/dashboard/boss/billing

━━━━━━━━━━━━━━━━
SECTION 1 — CURRENT WEEK LIVE COUNTER
━━━━━━━━━━━━━━━━

Live usage counter — updates in
real time as check-ins happen.

  ┌─────────────────────────────────┐
  │ This week                       │
  │ Mon 14 Apr → Sun 20 Apr         │
  │                                 │
  │ Check-ins        142            │
  │ Base (×5,000)    710,000 VND    │
  │                                 │
  │ Subscriptions    38             │
  │ Add-on (×1,000)  38,000 VND     │
  │                                 │
  │ Auto payments    98             │
  │ Add-on (×1,000)  98,000 VND     │
  │                                 │
  │ ─────────────────────────────── │
  │ Estimated total  846,000 VND    │
  │                                 │
  │ Invoice generated Sunday        │
  └─────────────────────────────────┘

Show rates used (small, muted):
  "Base: 5,000đ · Sub: +1,000đ ·
   Auto pay: +1,000đ per check-in"

━━━━━━━━━━━━━━━━
SECTION 2 — PENDING INVOICE (if any)
━━━━━━━━━━━━━━━━

Shown prominently when an invoice
is pending or overdue.

PENDING state:
  ┌─────────────────────────────────┐
  │ Invoice due            ⏳       │
  │ Week 7-13 Apr 2026              │
  │                                 │
  │ 134 check-ins                   │
  │ Total: 782,000 VND              │
  │                                 │
  │ [Pay now — scan QR]             │
  └─────────────────────────────────┘

OVERDUE state (same but amber/red):
  ┌─────────────────────────────────┐
  │ Invoice overdue         ⚠️      │
  │ Week 31 Mar-6 Apr 2026          │
  │                                 │
  │ Total: 651,000 VND              │
  │ Overdue by 3 days               │
  │                                 │
  │ [Pay now — scan QR]             │
  └─────────────────────────────────┘

[Pay now — scan QR] expands inline:

  ┌─────────────────────────────────┐
  │ Scan to pay                     │
  │                                 │
  │    [  VietQR CODE  ]            │
  │    (Guillaume's account)        │
  │                                 │
  │ Amount: 782,000 VND             │
  │ Ref: CF-BILL-MM-2026W14         │
  │                                 │
  │ "Payment confirmed automatically│
  │  once received"                 │
  │                                 │
  │ Waiting for payment...          │
  │ (pulsing indicator)             │
  └─────────────────────────────────┘

On payment confirmed (socket event):
  Green flash
  "Payment received — thank you!"
  Invoice moves to paid history
  QR collapses

━━━━━━━━━━━━━━━━
SECTION 3 — INVOICE HISTORY
━━━━━━━━━━━━━━━━

List of all past invoices:

  Week 7-13 Apr    782,000 VND  ✓ Paid
  Week 31 Mar-6    651,000 VND  ✓ Paid
  Week 24-30 Mar   590,000 VND  ✓ Paid
  Week 17-23 Mar   720,000 VND  ✓ Paid

Each row tappable → invoice detail:

  Invoice detail bottom sheet:
  
  Week 7-13 Apr 2026
  ─────────────────────────────
  Total check-ins:    134
  Base charges:       670,000 VND
  Subscription add-on: 42,000 VND
  SePay add-on:        70,000 VND
  ─────────────────────────────
  Total:              782,000 VND
  Paid: 14 Apr 2026 09:32
  Ref: CF-BILL-MM-2026W14

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 6 — BILLING TAB API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GET /api/staff/boss-dashboard/billing/current
  Auth: staff
  Query: { venueId }
  Returns: getCurrentWeekUsage() result
  Live data — no caching

GET /api/staff/boss-dashboard/billing/invoices
  Auth: staff
  Query: { venueId }
  Returns: all invoices for venue
  ordered by weekStartDate DESC

GET /api/staff/boss-dashboard/billing/
  invoices/[invoiceId]
  Auth: staff
  Returns: invoice detail + line items
  summary (not every line — just totals)

GET /api/staff/boss-dashboard/billing/
  invoices/[invoiceId]/qr
  Auth: staff
  Returns: {
    vietQR: string,  // QR data URL
    amount: number,
    reference: string,
    bankAccount: string,
    // Guillaume's bank account
    // stored in env var
  }

  Guillaume's bank details stored in:
    GUILLAUME_BANK_ACCOUNT=
    GUILLAUME_BANK_NAME=
    GUILLAUME_BANK_OWNER=
  
  These are Guillaume's personal/business
  bank details — hardcoded in env,
  not in the database.
  Never shown to venues except as
  a QR code for payment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 7 — SUPER ADMIN: COURTPAY BILLING PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add new menu item to super admin
dashboard:

Admin menu:
  Venues
  Staff
  Sessions
  CourtPay Billing   ← NEW
  Settings

Route: /admin/courtpay-billing

━━━━━━━━━━━━━━━━
SECTION 1 — DEFAULT RATES
━━━━━━━━━━━━━━━━

At top of page — global defaults
applied to new venues:

  ┌─────────────────────────────────┐
  │ Default billing rates           │
  │ Applied to all new venues       │
  │                                 │
  │ Base rate per check-in          │
  │ [5,000        ] VND             │
  │                                 │
  │ Subscription add-on             │
  │ [1,000        ] VND             │
  │                                 │
  │ SePay auto-payment add-on       │
  │ [1,000        ] VND             │
  │                                 │
  │ [Save defaults]                 │
  └─────────────────────────────────┘

These defaults are stored in env
or a GlobalSettings table:
  DEFAULT_BASE_RATE=5000
  DEFAULT_SUBSCRIPTION_ADDON=1000
  DEFAULT_SEPAY_ADDON=1000

━━━━━━━━━━━━━━━━
SECTION 2 — ALL VENUES OVERVIEW
━━━━━━━━━━━━━━━━

Summary table of all venues:

  Venue          This week   Status    Action
  ─────────────────────────────────────────
  MM Pickleball  846,000đ    Pending   [View]
  Saigon Padel   510,000đ    Paid ✓    [View]
  Hanoi Courts   230,000đ    Overdue ⚠ [View]
  Test Venue     0đ          —         [View]

Summary cards above table:

  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Active   │ │ This week│ │ Overdue  │
  │ venues   │ │ revenue  │ │          │
  │    4     │ │ 1,586,000│ │    1     │
  └──────────┘ └──────────┘ └──────────┘

━━━━━━━━━━━━━━━━
SECTION 3 — PER VENUE BILLING SETTINGS
━━━━━━━━━━━━━━━━

Tapping [View] on a venue row
opens venue billing detail panel:

  ┌─────────────────────────────────────┐
  │ MM Pickleball — Billing             │
  ├─────────────────────────────────────┤
  │ RATES (override defaults)           │
  │                                     │
  │ Base rate per check-in              │
  │ [5,000        ] VND                 │
  │                                     │
  │ Subscription add-on                 │
  │ [1,000        ] VND                 │
  │                                     │
  │ SePay add-on                        │
  │ [1,000        ] VND                 │
  │                                     │
  │ [Save rates for this venue]         │
  │ [Reset to defaults]                 │
  ├─────────────────────────────────────┤
  │ CURRENT WEEK                        │
  │ 142 check-ins · 846,000 VND est.    │
  ├─────────────────────────────────────┤
  │ INVOICES                            │
  │                                     │
  │ W16 14-20 Apr  846,000  Pending     │
  │ W15  7-13 Apr  782,000  Paid ✓      │
  │ W14 31-6  Apr  651,000  Paid ✓      │
  │                                     │
  │ [Mark as paid manually]             │
  │ (emergency override for cash/bank   │
  │  transfer outside SePay)            │
  └─────────────────────────────────────┘

[Mark as paid manually]:
  Confirmation dialog:
  "Mark invoice W16 as paid manually?
   This cannot be undone."
  [Confirm] [Cancel]
  
  Sets invoice status: "paid"
  Sets confirmedBy: "manual_admin"
  Sets paidAt: now()

━━━━━━━━━━━━━━━━
SECTION 4 — REVENUE SUMMARY
━━━━━━━━━━━━━━━━

Below venue table:

  ┌─────────────────────────────────┐
  │ Your revenue                    │
  │                                 │
  │ This week (est):  1,586,000 VND │
  │ This month:       5,240,000 VND │
  │ All time:        18,920,000 VND │
  │                                 │
  │ Paid this month:  4,654,000 VND │
  │ Outstanding:        586,000 VND │
  └─────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 8 — SUPER ADMIN API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All require super_admin role.

GET /api/admin/billing/overview
  Returns all venues with:
    current week usage
    latest invoice status
    outstanding balance
  Plus summary totals

GET /api/admin/billing/venue/[venueId]
  Returns venue billing detail:
    current rates
    current week usage
    all invoices

PUT /api/admin/billing/venue/[venueId]/rates
  Body: {
    baseRatePerCheckin,
    subscriptionAddon,
    sepayAddon
  }
  Creates or updates VenueBillingRate
  Returns: updated rates

DELETE /api/admin/billing/venue/[venueId]/rates
  Deletes custom rates
  Venue falls back to defaults

POST /api/admin/billing/venue/[venueId]/
  invoices/[invoiceId]/mark-paid
  Auth: super_admin
  Manually marks invoice as paid
  confirmedBy: "manual_admin"

GET /api/admin/billing/revenue
  Returns Guillaume's revenue summary:
    this week, this month, all time,
    paid, outstanding

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 9 — ENVIRONMENT VARIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to .env:

  GUILLAUME_BANK_ACCOUNT=
  // Guillaume's bank account number

  GUILLAUME_BANK_NAME=
  // e.g. "Vietcombank"

  GUILLAUME_BANK_OWNER=
  // Account owner name

  BILLING_DEFAULT_BASE_RATE=5000
  BILLING_DEFAULT_SUB_ADDON=1000
  BILLING_DEFAULT_SEPAY_ADDON=1000

  CRON_SECRET=
  // existing — used for invoice cron too

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 10 — ACCOUNT SUSPENDED STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When invoice is overdue > 7 days:
  Cron job sets venue.billingStatus:
    "suspended"

When venue billingStatus = "suspended":

  Kiosk entrance screen shows:
  "Service paused
   Please contact your venue admin"
  Check-in button disabled
  
  Staff dashboard shows banner:
  "Account suspended due to
   unpaid invoice.
   Pay in Billing tab to restore."
  
  Boss dashboard billing tab:
  Shows overdue invoice prominently
  [Pay now] still works
  Payment → clears suspension
          → venue.billingStatus: "active"
          → kiosk works again

Add billingStatus to Venue model:
  billingStatus String @default("active")
  // "active" | "suspended"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Check-in flow
  SePay webhook existing logic
    (only ADD billing payment handling)
  Subscription system
  Staff dashboard court management
  Player PWA
  CourtFlow rotation module
  Any existing cron jobs
    (only ADD new cron entry)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY — FILES TO CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE:
  /lib/billing.ts
  /api/cron/generate-invoices/route.ts
  /api/staff/boss-dashboard/billing/
    current/route.ts
  /api/staff/boss-dashboard/billing/
    invoices/route.ts
  /api/staff/boss-dashboard/billing/
    invoices/[invoiceId]/route.ts
  /api/staff/boss-dashboard/billing/
    invoices/[invoiceId]/qr/route.ts
  /api/admin/billing/overview/route.ts
  /api/admin/billing/venue/[venueId]/
    route.ts
  /api/admin/billing/venue/[venueId]/
    rates/route.ts
  /api/admin/billing/venue/[venueId]/
    invoices/[invoiceId]/mark-paid/
    route.ts
  /api/admin/billing/revenue/route.ts
  /app/staff/dashboard/boss/billing/
    page.tsx
  /app/admin/courtpay-billing/page.tsx
  /components/billing/CurrentWeekCard.tsx
  /components/billing/InvoiceCard.tsx
  /components/billing/PaymentQR.tsx
  /components/billing/InvoiceHistory.tsx
  /components/admin/VenueBillingPanel.tsx
  /components/admin/BillingRatesForm.tsx

MODIFY:
  prisma/schema.prisma
    → add VenueBillingRate model
    → add BillingInvoice model
    → add BillingLineItem model
    → add billingStatus to Venue
  
  /api/webhooks/sepay/route.ts
    → add CF-BILL- reference handling
  
  /app/staff/dashboard/boss/page.tsx
    → add Billing tab to navigation
  
  /app/admin/layout.tsx or menu
    → add CourtPay Billing menu item
  
  vercel.json
    → add generate-invoices cron