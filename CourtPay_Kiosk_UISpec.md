# CourtPay Kiosk — Flow & Interaction Specification

> This document describes the user flows, screen purposes, and interactions for the CourtPay tablet kiosk. UI design decisions (layout, colours, typography, components) are left to the designer.

---

## Overview

The kiosk runs on a tablet at the venue entrance. It supports two entry paths:

- **Flow A — Registered Player**: returning players check in via face scan or phone number.
- **Flow B — First Time Player**: new players register, then check in and pay.

Both flows converge at the payment and confirmation steps.

---

## Screen 0 — Home (Entry Point)

**Step key:** `home`

The always-on idle screen. Never times out. Displays the venue branding and two entry options.

**Available actions:**
- Tap "First Time?" → go to `reg_face_capture` (Flow B)
- Tap "Registered player" → go to `scan_returning` (Flow A)
- Toggle dark/light mode
- Toggle language (English / Vietnamese)

---

## FLOW A — Registered Player

> Player taps "Registered player" on the Home screen.

---

### Screen A1 — Face Scan

**Step key:** `scan_returning`

The front camera opens automatically and scans for a face at regular intervals. The player does not tap anything to trigger the scan — it happens passively.

Status feedback is shown to guide the player (e.g. "Look at the camera", "Scanning…", "Next scan in Xs").

**Available actions:**
- Tap "Use phone number instead" → go to `phone_enter`
- Tap Back → go to Home

**Outcomes after scan:**
- Face matched → subscription check → `subscription_offer` or `awaiting_payment`
- Face not detected after retries → `no_face`
- Face recognised but not registered → `needs_registration`
- Player already paid → `already_paid`

---

### Screen A2 — No Face Detected

**Step key:** `no_face`

Shown when the scanner could not detect a face after multiple attempts.

**Available actions:**
- Tap "Try again" → go to `scan_returning`
- Tap "Use phone number" → go to `phone_enter`
- Tap "Back to Home" → go to Home

---

### Screen A3 — Face Not Recognised

**Step key:** `needs_registration`

Shown when a face is detected but not found in the database.

**Available actions:**
- Tap "Scan Again" → go to `scan_returning`
- Tap "Check in with phone" → go to `phone_enter`
- Tap Back → go to Home

---

### Screen A4 — Phone Number Entry

**Step key:** `phone_enter`

Fallback from face scan, or entry point when the player prefers phone check-in. A numeric keyboard is shown. The confirm button is disabled while the field is empty, and shows a loading state while the API call is in progress.

**Available actions:**
- Tap "Look up" (with phone number entered) → calls player lookup API
  - Player found → go to `phone_preview`
  - No match → show inline error "No player found with this phone number"
- Tap Back → go to Home

---

### Screen A5 — Phone Preview / Confirm

**Step key:** `phone_preview`

Displays the player's name and phone number for confirmation before proceeding.

**Available actions:**
- Tap "Confirm check-in" → calls pay-session API → subscription check → `subscription_offer` or `awaiting_payment`
- Tap Back → go to `phone_enter`

---

### Screen A6 — Subscription Offer *(optional, shared with Flow B)*

**Step key:** `subscription_offer`

> Only shown if the venue has active packages with "Show in CourtPay check-in" enabled.

Greets the player and offers available packages. The player can select a package or skip to pay for a single session only.

**Interaction logic:**
- Package cards are selectable (one at a time)
- "Continue" button is active only when a package is selected
- "Pay for Today Only" skips package selection

**Available actions:**
- Select a package → enables "Continue"
- Tap "Continue" → go to `awaiting_payment` with selected package
- Tap "Pay for Today Only" → go to `awaiting_payment` as single session
- Tap Back → go to Home (resets flow)

---

### Screen A7 — Subscription Exhausted

**Step key:** `subscription_exhausted_offer`

Shown when the player's subscription has no sessions remaining (but is still within its validity period). The player is confirmed as checked in and invited to buy a new package.

Displays:
- Sessions remaining: 0
- Days remaining in current subscription

Auto-returns to Home after 30 seconds.

**Available actions:**
- Tap "Show New Packages" → expands a package list inline
- Tap "Next time" → go to Home
- Tap Back → go to Home

---

### Screen A8 — Awaiting Payment *(shared with Flow B)*

**Step key:** `awaiting_payment`

Displays a VietQR payment code for the player to scan with their banking app. The amount is shown clearly. A pulse animation indicates the system is waiting for payment confirmation.

The player can adjust the party size (1–4 people); changing it regenerates the amount and QR code.

Payment is confirmed via a WebSocket event from the payment system.

**Available actions:**
- Adjust party size (minus / plus) → updates amount and QR
- Tap "Pay by cash" → opens Cash Payment Modal
- Tap "Cancel" → go to Home

**Outcome:**
- WebSocket `payment:confirmed` received → go to `confirmed`

---

### Screen A9 — Confirmed *(shared with Flow B)*

**Step key:** `confirmed`

Congratulates the player. If they used a package, shows sessions remaining and days left.

Auto-returns to Home after 8 seconds.

**Available actions:**
- Tap "Done" → go to Home immediately

---

### Screen A10 — Already Paid

**Step key:** `already_paid`

