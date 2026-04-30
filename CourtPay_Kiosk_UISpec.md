# CourtPay Kiosk — Tablet UI/UX Specification

> **Purpose:** Complete screen-by-screen reference for Figma design review. Covers every step the player sees, from the entry screen through both flows (Registered Player and First Time), including all edge states, modals, and shared UI patterns.

---

## Global Shell

Every screen shares the same base layer:

| Layer | Details |
|---|---|
| **Background** | `CourtPayLiquidBackdrop` — animated ambient colour orbs, full bleed. Colour driven by the venue's accent (`green`, `purple`, `blue`, etc.). |
| **Theme** | Light or Dark. All text, glass surfaces, and button colours flip accordingly. |
| **Safe area** | `paddingTop: insets.top` applied per step. Bottom padding added on CTAs. |
| **Staff escape** | Hidden overlay (`TabletStaffEscape`): 5 rapid taps anywhere → 4-digit PIN modal → returns to Staff Mode Select. |
| **Idle timer** | 30 s inactivity on intermediate steps → auto-reset to Home. Disabled on: Home, face scan, registration steps, payment, confirmed. |
| **Language toggle** | EN / VI flag button. Shown in the top bar on Home, and as a floating button (top-right) on `reg_face_preview` and `reg_form`. |

---

## Screen 0 — Home (Entry Point)

**Step key:** `home`

This is the always-on kiosk face. It never times out.

### Layout

```
┌──────────────────────────────────────────┐
│  [CourtFlow logo]  CourtPay  [🌙] [🇬🇧]  │  ← CourtFlowKioskTopBar
├──────────────────────────────────────────┤
│                                           │
│          [Venue logo — 96×96 circle]      │  ← optional, may spin
│              [Venue name]                 │  ← muted subtitle
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  👤➕  First Time?                  │  │  ← LiquidGlassSurface card
│  │        Register & pay to play       │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  🔍  Registered player             │  │  ← LiquidGlassSurface card (accent tint)
│  │       I've played here before      │  │
│  └─────────────────────────────────────┘  │
│                                           │
└──────────────────────────────────────────┘
```

### UI Elements

| Element | Detail |
|---|---|
| **Top bar** | CourtFlow monogram + "CourtPay" tagline · Dark/Light toggle (sun/moon icon) · Language flag button |
| **Venue logo** | 96×96 circle, optional — may animate a slow spin if `logoSpin` is enabled |
| **Venue name** | Muted text below the logo |
| **Card 1 — First Time?** | Icon: `UserPlus` (neutral grey) · Title: "First Time?" · Sub: "Register & pay to play" · Neutral glass surface |
| **Card 2 — Registered player** | Icon: `ScanFace` (accent colour) · Title: "Registered player" · Sub: "I've played here before" · Accent-tinted glass surface |
| **Cards layout** | Stacked vertically, full width, gap 28 |

### Interactions

| Tap | Next step |
|---|---|
| "First Time?" card | → `reg_face_capture` |
| "Registered player" card | → `scan_returning` |

---

## FLOW A — Registered Player

> Player taps "Registered player" on the Home screen.

---

### Screen A1 — Face Scan (Auto)

**Step key:** `scan_returning`

Component: `SelfCheckInReturningFaceScanner`

```
┌──────────────────────────────────────────┐
│                                           │
│    [Full-screen front camera view]        │
│                                           │
│    ┌────────────────────────────────┐     │
│    │   Position your face —        │     │  ← status hint text
│    │   scanning starts in a moment │     │
│    └────────────────────────────────┘     │
│                                           │
│         [Use phone number instead]        │  ← secondary link button
│              [← Back]                     │
└──────────────────────────────────────────┘
```

