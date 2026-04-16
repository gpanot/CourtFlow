# CourtPay — Product Brief

**Version:** 1.0  
**Date:** April 2026  
**Status:** Implemented, live on production  
**Audience:** Product Manager, Designer, Marketing — for website integration

---

## 1. What is CourtPay?

CourtPay is a **standalone check-in, payment, and subscription module** for racket sport venues (pickleball, badminton, padel). It runs independently from CourtFlow's court rotation engine and handles everything that happens between a player walking through the door and stepping onto the court:

- Player registration
- Session payment (VietQR / cash)
- Subscription package management
- Staff payment approval
- Boss-level revenue dashboard

CourtPay can run as the **sole product** at a venue (no court rotation needed) or alongside CourtFlow's rotation module for a complete end-to-end experience.

---

## 2. Product Gaps CourtPay Fills

### The problem today

Most social badminton/pickleball venues in Vietnam operate with:

| Pain point | Current reality |
|---|---|
| **No check-in system** | Staff manually counts heads, writes names on paper, or uses LINE/Zalo groups |
| **Cash-only collection** | Players pay cash at the door; staff tracks nothing digitally |
| **No subscription management** | "Regular" players get informal discounts via personal relationships; no formal package system |
| **No revenue visibility** | Venue owners ask staff "how much did we make today?" and get an approximate answer |
| **Fragmented tools** | Some use Google Sheets + manual QR codes + chat groups — nothing integrated |

### What CourtPay solves

| Gap | CourtPay solution |
|---|---|
| **Frictionless check-in** | Face scan, phone lookup, or new registration — all self-service on a tablet at the door |
| **Instant digital payment** | VietQR code generated in real-time; player scans with any Vietnamese banking app; SePay webhook auto-confirms |
| **Cash fallback** | Staff can confirm cash payments from their phone in the Payment tab |
| **Subscription packages** | Venue creates custom packages (e.g. "10 sessions / 90 days / 900k VND"); players subscribe during check-in |
| **Revenue tracking** | Boss Dashboard shows today's check-ins, revenue, pending payments, payment history, and subscriber status |
| **Staff visibility** | Every payment is tagged (Self-service or CourtPay, Manual or SePay) so the owner knows exactly what happened |

### Why not just use CourtFlow?

CourtFlow focuses on **court rotation** — assigning 4 players to courts, managing queues, displaying assignments on TV screens. Many venues want payment and check-in management **without** the rotation engine. CourtPay serves these venues and also enhances CourtFlow venues by handling the payment/subscription layer that CourtFlow was never designed for.

---

## 3. Target Users

| User | Role in CourtPay |
|---|---|
| **Player** | Checks in at the kiosk tablet, pays via QR or cash, optionally subscribes to a package |
| **Staff** | Manages packages, confirms cash payments, views pending payments in real-time |
| **Venue owner / Boss** | Reviews revenue, check-in counts, subscriber metrics from the Boss Dashboard |
| **Admin (multi-venue)** | Oversees all venues' packages, subscribers, payments, and onboarding data from one admin panel |

---

## 4. Core Features

### 4.1 Kiosk Check-in (tablet at venue entrance)

The kiosk runs in a browser on a tablet placed at the venue door. It has its own fuchsia/pink color scheme to visually differentiate it from the green Self Check-in (CourtFlow rotation) mode.

**Home screen** — two entry points:

```
┌────────────────────────────────────┐
│                                    │
│     [Scan Face / Check In]         │
│                                    │
│     [First Time?]                  │
│                                    │
└────────────────────────────────────┘
```

**Returning player flow:**
1. Face scan (camera auto-captures) or phone number fallback
2. Player identified → name shown for confirmation
3. If active subscription exists → skip payment → success screen ("Welcome back, James! Regular · 6 sessions remaining")
4. If no subscription → subscription offer screen → skip or select package → VietQR payment screen
5. Payment confirmed (SePay webhook or staff manual) → success screen
6. Auto-reset to home after 8 seconds

**First-time player flow:**
1. Optional face capture (for future recognition)
2. Registration form: name, phone, gender, skill level
3. Subscription offer screen (package cards + "Skip — pay today only")
4. VietQR payment or cash
5. Payment confirmed → success screen → auto-reset

### 4.2 Payment

Two payment methods are supported:

**VietQR (primary):**
- A unique QR code is generated per transaction using the venue's configured bank account
- Player scans with any Vietnamese banking app (Vietcombank, MB Bank, Techcombank, etc.)
- SePay webhook fires on transfer receipt → auto-confirms the payment
- Each payment has a unique reference code (e.g. `CF-REG-abc123`) embedded in the transfer description for matching

**Cash (fallback):**
- Player taps "Pay by cash" on the kiosk
- Staff sees the pending payment in real-time on the Payment tab of the staff dashboard
- Staff taps "Confirm Payment" after collecting cash
- Both options end in the same success screen

### 4.3 Subscription Packages

Venues create fully flexible packages. No fixed tiers — staff defines everything:

