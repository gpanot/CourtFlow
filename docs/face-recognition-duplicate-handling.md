# Face Recognition — Duplicate / Misidentification Handling

**Last updated:** Thursday 21 May 2026, 06:30 (UTC+7, Asia/Ho_Chi_Minh)  
**Author:** Guillaume Panot  
**Scope:** CourtPay kiosk (PWA TV + RN tablet), Face Stats admin tab

---

## Context

CourtFlow uses AWS Rekognition to match a player's face at check-in. With ~400+ players enrolled, faces that are visually similar can cause false positives — the system may confidently identify Player B when Player A is actually standing at the camera.

The goal of this document is to track which misidentification scenarios are handled in the product and which are not.

---

## Covered Scenarios ✅

### 1. Matched player has already been checked-in this session (`already_paid` / `already_checked_in`)

**Trigger:** A player scans their face. The system recognises them but they have already been checked in or have a pending/confirmed payment for this session.

**What the system does:**
- Shows a status card: "X has already paid" (or "already checked in")
- Displays the matched player's face thumbnail for visual confirmation
- Shows a **"Not you?"** button

**"Not you?" modal options:**
| Option | Action |
|---|---|
| **New Player** (camera icon) | Cancels pending payment → goes to face capture → new player registration flow |
| **Existing Player (Via Phone)** (phone icon) | Cancels pending payment → goes to phone number entry → existing player payment flow |

**Surfaces covered:**
- ✅ PWA Kiosk (`CourtPayKiosk.tsx`) — `confirmed` step
- ✅ RN Tablet Kiosk (`CourtPayCheckInScreen.tsx`) — `already_paid` step
- ✅ RN Tablet Kiosk (`CourtPayCheckInScreen.tsx`) — `confirmed` step (when `confirmMessage` = already checked-in message)

---

### 2. Wrong player shown on payment screen (`payment_waiting` / `awaiting_payment`)

**Trigger:** The system matched an existing player and is showing them a QR code to pay. The player at the camera is someone else — either an unregistered new player or an existing player with a different phone number.

**What the system does:**
- Shows a **"Not you?"** link (right-aligned, next to "Cancel")

**"Not you?" modal options:**
| Option | Action |
|---|---|
| **New Player** (camera icon) | Cancels pending payment → goes to face capture → new player registration flow |
| **Existing Player (Via Phone)** (phone icon) | Cancels pending payment → goes to phone number entry → existing player payment flow |

**Surfaces covered:**
- ✅ PWA Kiosk (`CourtPayKiosk.tsx`) — `payment_waiting` step
- ✅ RN Tablet Kiosk — `awaiting_payment` step via `CourtPaySessionAwaitingPayment` component
- ✅ PWA Staff view — `court-pay-awaiting-payment-staff.tsx` via `NotYouDropdown`
- ✅ PWA Staff check-in (`CheckInCourtPay.tsx`) — passes callbacks to staff payment component

---

### 3. Face Stats admin visibility

**Trigger:** Admin wants to investigate low match scores to understand if the 80% threshold should be raised.

**What the system provides:**
- **Face Stats tab** in Admin → Face Recognition Test
- KPI cards: total check-ins, avg match % (≥80% only), passed (≥80%), failed (<80%)
- Bar chart: similarity score distribution in 2% buckets (80–100%)
- Sortable table: player name (clickable → opens player detail drawer inline), match %, pass/fail, **Registered date** (player account creation), check-in timestamp
- Player detail drawer: check-in photo (first face registration), registration date, face enrollment status, CourtPay check-in count, recent activity

**Why this matters:** Low scores from recently-registered players may indicate a photo quality issue (blur, bad angle). Sorting by "Registered" alongside "Match %" lets you spot correlations.

---

## Not Covered / Known Gaps ❌

### A. Face matched to wrong person — no UI cue at all (silent false positive)

**Scenario:** Player A stands at the kiosk. The system is ≥80% confident and immediately shows Player B's name on the payment screen. Player A doesn't notice or doesn't know the name shown is wrong, and pays without tapping "Not you?".

**Gap:** The system relies entirely on the player self-identifying the error. There is no automated cross-check (e.g. "Does this player have an active booking today?") to flag suspicious matches.