| Element | Detail |
|---|---|
| **Camera view** | Full-screen front camera, auto-starts scanning every few seconds |
| **Status text** | Cycles between: "Position your face…", "Hold still — scanning now", "Next scan in Xs…" |
| **"Use phone number instead"** | Accent-coloured text link with phone icon |
| **Back** | Ghost text button → Home |
| **Accent** | CourtPay accent colour used on borders, QR overlay elements |

**Outcomes after scan:**
- Face matched → go to Subscription check (internal `goToSubscriptionOrPay`)
- Face not found after retries → `no_face`
- API: face recognized but no registration → `needs_registration`
- Already paid → `already_paid`

---

### Screen A2 — No Face Detected

**Step key:** `no_face`

```
┌──────────────────────────────────────────┐
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │  🔲  No face detected        │       │  ← amber scan icon
│    │      Look at the camera      │       │
│    │      and try again           │       │
│    │                              │       │
│    │  [      Try again      ]     │       │  ← primary CTA
│    │  [📞 Use phone number ]      │       │  ← secondary button
│    │       Back to Home           │       │  ← ghost link
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Glass panel: `LiquidGlassSurface`, neutral accent.

| Button | Action |
|---|---|
| Try again | → `scan_returning` |
| Use phone number | → `phone_enter` |
| Back to Home | → Home |

---

### Screen A3 — Face Not Recognised

**Step key:** `needs_registration`

Triggered when the face scan runs but the face is not in the database.

```
┌──────────────────────────────────────────┐
│  ←                                        │
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │  ⚠️  Face not recognised    │       │  ← amber alert icon
│    │   Try checking in with your  │       │
│    │   phone number, or scan again│       │
│    │                              │       │
│    │  [      Scan Again     ]     │       │  ← primary accent button
│    │  [📞 Check in with phone ]   │       │  ← darker accent button
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Glass panel: `LiquidGlassSurface`, amber accent.

| Button | Action |
|---|---|
| Scan Again | → `scan_returning` |
| Check in with phone | → `phone_enter` |
| ← (back arrow, top-left) | → Home |

---

### Screen A4 — Phone Number Entry

**Step key:** `phone_enter`

Used as fallback from face scan, or directly.

```
┌──────────────────────────────────────────┐
│                                           │
│    ┌──────────────────────────────┐       │
│    │  ← Check in by phone        │       │  ← card header with back arrow
│    │                              │       │
│    │  Enter your phone number     │       │
│    │                              │       │
│    │  ┌──────────────────────┐    │       │
│    │  │  Phone number        │    │       │  ← large text input, auto-focus
│    │  └──────────────────────┘    │       │
│    │                              │       │
│    │  [inline error if any]       │       │
│    │                              │       │
│    │  [        Look up       ]    │       │  ← primary CTA, disabled when empty
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Glass surface: accent-tinted. Keyboard: `phone-pad`, auto-focused.

| Button | State |
|---|---|
| Look up | Disabled when input is empty. Shows spinner while loading. |
| ← back | → Home |

**Outcomes:**
- Player found → `phone_preview`
- No match → inline error "No player found with this phone number"

---

### Screen A5 — Phone Preview / Confirm

**Step key:** `phone_preview`

```
┌──────────────────────────────────────────┐
│                                           │
│    ┌──────────────────────────────┐       │
│    │  ← [Player Name]            │       │  ← name as card title
│    │                              │       │
│    │  ┌──────────────────────┐    │       │
│    │  │ Phone: 0901 234 567  │    │       │  ← info box
│    │  │ Level: Intermediate  │    │       │
│    │  └──────────────────────┘    │       │
│    │                              │       │
│    │  [   Confirm check-in   ]    │       │  ← accent primary button
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

| Button | Action |
|---|---|
| Confirm check-in | Calls pay-session API → Subscription check → `subscription_offer` or `awaiting_payment` |
| ← back | → `phone_enter` |

---

### Screen A6 — Subscription Offer *(optional, shared with Flow B)*

**Step key:** `subscription_offer`

> This screen appears only if: the venue has active packages **and** "Show in CourtPay check-in" is enabled.

