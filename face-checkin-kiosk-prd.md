# PRD — Face Check-In Kiosk Component for Pickleball Social PWA

## 1. Purpose

Build a **separate kiosk-style face check-in component** that can be tested independently before full integration into the main PWA.

This component will run on a tablet or phone with the camera always on and will allow players to check in by simply showing their face. The system should:

- detect a face automatically
- recognize returning players
- create a new player profile if no match is found
- assign the next queue number
- prevent repeat check-in within 4 hours
- display a simple success/result screen
- return automatically to idle mode

This is a **low-friction social event flow**, not a security or anti-fraud system.

---

## 2. Product Goal

Create the fastest possible self-service check-in experience for a pickleball social event with minimal host involvement.

Target user experience:

**stand in front of camera → system recognizes or creates profile → gets queue number → done**

---

## 3. Scope

### In scope for this component

- Always-on kiosk camera screen
- Automatic face detection trigger
- Automatic photo capture when face is stable
- Face recognition against existing player profiles
- Automatic new player creation when no strong match exists
- 4-hour duplicate check-in rule
- Queue number generation
- Simple result states on screen
- Manual host override for edge cases
- Event/session-based check-in logging
- Built as a standalone component/module for later integration

### Out of scope for this first version

- Court assignment logic
- Payment
- Full attendee registration workflow
- QR code flow
- Deep profile editing
- Liveness detection
- Fraud prevention
- Cross-event analytics
- Full offline recognition
- Multi-camera setup
- Staff scheduling or permissions complexity

---

## 4. Users

### Primary users
- Players arriving at a pickleball social
- Host/staff supervising the kiosk

### Secondary users
- Admin/operator reviewing logs and duplicates later

---

## 5. Core Use Case

A tablet is placed on a stand near the entrance/check-in table.

The camera is always on.

A player walks up and looks at the camera.

The system:
1. detects a single face
2. waits for the face to be stable
3. auto-captures
4. checks whether the face matches an existing player
5. if matched and not checked in within the last 4 hours:
   - check in player
   - assign next queue number
   - display success
6. if matched but already checked in within the last 4 hours:
   - display already checked in
7. if not matched:
   - create a new player profile automatically
   - assign next queue number
   - display success

---

## 6. Success Metrics

### Product KPIs
- Average time from face detected to number shown: **under 3 seconds**
- Percentage of successful auto check-ins without host action: **80%+**
- Duplicate profile creation rate: **under 10% initially**
- Host intervention rate: **under 20%**
- Repeat check-in blocked correctly within 4 hours: **100% on server rule**

### UX KPIs
- Idle-to-result flow feels frictionless
- Host can supervise multiple arrivals without manually opening camera each time
- Result messages are readable from a distance

---

## 7. Functional Requirements

### 7.1 Kiosk Camera Screen
The component must provide a full-screen kiosk mode with:

- live camera preview always on
- clear idle instruction text
- minimal UI clutter
- automatic detection/capture flow
- large readable result state after processing

#### Idle state text
Example:
- “LOOK AT CAMERA”
- “ONE PERSON AT A TIME”

---

### 7.2 Face Detection Trigger
The component must continuously monitor the camera feed and only trigger capture when:

- exactly one face is visible
- face is large enough in frame
- face is centered enough
- face is stable for a short duration
- image is not obviously too dark or too blurry

#### Required behavior
- do not trigger capture if no face is visible
- do not trigger capture if multiple faces are visible
- do not repeatedly trigger on every frame

---

### 7.3 Auto-Capture
Once trigger conditions are met:

- automatically capture a frame
- send the image to backend for processing
- show a brief “Checking in…” state while processing

No manual tap should be required in the standard flow.

---

### 7.4 Recognition Flow
Backend must send captured face image to face recognition engine.

System should return one of the following outcomes:

#### Outcome A — Strong match found
- matched to existing player profile
- if last check-in more than 4 hours ago:
  - assign next queue number
  - log check-in
  - display welcome/result

#### Outcome B — Matched but already checked in
- matched to existing player profile
- if last check-in within 4 hours:
  - do not assign new number
  - display already checked in message

#### Outcome C — No strong match found
- create a new player profile
- store face enrollment
- assign next queue number
- log check-in
- display welcome/result

#### Outcome D — Uncertain match
- optional fallback behavior for MVP:
  - either auto-create new profile
  - or show host review mode

Recommended MVP behavior:
- if confidence is in a “gray zone,” show host review controls instead of auto-creating immediately

---

### 7.5 4-Hour Rule
Each person may only check in once every 4 hours.

#### Rules
- this must be enforced server-side
- even if kiosk triggers multiple times, server should reject duplicate check-ins within 4 hours
- UI should show a clear result:
  - “ALREADY CHECKED IN”

