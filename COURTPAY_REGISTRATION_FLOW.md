# CourtPay — New Player Registration Flow

*Last updated: May 8, 2026*

---

## Overview

A new player registration in CourtPay goes through five logical phases:

1. **Photo capture + background blur** (client-side)
2. **Form fill & submission** → `POST /api/courtpay/register`
3. **AWS face pipeline** (recognition guard + enrollment)
4. **Payment creation** (VietQR or cash)
5. **Staff confirmation** → payment finalised

---

## Full Flow Diagram

```
STAFF DEVICE (PWA / Mobile)                        SERVER                          EXTERNAL SERVICES
─────────────────────────────────────────────────  ─────────────────────────────   ──────────────────

[1] PHOTO CAPTURE
 │
 ├─ Staff opens "New Player" tab
 ├─ Live camera feed shown
 │
 ├─ [PWA]   Staff clicks "Capture"
 │    └─ captureFrame() → raw base64
 │         │
 │         ├──POST /api/courtpay/preview-face-presence ──────────────────────────► AWS DetectFaces
 │         │   { imageBase64, returnBoundingBox:true }  ◄── { faceDetected, bbox } ◄──────────────
 │         │
 │         └─ If faceDetected + bbox:
 │              blurBackgroundKeepFaceSharp()   ← CLIENT CANVAS (no server call)
 │              (blurred bg, sharp face region)
 │
 ├─ [Mobile] Auto-capture after 3-second countdown
 │    └─ takePictureAsync() → raw base64
 │         └─ startBlurInBackground(originalBase64)  (fire & forget)
 │               └──POST /api/courtpay/preview-face-presence ──────────────────► AWS DetectFaces
 │                   { imageBase64, returnBoundingBox:true, blurBackground:true }
 │                                                   ──────────────────────────► FapiHub /v2/rembg/blur/
 │                                                   ◄── { processedImageBase64 } ◄───────────────
 │              blurredImageRef ← processedImageBase64
 │              (original shown immediately; blurred version used at submit)
 │
 ├─ capturedFacePresent flag checked
 │   If false → "Try Again" button shown (submit blocked)
 │

[2] FORM FILL
 │
 ├─ Staff fills: Name, Phone, Gender, Skill Level
 ├─ Optional: Reclub user linked (reclubUserId)
 ├─ canSubmitNewPlayer = faceBase64 ∧ capturedFacePresent=true ∧ all fields filled
 └─ Staff clicks "Register"

[3] POST /api/courtpay/register
 │
 ├─ Validate venueCode + name (400 if missing)
 ├─ Venue active + not suspended check
 ├─ Duplicate phone check → CheckInPlayer table
 │    └─ Already checked in this session? → 409
 │
 ├─ [IF imageBase64 present]
 │    │
 │    ├─ (A) FACE RECOGNITION GUARD
 │    │    └──── AWS SearchFacesByImage ─────────────────────────────────────────► AWS Rekognition
 │    │          { CollectionId, Image, MaxFaces:5, Threshold }
 │    │          ◄── faceCheck.resultType
 │    │          If resultType === "matched" → 409 "Face already registered, use Check In"
 │    │
 │    ├─ Phone lookup → existing Player record?
 │    │    ├─ YES → link reclubUserId if missing; enroll face if no faceSubjectId yet
 │    │    └─ NO  → CREATE new Player record in DB
 │    │
 │    ├─ (B) FACE ENROLLMENT — ATTEMPT 1
 │    │    │
 │    │    ├─ Quality gate: AWS DetectFaces (ALL) ──────────────────────────────► AWS Rekognition
 │    │    │   Checks: exactly 1 face, confidence ≥ 90%, pose angles < 30°
 │    │    │   └─ FAIL → qualityError returned (non-blocking; player still registered)
 │    │    │
 │    │    └─ AWS IndexFaces ──────────────────────────────────────────────────► AWS Rekognition
 │    │         ExternalImageId = "player_<playerId>"
 │    │         ◄── FaceId saved to player.faceSubjectId
 │    │
 │    ├─ (C) [CONDITIONAL] AUTO-RETRY WITH BACKGROUND REMOVAL
 │    │    Triggered ONLY if IndexFaces fails with "no face detected"
 │    │    │
 │    │    ├─ POST https://fapihub.com/v2/rembg/ ─────────────────────────────► FapiHub
 │    │    │   model=falcon
 │    │    │   ◄── cleaned base64 (transparent bg removed)
 │    │    │
 │    │    ├─ Quality gate again: AWS DetectFaces (ALL) ──────────────────────► AWS Rekognition
 │    │    └─ AWS IndexFaces (retry) ────────────────────────────────────────► AWS Rekognition
 │    │         If success → player.faceSubjectId saved
 │    │         If fail again → logged as "no face" (non-blocking)
 │    │
 │    └─ persistPlayerCheckInFacePhoto() → blurred image saved to disk, player.facePhotoPath set
 │
 ├─ registerPlayer() → CheckInPlayer record upserted
 │
 ├─ Discount lookup (PlayerCustomPrice for this session's staff)
 │
 ├─ sessionFee > 0?
 │    ├─ YES → createCheckInPayment() → PendingPayment record + VietQR URL generated
 │    │         Response: { playerId, pendingPaymentId, amount, vietQR, paymentRef }
 │    └─ NO  → CheckInRecord created immediately (free session)
 │              Response: { playerId, amount:0 }
 │

[4] AWAITING PAYMENT (client step)
 │
 ├─ Staff device shows QR code + amount
 ├─ Player scans QR (VietQR bank transfer)
 │
 ├─ [OPTION A] Player pays by bank transfer
 │    └─ SePay webhook → POST /api/webhooks/sepay
 │         └─ processSepayWebhook() matches paymentRef
 │              └─ PendingPayment.status = "confirmed"
 │                   └─ CheckInRecord created
 │                   └─ emitToVenue("payment:confirmed") → WebSocket → staff UI updates
 │
 ├─ [OPTION B] Staff clicks "Cash"
 │    └─ POST /api/courtpay/cash-payment { pendingPaymentId }
 │         └─ PendingPayment.paymentMethod = "cash"
 │         └─ emitToVenue("payment:new") → staff payment tab notified
 │         └─ Staff must then manually confirm via "Confirm" button
 │
 └─ [OPTION B cont.] Staff confirms cash manually
      └─ POST /api/staff/confirm-payment { pendingPaymentId }
           └─ PendingPayment.status = "confirmed"
           └─ CheckInRecord created (source="cash")
           └─ emitToVenue("payment:confirmed")

[5] SUCCESS
 └─ Staff device shows "Registered ✓" screen
 └─ Reclub roster tab updates (WebSocket payment:confirmed event)
```