```
┌──────────────────────────────────────────┐
│  ←                                        │
│                                           │
│    Welcome back, [Name]!                  │  ← greeting
│    Save with a package today?             │  ← subtitle
│                                           │
│    ┌──────────────────────────────┐       │
│    │  [Best Choice] [Save 20%]   │       │  ← badge row (optional)
│    │  Monthly Pass               │       │  ← package name
│    │  10 sessions · 30 days      │       │  ← meta
│    │  500,000                    │       │  ← price VND
│    └──────────────────────────────┘       │
│    ┌──────────────────────────────┐       │
│    │  Quarterly Pass             │       │  ← second package card
│    │  30 sessions · 90 days      │       │
│    │  1,200,000                  │       │
│    └──────────────────────────────┘       │
│                                           │
│    [        Continue         ]            │  ← active only when a package is selected
│                                           │
│    ────────── OR ──────────               │
│                                           │
│    ┌──────────────────────────────┐       │
│    │  Pay for Today Only    ›     │       │  ← glass card link
│    │  Single session — no package │       │
│    │  150,000                     │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

**Package card states:**
- Unselected: neutral glass, lower intensity
- Selected: green accent glass, slightly elevated, green border

**Badge variations on a package card:**
- "Best Choice" pill (accent colour background)
- "Save X%" pill (muted grey)

| Interaction | Action |
|---|---|
| Tap a package card | Selects it (green accent) |
| Continue | Enabled only when a package is selected. → `awaiting_payment` with package |
| "Pay for Today Only" card | → `awaiting_payment` single session, no package |
| ← back | → Home (resets flow) |

---

### Screen A7 — Subscription Exhausted

**Step key:** `subscription_exhausted_offer`

Triggered when a returning player's subscription has run out of sessions but is still within validity.

```
┌──────────────────────────────────────────┐
│  ←                                        │
│                                           │
│    ┌──────────────────────────────┐       │
│    │         ✓ (circle)          │       │  ← success circle (accent colour)
│    │  Welcome back, [Name]!      │       │
│    │  You are in — consider      │       │
│    │  buying a new package       │       │
│    │  for next time.             │       │
│    │                              │       │
│    │  ┌────────┐  ┌────────┐     │       │
│    │  │🎟 0    │  │📅 12   │     │       │  ← KPI cards (glass)
│    │  │Sessions│  │Days    │     │       │
│    │  │Left    │  │Left    │     │       │
│    │  └────────┘  └────────┘     │       │
│    │                              │       │
│    │  Returning to menu in 30s…  │       │
│    │                              │       │
│    │  [  Show New Packages  ]    │       │  ← primary CTA
│    │       Next time              │       │  ← ghost link → Home
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

If "Show New Packages" is tapped, the package list slides in below (same cards as `subscription_offer`).

Auto-returns Home after 30 s countdown.

---

### Screen A8 — Awaiting Payment *(shared with Flow B)*

**Step key:** `awaiting_payment`

Component: `CourtPaySessionAwaitingPayment` (`variant="kiosk"`)

```
┌──────────────────────────────────────────┐
│                                           │
│    Almost there, [Name]!                  │  ← new player headline
│    (or) Payment                           │  ← returning player headline
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │      [VietQR code image]     │       │  ← large QR, full width
│    │                              │       │
│    │  Scan with your banking app  │       │
│    │  then show staff to confirm  │       │
│    │                              │       │
│    │  ● ● ●  [pulse dots]        │       │  ← waiting animation (accent dots)
│    │  Waiting for payment…        │       │
│    │                              │       │
│    │  150,000 VND                 │       │  ← amount in accent colour
│    │                              │       │
│    │  [🎖 Intermediate]          │       │  ← skill badge (optional)
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
│   1 person  [–]  [1]  [+]  Max 4 people  │  ← party size selector
│                                           │
│    ──────────────── or ────────────────   │
│                                           │
│    [       Pay by cash         ]          │  ← secondary button
│    Tell staff you're paying cash          │
│                                           │
│           [Cancel]                        │  ← ghost link
└──────────────────────────────────────────┘
```