---

### 7.6 Queue Number Assignment
On successful new or returning eligible check-in:

- system assigns next available sequential number for the active event/session
- number is stored in database
- number is shown prominently on success screen

Example:
- “WELCOME BACK ALEX”
- “NUMBER 14”

---

### 7.7 New Player Creation
If no valid match is found:

- create a new player record automatically
- store face profile reference
- optionally store:
  - generated temporary name like “Player 142”
  - or no name at all until later enrichment

For MVP, no text input should be required in the normal kiosk flow.

---

### 7.8 Short Cooldown / Anti-Retrigger
After any result is shown, kiosk should temporarily ignore immediate repeated scans.

#### Required behavior
- freeze/hold result screen for around 1.5–2 seconds
- apply local cooldown to avoid same face being processed repeatedly for a short period
- then return to idle state

This cooldown is separate from the 4-hour business rule.

---

### 7.9 Multi-Face Handling
If more than one face is visible:

- do not capture
- display message:
  - “ONE PERSON AT A TIME”

System must wait until only one face remains.

---

### 7.10 Host Exception Controls
Although the flow is mostly automatic, host needs a minimal control panel for exceptions.

Required controls:
- retry capture
- manual confirm existing player from top candidates
- create new player manually
- mark as manual check-in
- return kiosk to idle

These controls can be hidden or accessed in a host-only mode.

---

### 7.11 Check-In Logs
Every recognition attempt should be logged.

Minimum fields:
- timestamp
- result type
- matched player id if any
- confidence score
- queue number if assigned
- whether host intervened
- event/session id
- image reference if retained

---

## 8. Non-Functional Requirements

### Speed
- kiosk should feel immediate
- target result response under 3 seconds
- UI transitions should be smooth and obvious

### Reliability
- server-side enforcement of duplicate logic
- camera stream should recover if interrupted
- failures should not crash kiosk screen

### Simplicity
- screen must be readable and usable by non-technical hosts
- no complex branching in the standard flow

### Privacy
- biometric data storage should be limited to what is necessary
- player consent and legal compliance handled at product/policy level
- face data should not be exposed to the browser beyond capture session needs

### Extensibility
- this component must be built as a separate module so it can later plug into main PWA
- face engine should be abstracted behind backend service layer for future replacement

---

## 9. UX Requirements

### 9.1 Main Screen States

#### State 1 — Idle
Display:
- live camera
- large instruction text
- subtle frame guide if useful
- message:
  - “LOOK AT CAMERA”

#### State 2 — Multi-face warning
Display:
- live camera
- message:
  - “ONE PERSON AT A TIME”

#### State 3 — Processing
Display:
- freeze frame or dark overlay
- message:
  - “CHECKING IN…”

#### State 4 — Success returning player
Display:
- player name if available
- queue number
- success styling
- optional sound

Example:
- “WELCOME BACK”
- “ALEX”
- “NUMBER 12”

#### State 5 — Success new player
Display:
- generic welcome
- queue number

Example:
- “WELCOME”
- “NUMBER 13”

#### State 6 — Already checked in
Display:
- “ALREADY CHECKED IN”
- optionally last assigned number

#### State 7 — Review needed
Display:
- top possible matches
- host controls only

---

### 9.2 Design Principles
- very large text
- high contrast
- minimal buttons
- no keyboard in normal flow
- one obvious result at a time
- optimized for standing distance visibility

---

## 10. Technical Architecture

### Recommended stack

#### Frontend
- separate React/Next.js component or route
- PWA-compatible
- browser camera access
- kiosk UI state machine

#### Backend
- Node.js API layer
- responsible for:
  - face recognition orchestration
  - 4-hour rule enforcement
  - number generation
  - player creation
  - logging

#### Face engine
- CompreFace for recognition and enrollment

#### Database
- Postgres / Supabase Postgres

---

## 11. System Design

### Frontend responsibilities
- live camera stream
- face detection trigger logic
- capture frame
- send image to backend
- render current kiosk state
- short local cooldown
- optional host exception panel

### Backend responsibilities
- validate active event/session
- send image to recognition service
- interpret confidence results
- decide matched/new/already-checked-in
- assign queue number
- create player if needed
- persist logs and player state
- return simple kiosk response

### Face engine responsibilities
- face search / recognition
- subject/profile enrollment
- embedding/comparison logic

---

## 12. Suggested Decision Logic

### Confidence bands
Backend should use configurable thresholds.

#### High confidence
- auto-match existing player

#### Medium confidence
- uncertain
- send top candidates for host review

#### Low confidence
- create new player

Thresholds must be configurable and not hardcoded permanently.

---

## 13. Proposed API Contract

