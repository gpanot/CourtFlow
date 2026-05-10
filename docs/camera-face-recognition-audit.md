# Camera & Face Recognition — Codebase Audit

> Generated: 2026-05-10  
> Scope: every place that initialises a camera, calls `captureFrame()` / `takePictureAsync()`, POSTs a base64 image to a face recognition endpoint, or tracks scan attempt counts.

---

## 1. Shared camera infrastructure (web / PWA)

| Asset | File | Role |
|---|---|---|
| **`CameraCapture`** component | `src/components/camera-capture.tsx` | Central `forwardRef` component used by almost every PWA flow. Exposes `startCamera`, `stopCamera`, `captureFrame()`. `captureFrame()` draws the `<video>` to a canvas and returns a raw base64 JPEG (no `data:` prefix). Calls `acquireBrowserCameraStream` unless an `externalStream` is passed in. |
| **`acquireBrowserCameraStream`** | `src/lib/browser-camera.ts` **L11–32** | The only place `navigator.mediaDevices.getUserMedia` is called for the shared stack. Also exports `stopMediaStream`. |
| **`attachStreamToVideo`** | `src/lib/attach-video-stream.ts` | Wires a `MediaStream` to a `<video>` element and calls `.play()`. |
| **`testCameraSupport`** | `src/lib/camera-test.ts` **L29** | Feature-detection only — calls `getUserMedia` to set `getUserMediaAvailable` flag; never captures frames. |

### Face recognition service (server-side)

| File | Role |
|---|---|
| `src/lib/face-recognition.ts` | Main AWS Rekognition integration: `SearchFacesByImage`, `IndexFaces`, `DetectFaces`, `DeleteFaces`, orphan cleanup. |
| `src/lib/face-recognition-mock.ts` | Drop-in mock when AWS keys are absent. |
| `src/lib/face-quality.ts` | Quality-check helpers consumed by API routes. |
| `src/lib/rekognition-config.ts` | Collection ID, `FACE_MATCH_THRESHOLD`. |
| `src/lib/rekognition-compare.ts` | Diagnostic / compare utilities. |

---

## 2. Flow-by-flow breakdown

### 2-A · Staff app — Face kiosk tab (old kiosk)

**File:** `src/components/face-kiosk-tab.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera component | L21, L123, L902+ | Uses **`CameraCapture`** with ref. |
| `getUserMedia` | — | Indirect via `CameraCapture` → `browser-camera`. |
| `captureFrame` | L498–515, L501 | Inside `startFaceDetection` → recursive `tryCapture` with `setTimeout(..., 500)`, up to **20 tries**, initial delay **800 ms**. |
| Face API endpoint | L196–198 | `POST /api/kiosk/checkin-payment` with `imageBase64`. |
| Attempt / retry logic | L52, L139, L167–171, L234–307, L482–548 | `FACE_FAIL_THRESHOLD = 3`; `consecutiveFailures` state; `startFaceDetection` auto-fires when `consecutiveFailures < 3`. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-B · Staff app — Walk-in / registration panel

**File:** `src/components/staff-check-in-panel.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L38–55, L550, L685 | **Raw `<video>` + canvas** — does **not** use `CameraCapture`. Calls `navigator.mediaDevices.getUserMedia` directly (L47, L50, L53) + `switchFaceCameraFacing` (L685). |
| `getUserMedia` | L47, L50, L53 | Direct call — **one of two places in the PWA that bypasses `CameraCapture`**. |
| Base64 capture | L608–613 | `canvas.toDataURL()` stored as captured face. |
| Face API endpoints | L382–397, L616–630, L713–731 | `POST /api/kiosk/register` (with `imageBase64`); `POST /api/queue/analyze-face-quality` (with full data-URL string); `POST /api/kiosk/process-face` with sentinel `"test_image_no_camera"` (debug-only path). |
| Attempt / retry logic | — | Single-shot capture per tap; no `MAX_FACE_ATTEMPTS` loop. |
| Shared component? | ❌ Raw `<video>` | Bypasses `CameraCapture`. |

---

### 2-C · Staff app — Player search face sheet