**Party counter:**
- Minus / plus buttons, current count displayed between them
- "Max 4 people" label
- Tapping ± re-calls pay-session API and updates amount + QR

**Cash flow:** Tapping "Pay by cash" → opens the [Cash Payment Modal](#modal-1--cash-payment-overlay).

**Payment completion:** WebSocket event `payment:confirmed` → `confirmed`.

---

### Screen A9 — Confirmed *(shared with Flow B)*

**Step key:** `confirmed`

```
┌──────────────────────────────────────────┐
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │    ┌─────────┐               │       │
│    │    │    ✓    │               │       │  ← large checkmark circle, accent
│    │    └─────────┘               │       │
│    │                              │       │
│    │  [Name], you are confirmed!  │       │  ← success headline
│    │  Have fun games!             │       │  ← sub
│    │  [context message if any]    │       │  ← e.g. "Check-in confirmed."
│    │                              │       │
│    │  ┌────────┐  ┌────────┐     │       │  ← KPI row (only if subscription)
│    │  │🎟  8   │  │📅  22  │     │       │
│    │  │Sessions│  │Days    │     │       │
│    │  │Remaining│ │Left    │     │       │
│    │  └────────┘  └────────┘     │       │
│    │                              │       │
│    │  Returning to menu in 8s…   │       │
│    │                              │       │
│    │  [         Done          ]   │       │  ← manual dismiss
│    │                              │       │
│    └──────────────────────────────┘       │
└──────────────────────────────────────────┘
```

Auto-returns Home after 8 s countdown. "Done" button also resets immediately.

---

### Screen A10 — Already Paid

**Step key:** `already_paid`

```
┌──────────────────────────────────────────┐
│                                           │
│   [Full-screen CourtPayStatusCard]        │
│                                           │
│   ┌────────────────────────────────┐      │
│   │   [face photo if available]    │      │
│   │                                │      │
│   │   [Name] already paid          │      │  ← headline
│   │   This player has already paid │      │  ← (or "Payment is pending…")
│   │   for this session.            │      │
│   │                                │      │
│   │   [     Back to Home     ]     │      │
│   └────────────────────────────────┘      │
│                                           │
└──────────────────────────────────────────┘
```

---

## FLOW B — First Time Player (Registration)

> Player taps "First Time?" on the Home screen.

---

### Screen B1 — Face Capture

**Step key:** `reg_face_capture`

**Sub-state: Camera permission not yet granted**

```
┌──────────────────────────────────────────┐
│    ┌──────────────────────────────┐       │
│    │  Camera access               │       │
│    │  Allow the camera to take    │       │
│    │  your registration photo.    │       │
│    │                              │       │
│    │  [   Allow Camera   ]        │       │
│    │       Back                   │       │
│    └──────────────────────────────┘       │
└──────────────────────────────────────────┘
```

**Main state: Camera active**

```
┌──────────────────────────────────────────┐
│  ←                                        │  ← back arrow to Home
│                                           │
│    Let's set up your account              │  ← title
│    First, look at the camera             │  ← hint
│                                           │
│    ┌──────────────────────────────┐       │
│    │  ┌──────────────────────┐    │       │
│    │  │                      │    │       │
│    │  │   [live camera       │    │       │  ← circular clip, front camera
│    │  │    preview           │    │       │    size: 312×312
│    │  │                      │    │       │
│    │  │   [3] countdown      │    │       │  ← large countdown digit overlay
│    │  │   or spinner         │    │       │    (shown during capture)
│    │  └──────────────────────┘    │       │
│    └──────────────────────────────┘       │  ← accent-coloured ring border
│                                           │
└──────────────────────────────────────────┘
```

Camera auto-captures after a brief countdown. No manual button.

**Error state (photo quality failure):**

```
┌─────────────────────────────────────────┐
│  [Photo quality error message banner]    │  ← amber banner at top
│  [After 3 failures: "Please ask staff"] │
│  [   Try again   ]                      │
└─────────────────────────────────────────┘
```

---

### Screen B2 — Face Preview

**Step key:** `reg_face_preview`

```
┌──────────────────────────────────────────┐
│                                    [🇬🇧]  │  ← floating language toggle
│                                           │
│    Got your photo!                        │  ← title (accent colour)
│                                           │
│    ┌──────────────────────────────┐       │
│    │  ┌──────────────────────┐    │       │
│    │  │  [captured face      │    │       │  ← same 312×312 circle
│    │  │   photo preview]     │    │       │
│    │  └──────────────────────┘    │       │
│    └──────────────────────────────┘       │  ← accent ring
│                                           │
│    [    Looks good →    ]                 │  ← primary accent button
│         Retake                            │  ← ghost text link
│                                           │
└──────────────────────────────────────────┘
```

Tapping "Looks good →" calls the face-check API:
- New face → `reg_form`
- Existing face already registered → `existing_user`

---

### Screen B3 — Registration Form

**Step key:** `reg_form`

```
┌──────────────────────────────────────────┐
│                                    [🇬🇧]  │  ← floating language toggle
│                                           │
│ ┌────────────────────────────────────┐    │
│ │  ← Let's set up your account      │    │  ← card title with back arrow
│ │                                    │    │
│ │  Name (same as Reclub)             │    │
│ │  ┌──────────────────────────────┐  │    │
│ │  │  Your Reclub's name          │  │    │  ← text input, auto-focus
│ │  └──────────────────────────────┘  │    │
│ │  [✓ Reclub matched]                │    │  ← shown after Reclub chip selection
│ │                                    │    │
│ │  ┌──────┐ ┌──────┐ ┌──────┐       │    │  ← Reclub suggestion chips
│ │  │ 👤   │ │ 👤   │ │ ...  │       │    │    (avatar + name, rounded pill)
│ │  │ Name │ │ Name │ │      │       │    │
│ │  └──────┘ └──────┘ └──────┘       │    │
│ │                                    │    │
│ │  Phone number                      │    │
│ │  ┌──────────────────────────────┐  │    │
│ │  │  Your phone number           │  │    │  ← phone-pad keyboard
│ │  └──────────────────────────────┘  │    │
│ │                                    │    │
│ │  Gender                            │    │
│ │  ┌────────┐  ┌────────┐           │    │  ← chip row
│ │  │  Male  │  │ Female │           │    │
│ │  └────────┘  └────────┘           │    │
│ │                                    │    │
│ │  Level                             │    │
│ │  ┌──────────┐┌──────────┐┌───────┐│    │
│ │  │ Beginner ││Intermediate││Advanced││   │  ← chip row
│ │  └──────────┘└──────────┘└───────┘│    │
│ │                                    │    │
│ │  [         Next          ]         │    │  ← disabled until name + gender + level
│ │                                    │    │
│ └────────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

**Chip states:**
- Unselected: neutral background, muted text
- Gender Male selected: blue chip
- Gender Female selected: pink/rose chip
- Beginner selected: green chip
- Intermediate selected: blue chip
- Advanced selected: orange/amber chip

**"Next" button logic:**
1. If phone is empty → opens [Phone Required Modal](#modal-2--phone-required-modal)
2. If packages exist and subscriptions enabled → `subscription_offer`
3. Otherwise → calls register API → `awaiting_payment` or `confirmed`

---

### Screen B4 — Subscription Offer *(shared with Flow A)*

Same as **Screen A6**. Copy differs slightly:
- Greeting: "Welcome to the club, [Name]!" (instead of "Welcome back")
- Subtitle: "Want to save with a package?" (instead of "Save with a package today?")

---

### Screen B5 — Awaiting Payment *(shared with Flow A)*

Same as **Screen A8**. Headline: "Almost there, [Name]!" (new player copy).

---

### Screen B6 — Confirmed *(shared with Flow A)*

Same as **Screen A9**. On first registration, a note "Your face is registered — next time just scan to check in" may appear as the `confirmMessage`.

---

### Screen B7 — Existing User (Duplicate Face)

**Step key:** `existing_user`

Triggered when `reg_face_preview` → face-check API returns "face already registered".

```
┌──────────────────────────────────────────┐
│                                           │
│   [Full-screen CourtPayStatusCard]        │
│                                           │
│   ┌────────────────────────────────┐      │
│   │   [face photo captured]        │      │
│   │                                │      │
│   │   Existing user                │      │  ← headline
│   │   This face is already         │      │
│   │   registered. Please use       │      │
│   │   Registered player.           │      │
│   │                                │      │
│   │   [     Back to Home     ]     │      │
│   └────────────────────────────────┘      │
│                                           │
└──────────────────────────────────────────┘
```

---

## Error State (Both Flows)

**Step key:** `error`

```
┌──────────────────────────────────────────┐
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │  ⚠️  Something went wrong   │       │  ← red warning icon
│    │  [error message text]        │       │
│    │                              │       │
│    │  [       Try again      ]    │       │  ← → Home
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Glass panel: neutral accent.

---

## Modals

### Modal 1 — Cash Payment Overlay

Triggered when player taps "Pay by cash" on the Awaiting Payment screen.

```
┌──────────────────────────────────────────┐
│                                           │
│  [Full-screen, same backdrop colour]      │
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │  ┌──────────────────────┐    │       │
│    │  │         💵           │    │       │  ← amber cash icon, 48px
│    │  └──────────────────────┘    │       │
│    │                              │       │
│    │  Cash Payment                │       │  ← title
│    │  Please hand the cash to the │       │
│    │  staff.                      │       │
│    │  Waiting for staff to        │       │
│    │  confirm…                    │       │
│    │                              │       │
│    │  ⏳ [amber spinner]          │       │
│    │                              │       │
│    │  150,000 VND                 │       │  ← amount
│    │                              │       │
│    │  [ Cancel — go back ]        │       │  ← ghost cancel button
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Resolved by: WebSocket `payment:confirmed` from staff confirming in the Staff app.

---

### Modal 2 — Phone Required Modal

Triggered during registration when player taps "Next" without a phone number.

```
┌──────────────────────────────────────────┐
│                                           │
│  [Full-screen scrim, tap to dismiss]      │
│                                           │
│    ┌──────────────────────────────┐       │
│    │                              │       │
│    │  ┌──────────────────────┐    │       │
│    │  │        📱            │    │       │  ← phone icon, accent colour, 40px
│    │  └──────────────────────┘    │       │
│    │                              │       │
│    │  Phone number needed         │       │  ← title
│    │  Your phone number is        │       │
│    │  required so we can find     │       │
│    │  your account.               │       │
│    │  No Spam. No Ads.            │       │
│    │                              │       │
│    │  [        Got it        ]    │       │  ← primary accent CTA
│    │                              │       │
│    └──────────────────────────────┘       │
│                                           │
└──────────────────────────────────────────┘
```

Tap outside card or "Got it" → dismisses.

---

## Complete Flow Diagram

```
                    ┌─────────────────┐
                    │   HOME SCREEN   │
                    └────────┬────────┘
                             │
           ┌─────────────────┴──────────────────┐
           │                                     │
    [Registered player]               [First Time?]
           │                                     │
           ▼                                     ▼
    ┌─────────────┐                    ┌─────────────────┐
    │  A1: Face   │                    │  B1: Face       │
    │    Scan     │                    │    Capture      │
    └──────┬──────┘                    └────────┬────────┘
           │                                    │
    ┌──────┴──────┐                             ▼
    │             │                    ┌─────────────────┐
 [matched]  [no face /              │  B2: Face       │
    │        unrecognised]            │    Preview      │
    │             │                    └────────┬────────┘
    │             ▼                             │
    │      ┌─────────────┐              [face OK]  [face exists]
    │      │  A2/A3:     │                  │            │
    │      │  Fallback   │                  ▼            ▼
    │      │  screens    │         ┌─────────────┐  ┌────────────┐
    │      └──────┬──────┘         │  B3: Reg    │  │  B7:       │
    │             │                │    Form     │  │  Existing  │
    │      [phone fallback]        └──────┬──────┘  │  User      │
    │             │                       │          └────────────┘
    │             ▼                       │
    │      ┌─────────────┐                │
    │      │  A4: Phone  │                │
    │      │    Entry    │                │
    │      └──────┬──────┘                │
    │             │                       │
    │             ▼                       │
    │      ┌─────────────┐                │
    │      │  A5: Phone  │                │
    │      │    Preview  │                │
    │      └──────┬──────┘                │
    │             │                       │
    └──────┬──────┘                       │
           │                              │
           └──────────────┬───────────────┘
                          │
               [packages available?]
                 Yes │         No │
                     ▼           ▼
             ┌──────────┐    ┌──────────────────┐
             │  A6/B4:  │    │  A8/B5: Awaiting │
             │  Sub     ├───►│    Payment       │
             │  Offer   │    └────────┬─────────┘
             └──────────┘             │
                                      │
              [sub exhausted?]        │
                     ▼                │
             ┌──────────────┐         │
             │ A7: Exhausted│         │
             │    Offer     │         │
             └──────────────┘         │
                                      ▼
                             ┌─────────────────┐
                             │  A9/B6:         │
                             │  Confirmed      │
                             └────────┬────────┘
                                      │
                                  (8s auto)
                                      │
                                      ▼
                             ┌─────────────────┐
                             │   HOME SCREEN   │
                             └─────────────────┘

    Side states (either flow):
    ┌─────────────┐   ┌────────────────┐
    │  A10:       │   │  Error screen  │
    │  Already    │   │                │
    │  Paid       │   └────────────────┘
    └─────────────┘
```

---

## Design System Notes

### Glass Surface (`LiquidGlassSurface`)

All content panels use frosted-glass surfaces. Key parameters:
- `accent`: `"none"` | `"green"` | `"amber"` | `"blue"` — changes the glass tint
- `intensity`: blur intensity (iOS: 40–52, Android: 72–88)
- `mode`: `"light"` | `"dark"` — flips all text and surface colours

### Accent Theme Colours

The venue owner picks an accent (`green`, `purple`, `blue`, `orange`, etc.). This drives:
- Primary button background
- Glass overlay tint
- Amount text colour
- Scanner border colour
- Pulse animation dots
- Success circle background

### Button Types

| Type | Appearance | Usage |
|---|---|---|
| Primary | Solid accent background, white text, rounded | Main CTA per screen |
| Secondary | Outlined, accent border, accent text + icon | Alternative actions (e.g. phone fallback) |
| Ghost / cancel | No background, muted text | Low-priority (Back, Cancel, Done) |
| Status card CTA | Full-width, solid | Already Paid / Existing User screens |

### Skill Level Badge Colours

| Level | Colour |
|---|---|
| Beginner | Green |
| Intermediate | Blue |
| Advanced | Orange/Amber |

---

## Localisation

All visible strings are available in both **English** and **Vietnamese**. The language toggle button is visible on the Home top bar and as a floating button on the face preview and registration form screens. There is no language selection on any other step — locale persists from the last toggle.

---

*Generated from source: `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx` and `mobile/src/lib/tablet-check-in-strings.ts`*