**Mitigation ideas (not implemented):**
- Add a "Is this you?" confirmation step before going straight to payment when match score is below a higher threshold (e.g. 90%)
- Display a larger avatar photo of the matched player so the discrepancy is more obvious

---

### B. Face matched to wrong person — new player sees the confirmed screen and walks away

**Scenario:** Player A's face matches Player B (who is already checked in). The kiosk shows "Player B — already checked in ✓" and auto-resets after N seconds. Player A, confused, sees the success screen and assumes they are checked in. They walk away without tapping "Not you?".

**Gap:** The "Not you?" link is visible but the auto-reset countdown may expire before the player acts.

**Mitigation ideas (not implemented):**
- Pause or extend the auto-reset timer when the matched player is `already_paid` / `already_checked_in` (since this is more likely a false positive than a legitimate re-scan)
- Show a more prominent callout: "Not the right name? Tap here" in a high-contrast colour

---

### C. New player — face captured, matches an existing enrolled player, and the system sends them to the existing player's payment screen

**Scenario:** A brand-new player arrives. Their face is accidentally 80%+ similar to an enrolled player. The kiosk auto-checks them in as the existing player and shows that player's payment/confirmation screen.

**Gap:** The new player cannot register at all — the "Not you?" modal only appears on the `already_paid` and `payment_waiting` screens, but if the face scan returns a confident match the new player never reaches the registration flow.

**Current workaround:** The player must tap "Not you?" → "New Player" on the payment screen to restart registration.

**Mitigation ideas (not implemented):**
- Add "This is not me — I'm new here" as a secondary option on the initial face match confirmation before payment begins

---

### D. Staff-registered walk-in via face — photo quality issue not caught at enrollment

**Scenario:** A staff member registers a new walk-in player by taking their photo, but the photo is blurry, poorly lit, or taken at a bad angle. The player is enrolled with a low-quality face vector. Future check-ins will consistently score below threshold, either failing or matching the wrong person.

**Gap:** There is a photo quality warning shown during registration (if AWS returns a quality flag), but:
- It does not block enrollment
- The Face Stats tab shows these low-quality enrollments only retrospectively

**Mitigation ideas (not implemented):**
- Block enrollment if AWS Rekognition quality score is below a minimum (e.g. reject if brightness/sharpness is too low)
- Re-enrollment prompt if a player has ≥3 failed face check-ins in a row

---

### E. PWA Staff "Check-in" tab — face not used for matching

**Scope note:** The staff check-in tab (not the kiosk) uses manual search by name/phone, not face recognition. There is no face misidentification scenario here.

---

### F. App (player-facing) face sign-in

**Scope note:** The CourtFlow player app uses face sign-in for authentication. Misidentification handling in the app (PWA or native) is separate from the kiosk CourtPay flow and is not documented here.

---

## Threshold Reference

| Value | Meaning |
|---|---|
| `< 80%` | Fail — not recognised |
| `80–85%` | Low pass — review recommended |
| `85–92%` | Good pass |
| `≥ 92%` | High confidence match |

Current threshold: **80%** (configurable via AWS Rekognition `SimilarityThreshold`).

The Face Stats distribution chart is designed to help decide whether to raise this threshold (e.g. to 85%) as the player database grows and similar-face collisions become more frequent.

---

## Related Files

| File | Purpose |
|---|---|
| `src/modules/courtpay/components/CourtPayKiosk.tsx` | PWA kiosk — state machine, "Not you?" modal |
| `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx` | RN tablet kiosk — state machine, "Not you?" modal |
| `mobile/src/components/courtpay/CourtPaySessionAwaitingPayment.tsx` | RN shared payment waiting screen with "Not you?" |
| `mobile/src/components/courtpay/CourtPayStatusCard.tsx` | RN already-paid / existing-user status card |
| `src/components/checkin/court-pay-awaiting-payment-staff.tsx` | PWA staff payment screen with `NotYouDropdown` |
| `src/app/(admin)/admin/face-recognition-test/face-stats-tab.tsx` | Admin Face Stats tab |
| `src/app/api/admin/face-stats/route.ts` | API: face check-in log statistics |
| `src/app/api/admin/players/[playerId]/check-in-insights/route.ts` | API: per-player face check-in history |