**File:** `src/components/staff-player-search-overlay.tsx`

| Topic | Lines | Detail |
|---|---|---|
| `getUserMedia` | L93–111 | **Direct** call — **second place in the PWA that bypasses `CameraCapture`**. |
| Base64 capture | L113–123, L210–217 | Local `captureB64()` — same canvas draw pattern as `CameraCapture` but inline. |
| Face API endpoint | L137–141 | `POST /api/kiosk/staff-identify-face` with `imageBase64`. |
| Attempt / retry logic | L58, L130–135 | 12 s processing timeout; no numbered retry loop. |
| Shared component? | ❌ Raw `<video>` | Bypasses `CameraCapture`. |

---

### 2-D · TV / tablet self-check-in scanner (old kiosk queue flow)

**File:** `src/components/self-check-in-scanner.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L9–11, L120, L799+ | **`CameraCapture`** with ref. |
| `captureFrame` | L428–439, L578 | Returning scan: `for attempt 1..MAX_FACE_ATTEMPTS` + inner poll `CAPTURE_MAX_ATTEMPTS`. Registration: single `captureRegFace()`. |
| Face API endpoints | L328, L583–585, L645–652 | `POST /api/kiosk/checkin-payment`; `POST /api/kiosk/check-existing-face`; `POST /api/kiosk/register`. |
| Attempt / retry logic | L91–95, L428–472 | `MAX_FACE_ATTEMPTS = 3`, `RETRY_IDLE_MS = 2000`, `CAMERA_WARMUP_MS`, `CAPTURE_POLL_MS`, `CAPTURE_MAX_ATTEMPTS`. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-E · CourtPay tablet kiosk (returning + new player)

**File:** `src/modules/courtpay/components/CourtPayKiosk.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L7–8, L118, L981+ | **`CameraCapture`** with ref. |
| `captureFrame` — returning player | L424–434 | `for attempt 1..MAX_FACE_ATTEMPTS` + inner poll (L431–434). |
| `captureFrame` — new player | L550 | Single `captureRegFace()` shot. |
| Face API endpoints | L337–344, L554–557, L594–610, L686+ | `POST /api/courtpay/face-checkin`; `POST /api/courtpay/check-face` (registration duplicate check); `POST /api/courtpay/preview-face-presence` (blur/bounding-box path); `POST /api/courtpay/register`. |
| Attempt / retry logic | L95–99, L424–472, L165, L1201+ | `MAX_FACE_ATTEMPTS = 3`, `RETRY_IDLE_MS = 2000`, `CAMERA_WARMUP_MS = 1500`, `CAPTURE_POLL_MS = 120`, `CAPTURE_MAX_ATTEMPTS = 45`; `registrationQualityFailures` (enrollment quality retries, threshold ≥ 3). |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-F · Staff CourtPay check-in tab (PWA)

**File:** `src/components/checkin/CheckInCourtPay.tsx`

| Topic | Lines | Detail |
|---|---|---|
| `getUserMedia` | L338, L354, L377, L393 | Calls `acquireBrowserCameraStream` directly in the parent; stream passed via `externalStream` prop to `CameraCapture`. |
| Camera | L11, L128, L138, L965+, L1085+ | **`CameraCapture`** with `externalStream` — stream owned by parent, not by the component. `captureFrame` called on two separate refs (L407 returning, L493 registration). |
| Face API endpoints | L272, L418, L506, L640+, L547–722 | `POST /api/courtpay/preview-face-presence` (L272, L506); `POST /api/courtpay/face-checkin` (L418); `POST /api/courtpay/register` and related. |
| Attempt / retry logic | L159, L1193+ | `registrationQualityFailures` with threshold ≥ 3 (enrollment quality). No `MAX_FACE_ATTEMPTS` loop on the returning-player path — single capture per trigger. |
| Shared component? | ✅ `CameraCapture` (with `externalStream`) | `getUserMedia` bypasses `CameraCapture` constructor but frame capture still uses the component's `captureFrame`. |

---

### 2-G · TV queue join scanner (player self-join)

