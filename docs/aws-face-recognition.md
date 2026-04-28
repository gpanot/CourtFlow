# AWS Face Recognition (Developer Guide)

This document describes how CourtFlow integrates **Amazon Rekognition** for player face enrollment and kiosk / venue identification. It is aimed at engineers extending APIs, debugging production issues, or onboarding to the feature.

---

## 1. Architecture overview

```
┌─────────────┐     JPEG/base64      ┌──────────────────────┐     AWS SDK      ┌─────────────────────────┐
│ Web / kiosk │ ───────────────────► │ Next.js API routes    │ ───────────────► │ Amazon Rekognition       │
│ Staff app   │                     │ `faceRecognitionService`│                │ Face collection + search │
└─────────────┘                     └──────────────────────┘                 └─────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │ PostgreSQL (Prisma)  │
                                    │ `Player.faceSubjectId`│
                                    └──────────────────────┘
```

- **Enrollment**: a face image is sent to Rekognition **`IndexFaces`**; the returned AWS **`FaceId`** is stored on the player as `faceSubjectId`.
- **Identification**: a live image is sent to **`SearchFacesByImage`** against a single **collection**. The best match’s **`ExternalImageId`** (`player_<cuid>`) resolves to a `Player` row in the database.
- **No face vectors** are stored in Postgres—only the AWS face id for deletion/sync. Raw images may be persisted separately for UX (e.g. check-in photo paths); Rekognition’s own retention policy applies to API processing (see [privacy](#10-privacy-and-compliance)).

---

## 2. AWS Rekognition concepts used

| Operation | Purpose in CourtFlow |
|-----------|------------------------|
| `CreateCollection` | Called opportunistically (`ensureCollection`) so the collection exists before index/search. |
| `IndexFaces` | Enroll one face per player; `ExternalImageId` = `player_${playerId}`. |
| `SearchFacesByImage` | Match a probe image to indexed faces (main check-in path). |
| `DeleteFaces` | Remove a face when the player is deleted from DB (**orphan cleanup**) or via `removeFace`. |
| `ListFaces` | Health checks (`checkHealth`) and diagnostics (`/api/test-rekognition`). |
| `CompareFaces` | **Not** used for production check-in. Exposed only for diagnostics in `src/lib/rekognition-compare.ts`. |

**Collection ID**: `process.env.AWS_REKOGNITION_COLLECTION` or fallback to `courtflow-players-prod` in production / `courtflow-players-staging` in non-production (from `src/lib/rekognition-config.ts`).

**Region**: `process.env.AWS_REGION` or default `ap-southeast-1`.

---

## 3. Environment variables

Defined in `.env.example`:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM access key used by the server SDK. |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key. |
| `AWS_REGION` | Rekognition region (must match where the collection lives). |
| `AWS_REKOGNITION_COLLECTION` | Rekognition collection id override (recommended explicit values: `courtflow-players-prod` in prod and `courtflow-players-staging` in staging). If unset, app fallback uses `courtflow-players-prod` when `NODE_ENV=production`, otherwise `courtflow-players-staging`. |

Optional (see `src/lib/rekognition-config.ts`):

| Variable | Description |
|----------|-------------|
| `AWS_REKOGNITION_FACE_MATCH_THRESHOLD` | **Active** cutoff for **`SearchFacesByImage`** in `src/lib/face-recognition.ts`: `FaceMatchThreshold` is **`FACE_MATCH_THRESHOLD`** from `rekognition-config.ts`, driven by this env (default **85**). Compare diagnostics use the same export. The former hardcoded `FaceMatchThreshold: 85` has been removed. Production (Railway) currently uses **`82`**. |

### Environment isolation note (important)

- Production and staging **must use separate Rekognition collections** to avoid duplicate enrollments and cross-environment mismatch results.
- Recommended naming convention:
  - Prod: `courtflow-players-prod`
  - Staging: `courtflow-players-staging`
- `ensureCollection()` in `src/lib/face-recognition.ts` will automatically create the configured collection on first use if it does not already exist in AWS.
- After switching from an old shared collection, existing enrolled players will not be found in the new collection until re-enrolled. Re-enroll production users by running `npm run enroll:faces` against the prod database. Staging can typically start fresh.

---

## 4. IAM permissions

The credentials used by the app need Rekognition access to the target collection. Minimum actions typically include:

- `rekognition:CreateCollection`
- `rekognition:IndexFaces`
- `rekognition:SearchFacesByImage`
- `rekognition:DeleteFaces`
- `rekognition:ListFaces`
- `rekognition:ListCollections` (used by `/api/test-aws`)

For production, prefer **IAM roles** (e.g. on ECS/Lambda/Vercel via OIDC or instance role) over long-lived access keys where possible.

Scope resources with AWS recommended patterns for your account/region/collection.

---

## 5. Core library: `src/lib/face-recognition.ts`

### 5.1 Mock vs AWS mode

At process startup, **mock mode** is enabled when:

- `AWS_ACCESS_KEY_ID` is unset, **or**
- it equals `"your-key-here"` (placeholder), **or**
- it is empty/whitespace.

In mock mode:

- `recognizeFace` / `enrollFace` / `removeFace` / `checkHealth` delegate to `src/lib/face-recognition-mock.ts`.
- Special string `imageBase64 === "test_image_no_camera"` triggers `recognizeTestImage()` for predictable testing.

Logs prefixed with `[FaceRecognition] Mode:` show **MOCK** vs **AWS Rekognition**.

### 5.2 `enrollFace(imageBase64, playerId)`

1. Ensures collection exists.
2. `IndexFaces` with `MaxFaces: 1`, `QualityFilter: AUTO`.
3. On success, updates `Player.faceSubjectId` with the Rekognition **`FaceId`** (not the external id).

Failures return `{ success: false, error: "..." }` (e.g. no face in image).

### 5.3 `recognizeFace(imageBase64, options?)`

- **`options.debug: true`**: attaches `recognitionDebug` (`FaceRecognitionDebugInfo`) for kiosk/staff UIs—AWS match counts, top similarity, interpretation strings.

**AWS path:**

1. `SearchFacesByImage` with `MaxFaces: 5`, **`FaceMatchThreshold: FACE_MATCH_THRESHOLD`** (from `src/lib/rekognition-config.ts`, **not** a hardcoded 85), `QualityFilter: AUTO`.
2. Takes the best match, parses `ExternalImageId` as `player_<id>`, loads `Player` by id.
3. **Orphan handling**: if AWS returns a face whose player no longer exists in the DB, that face id is **`DeleteFaces`**’d (async) and the search is retried up to **3** times, skipping deleted face ids.

After **every** `SearchFacesByImage` outcome (including no candidates, orphan retry, successful match, and mapped error paths where applicable), **`queueFaceRecognitionRow`** persists a **`FaceRecognitionLog`** row **fire-and-forget** (`void prisma…create`), **only when `options.venueId` is passed** — check-in flows that omit `venueId` do not write logs.

Each log captures **`similarityScore`** (top raw similarity from the response, or **0** if no match), **`threshold`** (`FACE_MATCH_THRESHOLD`), **`passed`** (**`true`** only when `resultType === "matched"` for that outcome), **`venueId`**, and **`playerId`** when a player was matched **(optional / null otherwise)**; **`staffId`** is stored when passed in options. **`createdAt`** is set by the database.

**Mock path:** when **`venueId`** is passed, **`appendMockAttemptLog`** also writes **`FaceRecognitionLog`** via the same helper pattern so mock runs show up in analytics.

**Return shape** (`FaceRecognitionResult`): `resultType` is one of:

- `matched` — player found.
- `new_player` — no match, no face, or orphan exhaustion (treat as register / needs enrollment depending on route).
- `error` — Rekognition or unexpected failure.

**Special case**: `InvalidParameterException` with message containing `"no faces"` is mapped to `success: true`, `resultType: "new_player"` (same as “no usable face”).

### 5.4 `removeFace(playerId)`

Deletes the face using `Player.faceSubjectId` from the collection and clears `faceSubjectId`.

### 5.5 `checkHealth()`

Runs `ListFaces` with `MaxResults: 1` on the collection; returns boolean.

### 5.6 Helpers (queue / session)

`getNextQueueNumber(sessionId)` and `isRecentlyCheckedIn(playerId, sessionId)` are **not** Rekognition calls; they support kiosk queue flows after a face match.

---

## 6. Related modules

| File | Role |
|------|------|
| `src/lib/rekognition-config.ts` | Exports `FACE_MATCH_THRESHOLD` (env-driven, default 85). |
| `src/lib/rekognition-compare.ts` | `CompareFaces` for **diagnostics only**; returns mock scores when AWS is disabled. |
| `src/lib/face-quality.ts` | Client/server quality hints (separate from Rekognition similarity). |
| `src/lib/face-recognition-mock.ts` | Deterministic/random mock for local dev without AWS. |

---

## 7. Database model

**`Player`** (`prisma/schema.prisma`):

- `faceSubjectId` — stores Rekognition **`FaceId`** returned by `IndexFaces` (used for `DeleteFaces` on removal).
- `facePhotoPath` — optional app-stored photo path (not the Rekognition embedding).

**`FaceRecognitionLog`** — **written by `recognizeFace()`** for each recognition attempt where **`venueId`** is provided in options: **`venueId`**, optional **`playerId`** / **`staffId`**, **`similarityScore`**, **`threshold`**, **`passed`**, **`createdAt`**. The standalone helper **`src/lib/log-face-recognition-check-in.ts`** has been **removed**; previous **`logFaceRecognitionCheckIn`** calls from API routes were removed to **avoid duplicate rows**—logging is centralized in **`face-recognition.ts`** only.

**`FaceAttempt`** — kiosk processing attempts (`eventId`, `resultType`, etc.) are updated by routes such as `/api/kiosk/process-face`.

---

## 8. API routes that use face recognition

Non-exhaustive list of server routes that call `faceRecognitionService`:

| Route area | Typical use |
|------------|-------------|
| `/api/kiosk/process-face` | Main kiosk pipeline; optional `debug` for `faceDebug`. |
| `/api/kiosk/check-existing-face`, `/api/kiosk/checkin-payment`, `/api/kiosk/phone-check-in`, `/api/kiosk/staff-identify-face` | Variants of identify + queue / payment flows. |
| `/api/courtpay/register`, `/api/courtpay/check-face`, `/api/courtpay/face-checkin` | CourtPay registration and check-in. |
| `/api/balance/identify-face` | Balance / identification. |
| `/api/player/face-login` | Player face login. |
| `/api/tv-queue/join` | TV queue join with face. |
| `/api/queue/staff-add-walk-in-with-face` | Staff walk-in + enrollment. |
| `/api/admin/players/[playerId]` | Admin player delete may call `removeFace`. |

Always send **`imageBase64`** as raw base64 (no `data:image/jpeg;base64,` prefix is assumed in core service—some routes may strip prefixes before calling; normalize if you add new endpoints).

---

## 9. Debugging and ops endpoints

| Endpoint | Notes |
|----------|------|
| `GET /api/test-aws` | Lists Rekognition collections; verifies credentials. |
| `GET /api/test-rekognition` | `checkHealth`, `ListFaces` summary, DB players with `faceSubjectId`, last **20** **`FaceRecognitionLog`** rows as **`recentFaceRecognitionLogs`** (newest first). |

Do **not** expose these publicly in production without authentication/network restrictions.

---

## 10. Privacy and compliance

Product-facing copy references AWS Rekognition (e.g. `src/app/privacy/page.tsx`): images are processed for matching; retention follows AWS Rekognition policies. Coordinate with legal for venue-specific consent and data retention.

---

## 11. Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| Always “new player” / no match | Mock mode accidentally on; wrong region/collection; player never enrolled; threshold too high; poor lighting / angle. Threshold may be too high for lighting conditions — check **`recentFaceRecognitionLogs`** via **`GET /api/test-rekognition`** to see actual similarity scores. |
| Wrong player matched | Similar faces; lower **similarity** in logs; consider raising threshold carefully (trade-off: more false rejects). |
| Works locally, fails in prod | Env vars missing in deployment; IAM policy; collection created in different region. |
| Orphan warnings in logs | Normal after DB deletes; service deletes stale AWS faces and retries. |
| `InvalidParameterException` | Often “no faces” in image—handled as `new_player`. |

**Cost / limits**: Rekognition charges per API call; high-traffic kiosks should debounce captures and avoid redundant `SearchFacesByImage` calls. See current AWS pricing for your region.

---

## 12. Quick reference — enroll and identify flow

1. **Register**: capture photo → API enrolls → `IndexFaces` → save `faceSubjectId`.
2. **Identify**: capture photo → `SearchFacesByImage` → match `ExternalImageId` → load player → apply business rules (queue, payment, duplicate check-in).

For code entry points, start with:

- `src/lib/face-recognition.ts`
- `src/app/api/kiosk/process-face/route.ts` (full kiosk example with `FaceAttempt` + debug)

---

*Last updated: **April 28, 2026**. Changelog: threshold is now env-driven via `FACE_MATCH_THRESHOLD`; `FaceRecognitionLog` writes are live from `recognizeFace()` when `venueId` is passed; `log-face-recognition-check-in.ts` removed and route-level duplicate logging removed.*

*When changing thresholds or AWS APIs, update this document and `.env.example` together.*