### 13.1 Start / status
#### `GET /api/kiosk/session`
Returns:
- active event/session
- kiosk config
- cooldown settings
- threshold config (if frontend needs them)

---

### 13.2 Process face
#### `POST /api/kiosk/process-face`
Request:
- image
- kiosk_id
- event_id
- timestamp

Response example:
```json
{
  "status": "success",
  "resultType": "matched",
  "playerId": "player_123",
  "displayName": "Alex",
  "queueNumber": 14,
  "alreadyCheckedIn": false,
  "confidence": 0.91
}
```

Possible `resultType` values:
- `matched`
- `new_player`
- `already_checked_in`
- `needs_review`
- `multi_face`
- `no_face`
- `error`

---

### 13.3 Manual resolve
#### `POST /api/kiosk/manual-resolve`
Used by host if review is needed.

Request:
- attempt_id
- selected_player_id or create_new
- host_user_id

Response:
- final assigned result

---

### 13.4 Recent check-ins
#### `GET /api/kiosk/recent-checkins`
Returns last 10–20 check-ins for display or host quick correction.

---

## 14. Suggested Database Schema

### players
- id
- display_name
- face_subject_id
- created_at
- updated_at
- status

### events
- id
- name
- start_time
- end_time
- active

### event_checkins
- id
- event_id
- player_id
- queue_number
- checked_in_at
- checkin_method
- host_override
- created_at

### face_attempts
- id
- event_id
- matched_player_id nullable
- result_type
- confidence
- image_url nullable
- created_new_player
- host_reviewed
- created_at

### kiosk_devices
- id
- name
- location
- active
- created_at

---

## 15. Component Boundaries

This should be built as a **standalone module** with clean separation so it can later be integrated into the full PWA.

### Required boundaries
- separate route/page/component for kiosk
- separate service layer for face processing
- separate UI state machine for kiosk states
- no tight coupling to broader PWA navigation
- database and API design should support later reuse

---

## 16. MVP Acceptance Criteria

The component is considered successful when:

1. Camera remains live continuously on kiosk screen
2. Single face can trigger automatic capture without host action
3. Returning player can be recognized and checked in automatically
4. New player can be created automatically if no match found
5. Same person cannot receive another check-in within 4 hours
6. Queue number is generated and shown on success
7. Multi-face situations are blocked
8. Result screen returns to idle automatically
9. Host can resolve uncertain cases manually
10. Logs are saved for every attempt

---

## 17. Edge Cases

System should handle:

- no face visible
- multiple faces visible
- blurry capture
- dark lighting
- same person standing too long in front of kiosk
- same person tries again immediately
- same person returns within 4 hours
- uncertain recognition result
- backend timeout
- camera permission lost
- network failure
- CompreFace unavailable

---

## 18. Error Handling

### Camera unavailable
Display:
- “CAMERA NOT AVAILABLE”

### Network failure
Display:
- “NETWORK ERROR — TRY AGAIN”

### Recognition engine error
Display:
- “CHECK-IN TEMPORARILY UNAVAILABLE”

### Processing timeout
Display:
- “PLEASE TRY AGAIN”

In all cases, kiosk should recover to idle state without reload where possible.

---

## 19. Testing Plan

### Functional tests
- single known returning player
- single new player
- repeat same player within 4 hours
- multi-face frame
- uncertain match
- same player lingering in front of camera
- host override flow

### Real-world pilot tests
- different lighting conditions
- hats / glasses
- sweaty post-game faces
- partial side angle
- crowded arrival conditions

### Metrics to collect
- recognition success rate
- false new profile rate
- average processing time
- host intervention rate
- repeat-trigger rate

---

## 20. Future Enhancements

Not for MVP, but should remain possible later:

- integrate directly into full PWA
- court assignment linkage
- player naming/editing after automatic creation
- duplicate profile merge tool
- QR fallback
- richer admin dashboard
- multi-event face reuse
- quality scoring before capture
- optional MediaPipe for smoother local detection
- liveness checks if ever needed

---

## 21. Build Guidance for Cursor

### Build priorities
1. Get kiosk UI state machine working
2. Add live camera stream
3. Add face-detection trigger logic
4. Add backend endpoint for processing face
5. Connect backend to CompreFace
6. Implement 4-hour rule
7. Implement queue number generation
8. Add host review mode
9. Add logs
10. Polish result states

### Implementation preference
- keep code modular
- avoid coupling kiosk logic to the rest of the app
- make thresholds configurable via env or database
- abstract face engine behind a service interface
- keep UI minimal and fast

---

## 22. One-Sentence Product Summary

A standalone always-on face check-in kiosk component for pickleball socials that automatically recognizes or creates players, enforces one check-in per 4 hours, and instantly assigns a queue number with almost no host interaction.