**File:** `src/components/tv-queue-scanner.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L6, L54, L295+ | **`CameraCapture`** with ref. |
| `captureFrame` | L147–159, L156 | `for attempt 1..MAX_FACE_ATTEMPTS` + inner poll (L155–158). |
| Face API endpoint | L173–181 | `POST /api/tv-queue/join` with `imageBase64`. |
| Attempt / retry logic | L43–45, L147–207 | `MAX_FACE_ATTEMPTS = 3`, same warmup/poll/retry-idle pattern as CourtPay kiosk. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-H · Sticker TV kiosk

**File:** `src/app/(tv)/sticker-kiosk/page.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L12–13, L335, L508+ | **`CameraCapture`** inside `ScanningScreen`. |
| `captureFrame` | L339–358, L355 | `for attempt 1..MAX_FACE_ATTEMPTS` + inner poll (L354–357). |
| Face API endpoint | L370–372 | `POST /api/kiosk/sticker-face-identify` with `{ imageBase64 }` + kiosk-secret header via `kioskFetch`. |
| Attempt / retry logic | L317–322, L416–425 | `MAX_FACE_ATTEMPTS = 3`, `RETRY_IDLE_MS = 2000`, `CAMERA_WARMUP_MS = 1500`, `CAPTURE_POLL_MS = 120`, `CAPTURE_MAX_ATTEMPTS = 45` — **directly copied from CourtPay kiosk**. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-I · Player app — onboarding / face login

**File:** `src/app/(player)/player/onboarding.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L9, L47, L209+ | **`CameraCapture`** with ref. |
| `captureFrame` | L70–83, L72 | `waitForReady` polls every **400 ms**, max **15 iterations** — then fires single capture. |
| Face API endpoint | L93–95 | `POST /api/player/face-login` with `imageBase64`. |
| Attempt / retry logic | — | No `MAX_FACE_ATTEMPTS` loop. On failure → navigates back to wristband screen. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-J · My Balance — face identify

**File:** `src/app/my-balance/IdentifyState.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L6, L37, L219–224 | **`CameraCapture`** with ref. |
| `captureFrame` | L102–114, L111 | `for attempt 1..MAX_FACE_ATTEMPTS` + inner poll (L110–113). |
| Face API endpoint | L71–74 | `POST /api/balance/identify-face` with `imageBase64`. |
| Attempt / retry logic | L14–15, L136–143 | `MAX_FACE_ATTEMPTS = 3`, `RETRY_COUNTDOWN_FROM = 3` — countdown shown between tries. |
| Shared component? | ✅ `CameraCapture` | |

---

### 2-K · Admin tools (file-upload, no live camera)

| File | Lines | Endpoint |
|---|---|---|
| `src/app/(admin)/admin/face-recognition-test/page.tsx` | L111–114, L156–158 | `POST /api/rekognition/diagnose`, `POST /api/rekognition/search` — from picked file, not live camera. |
| `src/components/admin/player-detail-face-recognition.tsx` | L162–166, L207–211, L270–271 | `POST /api/admin/players/:id/remove-bg`, `POST /api/admin/players/:id/face`, `POST /api/rekognition/search` — admin-only, file upload. |

---

## 3. Mobile (React Native / Expo)

Mobile uses **`CameraView`** (Expo Camera) + **`takePictureAsync`** instead of the web `CameraCapture` + `captureFrame`. There is no shared component between web and mobile.

### 3-A · Mobile — CourtPay tablet check-in (returning + new player)