| Field | Description |
|---|---|
| Name | e.g. "Monthly Pass", "10 Sessions", "VIP Unlimited" |
| Sessions | Number of sessions included, or unlimited (null) |
| Duration | Validity period in days from activation |
| Price | In VND |
| Perks | Free text, e.g. "10% court booking discount + free water" |

**Package lifecycle:**
- Created by staff or auto-generated (3 defaults: Starter / Regular / Unlimited)
- Offered to players during check-in (both new and returning)
- Activated on payment confirmation
- Session deducted each time player checks in and pays
- Exhausted when sessions reach 0; expired when duration passes
- Deactivated (soft-deleted) packages don't cancel existing subscriptions

### 4.4 Staff Dashboard Integration

CourtPay features are accessible from the existing staff mobile app:

**Payment tab** — real-time list of pending and confirmed payments with:
- Player name and phone
- Amount and payment method
- Flow tag: `Self` (from Self Check-in) or `CourtPay`
- Approval tag: `Manual`, `SePay`, or `SePay/Manual`
- Confirm / Cancel actions for pending payments

**Profile menu** — two new entries:
- **Subscriptions** → manage packages and view subscribers
- **Boss Dashboard** → revenue and operational metrics

**Payment Settings** — configurable per venue:
- Session fee (VND)
- Bank name / account / owner for VietQR generation
- Auto-approval phone + CCCD (data collection for SePay onboarding)
- Live QR preview

### 4.5 Boss Dashboard

Accessible from staff profile, the Boss Dashboard provides three views:

**Today tab:**
- Check-ins today (count)
- Revenue today (VND)
- Active subscribers (count)
- Pending payments (count)
- Recent check-in list with player name, phone, time, and source

**History tab:**
- Payment history with amount, type, method, and confirmation time
- Daily revenue chart (date / total / count)

**Sessions tab:**
- All active/expired/cancelled subscriptions
- Player name, package, status, sessions remaining, usage count, expiry

### 4.6 Admin Panel (multi-venue)

The super-admin "Membership CourtPay" section provides a centralized overview across all venues:

- KPI cards: active subscribers, month revenue, total packages, today's check-ins
- Onboarding data panel: phone + CCCD per venue (for SePay bank account setup)
- Tabs: Packages | Subscribers | Payments
- Venue filter dropdown
- Package CRUD, subscriber management, payment history with status badges

---

## 5. User Flows (detailed)

### Flow A — Returning player with subscription

```
Kiosk home → Face scan → "James Chen?" → Active sub found
→ Skip payment → Success: "Welcome back, James! Regular · 6 sessions remaining"
→ Auto-reset (8s)
```

### Flow B — Returning player without subscription

```
Kiosk home → Face scan → "James Chen?" → No subscription
→ Subscription offer (package cards + Skip)
  → [Select package] → VietQR payment (package price) → Confirmed → Subscription activated
  → [Skip] → VietQR payment (session fee) → Confirmed → Single visit
→ Auto-reset (8s)
```

### Flow C — First-time player

```
Kiosk home → [First Time?] → Face capture (optional)
→ Registration form (name, phone, gender, level) → [Next]
→ Subscription offer (package cards + Skip)
  → [Select package] → VietQR payment (package price) → Confirmed → Registered + Subscribed
  → [Skip] → VietQR payment (session fee) → Confirmed → Registered
→ Auto-reset (8s)
```

### Flow D — Phone fallback

```
Kiosk home → Face scan fails → "Phone number" option
→ Enter phone → Found: "James Chen?" → Continue as Flow B
                Not found: → "Register as new player" → Continue as Flow C
```

### Flow E — Cash payment

```
(any flow reaches payment screen)
→ [Pay by cash] → Staff sees "Pending" in Payment tab
→ Staff taps "Confirm" → Kiosk receives real-time confirmation → Success screen
```

### Flow F — Staff creates package

```
Staff app → Profile → Subscriptions → Packages tab
→ [Create defaults] (auto-creates 3 packages) or [+ Add package]
→ Fill form (name, sessions, duration, price, perks) → Save
```

---

## 6. Technical Architecture (for designers/PMs)

### Module isolation

CourtPay is architecturally isolated from CourtFlow rotation:

```
┌─────────────────────────────┐    ┌──────────────────────────────┐
│       CourtPay Module       │    │     CourtFlow Rotation       │
│                             │    │                              │
│  Check-in + Payment         │    │  Face recognition            │
│  Subscription management    │    │  Queue management            │
│  Boss dashboard             │    │  Court assignment            │
│  SePay webhook              │    │  TV display                  │
│                             │    │  Ranking system              │
│  Models:                    │    │                              │
│    CheckInPlayer            │    │  Models:                     │
│    SubscriptionPackage      │    │    Player                    │
│    PlayerSubscription       │    │    QueueEntry                │
│    SubscriptionUsage        │    │    CourtAssignment           │
│    CheckInRecord            │    │    Session                   │
│    PendingPayment           │    │                              │
└──────────────┬──────────────┘    └──────────────┬───────────────┘
               │                                  │
               └──── Shared: Venue, phone bridge ─┘
```