Shown when the face scan detects a player who has already paid for this session.

**Available actions:**
- Tap "Back to Home" → go to Home

---

## FLOW B — First Time Player (Registration)

> Player taps "First Time?" on the Home screen.

---

### Screen B1 — Face Capture

**Step key:** `reg_face_capture`

The player's photo is taken for face registration.

**Sub-state: Camera permission not granted**

A prompt asks the player to allow camera access.

**Available actions:**
- Tap "Allow Camera" → request permission
- Tap Back → go to Home

**Sub-state: Camera active**

The front camera shows a live preview. After a brief countdown, the photo is taken automatically — no manual shutter button.

**Sub-state: Photo quality error**

If the captured photo doesn't meet quality requirements, an error message is shown. After 3 consecutive failures, the player is directed to ask staff for help.

**Available actions:**
- Tap "Try again" → retake photo

---

### Screen B2 — Face Preview

**Step key:** `reg_face_preview`

Displays the captured photo for confirmation.

**Available actions:**
- Tap "Looks good" → calls face-check API
  - New face → go to `reg_form`
  - Face already registered → go to `existing_user`
- Tap "Retake" → go back to `reg_face_capture`

---

### Screen B3 — Registration Form

**Step key:** `reg_form`

The player fills in their details to create an account.

**Fields:**
- **Name** — text input; shows Reclub member suggestions as selectable chips once the user starts typing
- **Phone number** — numeric input
- **Gender** — single-select: Male / Female
- **Skill level** — single-select: Beginner / Intermediate / Advanced

**"Next" button logic:**
1. If phone is empty → open Phone Required Modal
2. If packages are available and subscriptions are enabled → go to `subscription_offer`
3. Otherwise → calls register API → go to `awaiting_payment` or `confirmed`

**Available actions:**
- Select a Reclub suggestion chip → pre-fills the name field
- Tap "Next" (when name, gender, and level are filled) → see logic above
- Tap Back → go to `reg_face_preview`

---

### Screen B4 — Subscription Offer *(shared with Flow A)*

Same as **Screen A6**.

Copy note: greeting is "Welcome to the club, [Name]!" and subtitle is "Want to save with a package?"

---

### Screen B5 — Awaiting Payment *(shared with Flow A)*

Same as **Screen A8**.

Copy note: headline is "Almost there, [Name]!"

---

### Screen B6 — Confirmed *(shared with Flow A)*

Same as **Screen A9**.

Copy note: an additional message may appear: "Your face is registered — next time just scan to check in."

---

### Screen B7 — Existing User (Duplicate Face)

**Step key:** `existing_user`

Shown when the face captured during registration already exists in the database.

**Available actions:**
- Tap "Back to Home" → go to Home

---

## Error Screen (Both Flows)

**Step key:** `error`

A general error screen shown when an unexpected API or system failure occurs.

**Available actions:**
- Tap "Try again" → go to Home

---

## Modals

### Modal 1 — Cash Payment Overlay

Triggered from the Awaiting Payment screen when the player taps "Pay by cash."

Instructs the player to hand cash to a staff member. Shows a loading indicator while waiting for the staff to confirm in the staff app.

Resolved by: WebSocket `payment:confirmed` event (staff confirms in their app).

**Available actions:**
- Tap "Cancel" → dismiss modal, return to `awaiting_payment`

---

### Modal 2 — Phone Required

Triggered during registration when the player taps "Next" without entering a phone number.

Explains why the phone number is required. Can be dismissed.

**Available actions:**
- Tap "Got it" → dismiss and return to form
- Tap outside the modal → dismiss

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
    │      ┌─────────────┐              [new]       [exists]
    │      │  A2/A3:     │                │               │
    │      │  Fallback   │               ▼               ▼
    │      └──────┬──────┘        ┌─────────────┐  ┌────────────┐
    │             │               │  B3: Reg    │  │  B7:       │
    │      [phone fallback]       │    Form     │  │  Existing  │
    │             │               └──────┬──────┘  │  User      │
    │             ▼                      │          └────────────┘
    │      ┌─────────────┐               │
    │      │  A4: Phone  │               │
    │      │    Entry    │               │
    │      └──────┬──────┘               │
    │             ▼                      │
    │      ┌─────────────┐               │
    │      │  A5: Phone  │               │
    │      │    Preview  │               │
    │      └──────┬──────┘               │
    │             │                      │
    └──────┬──────┘                      │
           │                             │
           └─────────────┬───────────────┘
                         │
              [packages available?]
                Yes │         No │
                    ▼            ▼
            ┌──────────┐   ┌──────────────────┐
            │  A6/B4:  │   │  A8/B5: Awaiting │
            │  Sub     ├──►│    Payment       │
            │  Offer   │   └────────┬─────────┘
            └──────────┘            │
                                    ▼
            [sub exhausted?]   ┌─────────────────┐
                    ▼          │  A9/B6:         │
            ┌──────────────┐   │  Confirmed      │
            │ A7: Exhausted│   └────────┬────────┘
            │    Offer     │            │
            └──────────────┘        (8s auto)
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

## Localisation

All visible strings are available in both **English** and **Vietnamese**. A language toggle is accessible from the Home screen top bar and persists throughout the session.