---

## API Call Summary

### Per new registration (normal path — face detected on first try)

| # | Call | Direction | Service | Purpose |
|---|------|-----------|---------|---------|
| 1 | `POST /api/courtpay/preview-face-presence` | Client → Server | **AWS DetectFaces** | Get bounding box for background blur |
| 2 | Background blur | PWA: client canvas only · Mobile: **FapiHub** `/v2/rembg/blur/` | FapiHub | Blur background, keep face sharp |
| 3 | `POST /api/courtpay/register` → `SearchFacesByImage` | Server → AWS | **AWS Rekognition** | Guard: block duplicate-face registration |
| 4 | `register` → `DetectFaces (ALL)` | Server → AWS | **AWS Rekognition** | Quality gate before enrollment |
| 5 | `register` → `IndexFaces` | Server → AWS | **AWS Rekognition** | Enroll face into collection |

**Total: 3 AWS Rekognition calls + 1 FapiHub call (mobile) / 0 FapiHub calls (PWA)**

### If enrollment fails with "no face" (background removal retry path)

| # | Call | Service |
|---|------|---------|
| +6 | `POST https://fapihub.com/v2/rembg/` (model=falcon) | FapiHub |
| +7 | `DetectFaces (ALL)` retry | AWS Rekognition |
| +8 | `IndexFaces` retry | AWS Rekognition |

**Total on retry path: 5 AWS Rekognition calls + 2 FapiHub calls (1 for blur at capture, 1 for rembg at enrollment)**

---

## "No Face" Walk-in Bypass

There is an intentional escape hatch for players who cannot or will not take a photo (e.g. bad lighting, no cooperation). Staff can click **"Register without face"** which opens a minimal form (name, gender, skill level only) and calls:

```
POST /api/courtpay/register-walk-in
```