**File:** `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L22, L240, L1440+ | **`CameraView`** + `useCameraPermissions`. |
| Capture — new player | via `useRegistrationCamera` hook | `takePictureAsync` (hook L175–178); `setInterval` countdown then capture (hook L221–241). |
| Capture — returning player | L1214+ via `SelfCheckInReturningFaceScanner` | `takePictureAsync` loop in shared component (see §3-C). |
| `preview-face-presence` | Hook L126–137 (`mobile/src/hooks/useRegistrationCamera.tsx`) | Blur / bounding-box feedback. |
| Face API endpoints | L600–601, L712–713 | `POST /api/courtpay/face-checkin`; `POST /api/courtpay/check-face`. |

---

### 3-B · Mobile — Staff check-in tab

**File:** `mobile/src/screens/staff/CheckInTabScreen.tsx`

| Topic | Lines | Detail |
|---|---|---|
| Camera | L16, L103–104, L305, L732+ | **`CameraView`** + `takePictureAsync` for returning check-in (L305–308). Delegates new-player capture to `FaceCaptureCard`. |
| Face API endpoints | L241–243, L321, L514 | `POST /api/queue/analyze-face-quality` (triggered when `faceBase64` changes, L231–282); `POST /api/courtpay/face-checkin` (L321); `POST /api/courtpay/register` with `imageBase64` (~L514). |
| Attempt / retry logic | — | Per-request errors for `no_face` / `multi_face` (L327–329); no `MAX_FACE_ATTEMPTS` loop — single capture per button press. |

---

### 3-C · Mobile — Shared components & hooks

| File | Role |
|---|---|
| `mobile/src/components/FaceCaptureCard.tsx` | **`CameraView`** + `takePictureAsync` (L36–39). No HTTP — parent owns the submit call. |
| `mobile/src/components/SelfCheckInReturningFaceScanner.tsx` | `MAX_FACE_ATTEMPTS = 3` (L17), `takePictureAsync` poll loop (L122–134), `onSubmitFrame` callback supplied by parent (L144). Mirror of `self-check-in-scanner.tsx` on web. |
| `mobile/src/hooks/useRegistrationCamera.tsx` | Manages `CameraView`, runs `takePictureAsync`, `setInterval` countdown for capture (L221–241), calls `POST /api/courtpay/preview-face-presence` for bounding-box feedback (L126–137). |

---

## 4. Quick reference tables

### Where `getUserMedia` is called directly (web)

| File | Lines | Notes |
|---|---|---|
| `src/lib/browser-camera.ts` | L11–32 | Canonical wrapper — used by `CameraCapture`. |
| `src/components/staff-check-in-panel.tsx` | L47, L50, L53 | Bypasses `CameraCapture` entirely. |
| `src/components/staff-player-search-overlay.tsx` | L95 | Bypasses `CameraCapture` entirely. |
| `src/components/checkin/CheckInCourtPay.tsx` | L338, L354, L377, L393 | Calls `acquireBrowserCameraStream`; passes result as `externalStream` to `CameraCapture`. |
| `src/lib/camera-test.ts` | L29 | Feature-detection only, no capture. |

### Where `captureFrame()` is called (web)

| File | Lines | Flow |
|---|---|---|
| `src/components/camera-capture.tsx` | L102–111 | Implementation |
| `src/components/face-kiosk-tab.tsx` | L501 | Staff kiosk tab |
| `src/components/self-check-in-scanner.tsx` | L436, L578 | TV self-check-in |
| `src/modules/courtpay/components/CourtPayKiosk.tsx` | L432, L550 | CourtPay tablet |
| `src/components/checkin/CheckInCourtPay.tsx` | L407, L493 | Staff CourtPay tab |
| `src/components/tv-queue-scanner.tsx` | L156 | TV queue join |
| `src/app/(tv)/sticker-kiosk/page.tsx` | L355 | Sticker kiosk |
| `src/app/my-balance/IdentifyState.tsx` | L111 | My Balance |
| `src/app/(player)/player/onboarding.tsx` | L72 | Player onboarding |

### Attempt / retry constants by flow (web)

| Flow | File | `MAX_FACE_ATTEMPTS` | Warmup | Poll | Retry idle |
|---|---|---|---|---|---|
| Staff face kiosk tab | `face-kiosk-tab.tsx` | `FACE_FAIL_THRESHOLD = 3` (via `consecutiveFailures`) | 800 ms | 500 ms | varies |
| TV self-check-in | `self-check-in-scanner.tsx` | 3 | ~1500 ms | 120 ms | 2000 ms |
| CourtPay tablet | `CourtPayKiosk.tsx` | 3 | 1500 ms | 120 ms | 2000 ms |
| Staff CourtPay tab | `CheckInCourtPay.tsx` | — (single shot, quality failures ≥ 3) | — | — | — |
| TV queue scanner | `tv-queue-scanner.tsx` | 3 | ~1500 ms | 120 ms | 2000 ms |
| Sticker kiosk | `sticker-kiosk/page.tsx` | 3 | 1500 ms | 120 ms | 2000 ms |
| My Balance | `IdentifyState.tsx` | 3 | — | ~120 ms | 3 s countdown |
| Player onboarding | `onboarding.tsx` | — (single shot) | 400 ms | 400 ms | — |

### Face recognition API endpoints — who calls what

| Endpoint | Callers |
|---|---|
| `POST /api/kiosk/checkin-payment` | `face-kiosk-tab.tsx`, `self-check-in-scanner.tsx` |
| `POST /api/kiosk/check-existing-face` | `self-check-in-scanner.tsx` |
| `POST /api/kiosk/register` | `self-check-in-scanner.tsx`, `staff-check-in-panel.tsx` |
| `POST /api/kiosk/staff-identify-face` | `staff-player-search-overlay.tsx` |
| `POST /api/kiosk/sticker-face-identify` | `sticker-kiosk/page.tsx` |
| `POST /api/kiosk/process-face` | `staff-check-in-panel.tsx` (debug sentinel only) |
| `POST /api/courtpay/face-checkin` | `CourtPayKiosk.tsx`, `CheckInCourtPay.tsx`, `CheckInTabScreen.tsx` (mobile), `CourtPayCheckInScreen.tsx` (mobile) |
| `POST /api/courtpay/check-face` | `CourtPayKiosk.tsx`, `CheckInCourtPay.tsx`, `CourtPayCheckInScreen.tsx` (mobile) |
| `POST /api/courtpay/preview-face-presence` | `CourtPayKiosk.tsx`, `CheckInCourtPay.tsx`, `useRegistrationCamera.tsx` (mobile) |
| `POST /api/courtpay/register` | `CourtPayKiosk.tsx`, `CheckInCourtPay.tsx`, `CheckInTabScreen.tsx` (mobile) |
| `POST /api/tv-queue/join` | `tv-queue-scanner.tsx` |
| `POST /api/balance/identify-face` | `IdentifyState.tsx` |
| `POST /api/player/face-login` | `onboarding.tsx` |
| `POST /api/queue/analyze-face-quality` | `staff-check-in-panel.tsx`, `CheckInTabScreen.tsx` (mobile) |
| `POST /api/rekognition/diagnose` | Admin face-recognition-test page |
| `POST /api/rekognition/search` | Admin face-recognition-test page, `player-detail-face-recognition.tsx` |
| `POST /api/admin/players/:id/face` | `player-detail-face-recognition.tsx` |

---

## 5. Key observations

1. **`CameraCapture` is the standard** — 9 out of 11 web flows use it. Only `staff-check-in-panel` and `staff-player-search-overlay` call `getUserMedia` directly, with their own inline canvas capture helpers. `CheckInCourtPay` acquires the stream manually but still feeds it into `CameraCapture` via `externalStream`.

2. **The retry loop pattern is duplicated in 4 places** — `self-check-in-scanner`, `CourtPayKiosk`, `tv-queue-scanner`, and `sticker-kiosk` all implement the same `adjust → capturing → between_retries` loop with identical constants (`MAX = 3`, warmup 1500 ms, poll 120 ms, retry idle 2000 ms). This logic is a candidate for a shared hook.

3. **Mobile is fully separate** — no shared components between web (`CameraCapture`) and mobile (`CameraView` / `takePictureAsync`). `SelfCheckInReturningFaceScanner` is the mobile equivalent of the web retry loop.

4. **Two API families** — the `kiosk/*` endpoints serve the old self-check-in / staff-kiosk flows; the `courtpay/*` endpoints serve CourtPay. They both hit the same underlying `faceRecognitionService` but are separate routes with separate auth models.

5. **`analyze-face-quality`** is only called in the staff-side flows (panel + mobile staff tab), never in self-service kiosk or CourtPay tablet.