The only connection between modules is the **phone number bridge**: if a player exists in both systems, they share the same phone number, allowing optional cross-referencing without direct dependency.

### Key routes

| Route | Purpose |
|---|---|
| `/tv-queue/[venueId]` (courtpay mode) | Kiosk check-in tablet |
| `/staff/subscriptions` | Staff package + subscriber management |
| `/staff/dashboard/boss` | Boss Dashboard |
| `/admin/courtpay` | Admin multi-venue overview |
| `/api/courtpay/*` | All CourtPay API endpoints |
| `/api/webhooks/sepay` | SePay payment webhook |

### Payment integration

- **SePay** receives bank transfers and fires a webhook to `/api/webhooks/sepay`
- The webhook matches the `paymentRef` in the transfer description to a `PendingPayment` record
- On match: payment confirmed, subscription activated (if applicable), socket event emitted to kiosk + staff in real-time

---

## 7. Kiosk Visual Identity

CourtPay uses a **fuchsia/pink** color scheme on the kiosk to visually separate it from CourtFlow's green Self Check-in:

| Element | CourtPay (fuchsia) | Self Check-in (green) |
|---|---|---|
| Primary buttons | `bg-fuchsia-600` | `bg-green-600` |
| Borders/accents | `border-fuchsia-500` | `border-green-500` |
| Success icon | Fuchsia checkmark | Green checkmark |
| Loading spinner | Fuchsia | Green |
| Text highlights | `text-fuchsia-400` | `text-green-400` |

This is intentional: venues running both modes on the same tablet network need players and staff to immediately see which flow they're in.

---

## 8. Website Integration Notes

### Positioning on the CourtFlow website

CourtPay should be presented as a **complementary product** or a **standalone offering**:

- **For CourtFlow users:** "Add CourtPay to handle payments and subscriptions at your venue"
- **For new users:** "CourtPay: the simplest way to manage check-ins, payments, and subscriptions for your racket sport venue"

### Key selling points for the website

1. **Zero hardware** — runs on any tablet browser, no POS terminal needed
2. **Instant QR payments** — VietQR works with every Vietnamese bank app; no merchant account required
3. **Self-service kiosk** — players check in and pay themselves; staff only needed for cash
4. **Flexible packages** — create any subscription: 5 sessions, 10 sessions, unlimited, custom perks
5. **Real-time dashboard** — see revenue, check-ins, and pending payments live on your phone
6. **Works alone or with CourtFlow** — use it standalone for payment management, or pair it with court rotation for the full experience

### Suggested website sections

1. **Hero** — "Get paid before they play." Tablet mockup showing VietQR kiosk screen.
2. **Problem/Solution** — Cash tracking pain points vs. CourtPay digital flow.
3. **How it works** — 3-step visual: Check in → Pay → Play. Show both face and phone paths.
4. **Subscriptions** — Package card examples with pricing. "Players subscribe in 10 seconds."
5. **Dashboard** — Staff phone mockup showing payment tab + Boss Dashboard.
6. **Pricing** — Position relative to CourtFlow. (To be decided: bundled or separate pricing.)
7. **CTA** — "Add CourtPay to your venue" or "Start with CourtPay."

### Assets the designer will need

- Kiosk screen states: home, face scan, phone entry, registration, subscription offer, VietQR payment, success
- Staff app screens: Payment tab (with flow/approval tags), Subscriptions page, Boss Dashboard
- Admin screens: CourtPay overview with KPI cards
- Color palette: fuchsia/pink for CourtPay, green for Self Check-in, purple for admin
- Flow diagrams for the 6 user flows described in Section 5

---

## 9. Current Limitations & Roadmap

| Limitation | Status |
|---|---|
| SePay requires manual bank account setup per client | Collecting phone + CCCD for future automation |
| No player-facing mobile app for CourtPay | Players interact via kiosk only; Zalo mini-app planned |
| No automated subscription renewal | Players must re-subscribe when package expires |
| No refund flow | Manual process via staff |
| No multi-language kiosk | Currently English; Vietnamese planned |
| Package analytics (conversion rate, churn) | Not yet built; Boss Dashboard covers basics |

---

## 10. Glossary

| Term | Definition |
|---|---|
| **CourtPay** | The check-in, payment, and subscription module |
| **CourtFlow** | The court rotation and queue management module |
| **Self Check-in** | CourtFlow's existing face-based check-in (green theme, tied to rotation queue) |
| **Kiosk** | A tablet running the CourtPay check-in flow at the venue entrance |
| **VietQR** | Vietnamese interbank QR payment standard |
| **SePay** | Third-party service that monitors bank accounts and fires webhooks on incoming transfers |
| **CheckInPlayer** | CourtPay's player record (separate from CourtFlow's Player model) |
| **PendingPayment** | A payment record awaiting confirmation (via SePay webhook or staff manual approval) |
| **Boss Dashboard** | Staff-accessible dashboard showing revenue and operational metrics |