This route:
- Creates a `Player` with `isWalkIn: true`, `faceSubjectId: null`, and a synthetic phone (`__walkin_<timestamp>_<random>`)
- Makes **zero AWS or FapiHub calls**
- Still creates a `PendingPayment` and follows the same payment path

These players will never match in face recognition. They appear in the admin panel as "no face" players available for manual re-enrollment.

---

## How a Player Can Be Registered With No Face

Despite the enrollment safeguards, there are **multiple paths** through which a player ends up in the DB with `faceSubjectId = null`:

### Path 1 — Walk-in bypass (intentional)
Staff deliberately uses the "Register without face" button. No face pipeline is triggered. The player record has `isWalkIn: true`.

### Path 2 — AWS enrollment failure is non-blocking
In `/api/courtpay/register`, after the auto-retry with background removal, if both enrollment attempts fail (e.g. photo is genuinely unusable), the code logs a warning **but does not block registration**:

```ts
// After auto-retry with background removal inside enrollFace(), a remaining
// "no face" failure means the photo is genuinely unusable. Do NOT block
// registration — the player can still pay and be approved by staff.
console.warn("[courtpay/register] Non-blocking face enrollment failure (new):", {
  playerId: corePlayer.id,
  error: enrollment.error ?? null,
  qualityError: enrollment.qualityError === true,
});
```

This means a player with a real face photo in their file can still have `faceSubjectId = null` if both the raw photo and the background-removed version failed Rekognition's quality/pose checks.

### Path 3 — Background removal is conditional (no-face guard is PWA-only)

The client-side `capturedFacePresent === true` check in the PWA **blocks the submit button** if the preview API returned `faceDetected: false`. However:

- **Mobile**: `blurInBackground()` runs fire-and-forget in parallel with the "Looks good?" confirmation screen. If the user taps "Looks good" before the blur API responds, `getImageForEnrollment()` falls back to `originalBase64`. The face detection result is never checked before submission on mobile — only the blur image is potentially upgraded. There is no `capturedFacePresent` gate on the mobile path.
- **PWA**: Even with the gate, if `preview-face-presence` call throws (network error, API down), the catch block silently falls back to the original image and `capturedFacePresent` stays `null` — but `canSubmitNewPlayer` requires `capturedFacePresent === true`, so this should block. **However**, the `canSubmitNewPlayer` guard is only enforced in the UI (the submit button disabled state); the `handleNewRegistration` function itself only checks `!faceBase64`, not `capturedFacePresent`. A race condition or programmatic call could bypass it.

### Path 4 — FapiHub API key not configured
If `FAPIHUB_API_KEY` is missing, `removeBackgroundFromBase64()` returns `null` silently and the retry is skipped entirely. The enrollment fails and the player is saved without a face.

### Path 5 — Existing player by phone, already has `faceSubjectId`
If a player with the same phone already has a `faceSubjectId`, the enrollment block is skipped entirely (the code checks `if (!existingByPhone.faceSubjectId)`). This is correct behavior but means the existing enrollment may be for a different or stale face.

### Path 6 — Photo quality/pose rejection
The quality gate (`assertEnrollmentPhotoQuality`) rejects photos where:
- Face confidence < 90%
- Pose pitch/roll/yaw > 30°
- Zero or multiple faces detected

If the background-removed version also fails these checks, the player is registered without a face. This is the most common real-world cause — a selfie taken at an angle, in poor lighting, or with a complex background that FapiHub's `falcon` model couldn't fully clean.

---

## Summary of External Service Calls

| Service | Endpoint | When Called | Blocking? |
|---------|----------|-------------|-----------|
| AWS Rekognition | `SearchFacesByImage` | Every registration with photo | Yes — 409 if match |
| AWS Rekognition | `DetectFaces (ALL)` | Quality gate, every photo | Yes — returns quality error |
| AWS Rekognition | `IndexFaces` | Every enrollment attempt | No — failure is non-blocking |
| AWS Rekognition | `DetectFaces (ALL)` (retry) | Only if "no face" on first try | No |
| AWS Rekognition | `IndexFaces` (retry) | Only if "no face" on first try | No |
| FapiHub `/v2/rembg/` | Background removal for enrollment | Only if "no face" on first try | No |
| FapiHub `/v2/rembg/blur/` | Background blur for photo display | Mobile capture only, fire & forget | No |
| FapiHub (canvas) | CSS blur via `<canvas>` | PWA capture only, client-side | No |
