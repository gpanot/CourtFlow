---
name: CourtPass Programs Feature
overview: "Build the player-facing Programs feature in CourtPass (PWA at `src/app/(book)/book/`): a new Programs tab, program detail page, enroll-and-pay flow (mirrors the lesson payment flow exactly), waitlist, and session progress screen."
todos:
  - id: migration-payment-ref
    content: Create migration to add payment_ref column to class_pass_payments, run db:migrate + db:pull + prisma generate
    status: completed
  - id: enroll-run-update
    content: Update enrollInRun to accept paymentStatus/paymentRef params and return paymentRef; update generatePaymentRef for CF-PRG prefix; update extractPaymentRef to match CF-PRG; add Sepay webhook handler for program pass payments
    status: completed
  - id: api-routes
    content: "Create 7 new API routes: GET/POST /program-runs, GET /program-runs/[id], POST /program-runs/[id]/enroll, GET /program-passes/[id], POST /program-passes/[id]/proof, POST/GET /program-runs/[id]/waitlist[/status]"
    status: completed
  - id: bottom-nav
    content: Add Programs tab to BottomNav between Bookings and Profile
    status: completed
  - id: programs-listing
    content: Build /book/programs/page.tsx — listing with filter pills, program cards, enrolled badge, full/available states
    status: completed
  - id: program-detail
    content: Build /book/programs/[id]/page.tsx — hero image, badges, curriculum list, capacity bar, CTA button, enroll bottom sheet (order summary), waitlist bottom sheet
    status: completed
  - id: program-pay
    content: Build /book/pay/program/[id]/page.tsx — VietQR + proof upload + Sepay polling (mirrors lesson pay page)
    status: completed
  - id: program-progress
    content: Build /book/programs/[id]/progress/page.tsx — session timeline with Attended/Next/Future states
    status: completed
  - id: bookings-tab
    content: Add Programs sub-tab to /book/bookings/page.tsx, fetch enrolled program runs, link to progress screen
    status: completed
  - id: i18n
    content: Add programs key group to book/en.json and book/vi.json for all new strings
    status: completed
isProject: false
---

# CourtPass Programs Feature

## Scope

Six screens from the spec, all in the existing CourtPass PWA at `src/app/(book)/book/`. No new mobile native screens — the player UI is already a PWA.

## Architecture Overview

```mermaid
flowchart TD
    subgraph nav [Bottom Nav]
        Book --> BookPage["Book (/)"]
        Coaches --> CoachesPage["/coaches"]
        Bookings --> BookingsPage["/bookings"]
        Programs --> ProgramsPage["/programs (NEW)"]
        Profile --> AccountPage["/account"]
    end

    ProgramsPage -->|tap card| DetailPage["/programs/[id] (NEW)"]
    DetailPage -->|Enroll and pay| EnrollSheet["Enroll bottom sheet (NEW)"]
    DetailPage -->|Join waitlist| WaitlistSheet["Waitlist bottom sheet (NEW)"]
    DetailPage -->|View my progress| ProgressPage["/programs/[id]/progress (NEW)"]

    EnrollSheet -->|"UNPAID ProgramPass created"| PayPage["/book/pay/program/[id] (NEW)"]
    PayPage -->|"Proof upload or Sepay webhook"| BookingsPage
```

## Payment Flow (mirrors lesson flow exactly)

The enroll flow reuses the same pattern as `src/app/(book)/book/pay/lesson/[id]/page.tsx`:

1. Player taps "Enroll and pay" → bottom sheet shows order summary + "Confirm and pay" button
2. On confirm: `POST /api/public/program-runs/[id]/enroll` creates a `ProgramPass` (status `active`) + `ProgramPassPayment` (status `UNPAID`) and returns `{ programPassId, paymentRef, priceValue }`
3. Player is navigated to `/book/pay/program/[programPassId]` — a new page nearly identical to the lesson pay page
4. Page shows VietQR + payment ref + 5-min countdown (same hold timer pattern)
5. If `autoPayment` enabled: polls `/api/public/program-passes/[id]` every 5s; on `PAID` → redirect to `/book/bookings`
6. If not: player uploads proof → staff approves in admin → `PAID`

Key difference from the spec's open question: capacity is checked when `enrollInRun` is called (Step 2), not at QR generation. If the run fills before payment completes, the `ProgramPassPayment` remains `UNPAID` and staff handles manually (same as lesson payment).

`enrollInRun` needs a small change: currently it writes `status: "PAID"` immediately. We need to change it to accept an optional `paymentStatus` param and default to `"UNPAID"` for the CourtPass flow.

## Files to Create / Modify

### 1. Database — add `paymentRef` to `ProgramPassPayment`

The lesson pay page polls by `paymentRef`. `ProgramPassPayment` has no `paymentRef` column yet. Need a migration:

```sql
-- migrate:up
ALTER TABLE class_pass_payments
  ADD COLUMN IF NOT EXISTS payment_ref TEXT UNIQUE;

-- migrate:down
ALTER TABLE class_pass_payments DROP COLUMN IF EXISTS payment_ref;
```

Then `db:migrate` → `db:pull` → `prisma generate`.

