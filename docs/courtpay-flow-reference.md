# CourtPay Flow Reference

This document is the source of truth for CourtPay check-in behavior in the tablet kiosk flow.

## Scope

- Screen: `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx`
- Main APIs:
  - `POST /api/courtpay/pay-session`
  - `POST /api/courtpay/register`
  - `POST /api/courtpay/cash-payment`
  - `POST /api/staff/confirm-payment`
  - `POST /api/webhooks/sepay`

---

## Core Rules

- A player can only be checked in once per active session window.
- If player has an active subscription and is not buying a new package:
  - no payment screen
  - session is deducted immediately
  - check-in confirms immediately
- If player buys a new package:
  - payment is required first (VietQR or cash + staff confirm)
  - check-in and session deduction happen only after payment confirmation
- Unlimited package: no numeric session decrement; usage is recorded.

---

## Flow Matrix

### 1) Returning player with active subscription (not exhausted/expired)

1. Face/phone match succeeds.
2. `POST /api/courtpay/pay-session` called without `packageId`.
3. Server checks in subscriber immediately.
4. Kiosk shows confirmation directly.

Expected result:
- No `awaiting_payment` step.
- `checkedIn: true`.
- Remaining sessions shown as `N-1` for limited package, unlimited hint for unlimited package.
- A `confirmed` CourtPay payment row is still recorded for staff history (`amount = 0`), and the Paid card shows subscription remaining sessions.

### 2) Returning player without active subscription -> buys package

1. Player reaches package selection and chooses package.
2. `POST /api/courtpay/pay-session` called with `packageId`.
3. Server creates pending subscription payment and activates subscription record.
4. Kiosk shows `awaiting_payment` with VietQR/cash actions.
5. Staff confirms payment (or SePay webhook confirms).
6. On confirmation event, server checks player in and deducts 1 session.
7. Kiosk shows confirmed screen.

Expected result:
- Payment step is mandatory before final check-in confirmation.
- After confirmation: subscription balance is reduced by 1 (unless unlimited).

### 3) First-time player registration -> buys package

1. Registration succeeds.
2. `POST /api/courtpay/register` with `packageId`.
3. Server creates pending subscription payment and activates subscription record.
4. Kiosk shows `awaiting_payment`.
5. Staff/webhook confirms payment.
6. Server checks in player and deducts 1 session.
7. Kiosk shows confirmed screen.

Expected result:
- Same payment-gated behavior as returning player package purchase.
- Final balance is package sessions minus 1 (unless unlimited).

### 4) No subscription + no package -> pay session fee

1. Player continues without package.
2. Server creates check-in pending payment if session fee > 0.
3. Kiosk shows `awaiting_payment`.
4. Staff/webhook confirms.
5. Check-in record created.

Expected result:
- No subscription deduction.
- Standard payment confirmation flow.

### 5) Already checked in for current session window

1. Any check-in attempt reaches server.
2. Server returns `already_checked_in`.
3. Kiosk shows friendly confirmation-style message (not hard error).

Expected result:
- No new payment.
- No additional deduction.

### 6) Returning player with exhausted package (0 sessions, still valid days)

1. Player checks in using their last available session (`1 -> 0`).
2. On that same successful check-in, kiosk shows exhausted-renewal welcome:
   - welcome header
   - KPI cards: `0 sessions left` and remaining days
   - subtitle: "You are in but consider buying a new package for next time"
   - `Show New Packages` + `Next time` CTAs
   - 30s auto-return timer is active on this substep
3. If player taps `Show New Packages`, kiosk reveals package cards and `Next time` at bottom.
4. Timer stops once package cards are shown.
5. If player selects a package and taps Continue, kiosk opens payment screen (no auto-return timer there).
6. Staff/SePay confirms payment.
7. New package is active for the player.
8. Current visit is confirmed without deducting a session from this newly purchased package.
9. If player taps `Next time`, on the next session they follow the normal flow (no exhausted-renewal welcome repeat).

Expected result:
- Last-session check-in still produces a zero-amount paid row.
- If renewal is purchased and confirmed, Paid tab shows two rows for that player in the session:
  - zero-amount check-in row
  - renewal package payment row
- Newly activated package keeps full session balance after this flow.
- Choosing `Next time` does not show the exhausted-renewal welcome again on the next session.

---

## Confirmation Sources

- **Staff confirm**: `POST /api/staff/confirm-payment`
- **Bank webhook (SePay)**: `POST /api/webhooks/sepay`

Both must produce the same business outcome:
- mark pending payment as confirmed
- for subscription payment: check-in + deduct one session
- emit `payment:confirmed` socket event back to kiosk

---

## Quick Regression Checklist

- Existing active subscription check-in skips payment and deducts once.
- Package purchase always shows payment screen first.
- Package purchase only deducts after payment confirmation.
- New session on same day still deducts correctly (session-window based, not day-only).
- Unlimited subscriptions never decrement numeric sessions.