### 2. Update `enrollInRun` in [`src/lib/program-run.ts`](src/lib/program-run.ts)

- Accept `paymentStatus?: "PAID" | "UNPAID"` (default `"UNPAID"` for portal, admin passes `"PAID"`)
- Accept `paymentRef?: string` and store it on `ProgramPassPayment`
- Return `{ programPassId, paymentId, paymentRef, enrolledCount, maxCapacity }`

### 3. Update `generatePaymentRef` in [`src/modules/courtpay/lib/payment-reference.ts`](src/modules/courtpay/lib/payment-reference.ts)

Add `"program-pass"` type → prefix `CF-PRG`. Add collision check against `class_pass_payments.payment_ref`.

### 4. New API routes (all under `src/app/api/public/`)

- `GET /program-runs?venueId=` — list upcoming/in-progress runs with `enrolledCount`, `passType`, `instances`, current player's enrollment status
- `GET /program-runs/[id]` — single run detail, full instance list, player enrollment + waitlist status  
- `POST /program-runs/[id]/enroll` — calls `enrollInRun` with `paymentStatus: "UNPAID"`, generates `paymentRef`, returns `{ programPassId, paymentRef, priceValue }`
- `GET /program-passes/[id]` — polling endpoint: returns `{ paymentStatus }` (used by pay page to detect `PAID`)
- `POST /program-passes/[id]/proof` — upload payment proof image (mirrors `coach-sessions/[id]/proof`)
- `POST /program-runs/[id]/waitlist` — write `ProgramRunWaitlistEntry` row
- `GET /program-runs/[id]/waitlist/status` — whether current player is on waitlist

All routes use the existing player JWT middleware (`requirePlayerAuth` from `src/lib/player-auth.ts`).

### 5. Sepay webhook handler — [`src/modules/courtpay/lib/sepay.ts`](src/modules/courtpay/lib/sepay.ts)

Add a `handleProgramPassPayment` handler (analogous to `handlePortalBookingPayment`). Match on `CF-PRG-` prefix from `extractPaymentRef`. On match: update `ProgramPassPayment.status = PAID`, `paidAt = now()`, `confirmedBy = "sepay"`.

Update `extractPaymentRef` in `payment-reference.ts` to also match `CF-PRG` references.

### 6. Bottom nav — [`src/app/(book)/book/components/BottomNav.tsx`](src/app/(book)/book/components/BottomNav.tsx)

Add Programs tab between Bookings and Profile:
```ts
{ labelKey: "nav.programs", href: "/book/programs", icon: ProgramsIcon, requiresAuth: false, coachOnly: false }
```

### 7. New PWA screens

- [`src/app/(book)/book/programs/page.tsx`](src/app/(book)/book/programs/page.tsx) — Screen 1: listing with filter pills, program cards, enrolled badge
- [`src/app/(book)/book/programs/[id]/page.tsx`](src/app/(book)/book/programs/[id]/page.tsx) — Screen 2: detail + CTA + bottom sheets for enroll/waitlist
- [`src/app/(book)/book/pay/program/[id]/page.tsx`](src/app/(book)/book/pay/program/[id]/page.tsx) — Screen 3 payment: VietQR + proof upload + Sepay polling (copy from lesson pay page, adapt for `ProgramPass`)
- [`src/app/(book)/book/programs/[id]/progress/page.tsx`](src/app/(book)/book/programs/[id]/progress/page.tsx) — Screen 5: session timeline with Attended/Next/Future states

Screen 4 (waitlist) is a bottom sheet within the detail page, not a separate route.

### 8. Bookings tab — [`src/app/(book)/book/bookings/page.tsx`](src/app/(book)/book/bookings/page.tsx)

Add a fourth `"programs"` sub-tab. Fetch enrolled programs from `GET /api/public/program-runs?enrolled=true`. Cards link to `/book/programs/[runId]/progress`.

### 9. i18n

Add a `programs` key group to:
- [`src/i18n/locales/book/en.json`](src/i18n/locales/book/en.json)
- [`src/i18n/locales/book/vi.json`](src/i18n/locales/book/vi.json)

Keys needed: `nav.programs`, `programs.title`, `programs.filterAll`, `programs.filterBeginner`, etc., `programs.full`, `programs.enrolled`, `programs.spotsLeft`, `programs.enroll`, `programs.joinWaitlist`, `programs.viewProgress`, `programs.emptyState`, `programs.confirmAndPay`, `programs.waitlistJoined`, `programs.sessionAttended`, `programs.sessionNext`, `programs.programComplete`.

## Build Order

1. Migration + `enrollInRun` update + `payment-reference` update + Sepay handler — these are backend foundations, no UI depends on them
2. All 7 new API routes — can be tested with curl/Postman before any UI
3. Bottom nav + Programs listing page (Screen 1)
4. Program detail page (Screen 2) with enroll/waitlist bottom sheets
5. Program pay page (Screen 3) — copy from lesson pay, adapt
6. Session progress page (Screen 5)
7. Bookings tab "Programs" sub-tab
8. i18n strings (can be done in parallel with any step)
