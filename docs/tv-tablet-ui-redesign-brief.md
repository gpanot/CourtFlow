# CourtFlow — TV Tablet UI/UX Redesign Brief

**Document type:** Design brief for Figma UI/UX redesign  
**Surface:** TV Tablet (`/tv-queue/[venueId]`)  
**Stack for reference:** Next.js 16, React 19, Tailwind CSS v4, dark theme  
**Related surface:** TV Wall Display (`/tv`) — shares branding tokens  

---

## 1. Context & Purpose

CourtFlow is a **pickleball court management** system used at physical venues. The TV Tablet is an iPad/Android tablet mounted at two distinct locations inside a venue:

1. **Entrance tablet** — players check in when they arrive at the venue
2. **Queue join tablet** — players scan their face to join the queue for the next available court (placed near the wall TV display)

The tablet is a **self-service kiosk** running in a locked browser mode. Staff set it up once via PIN, then players interact with it unassisted. It must work in:
- Portrait and landscape orientations
- High ambient light (sports hall)
- Touch-only (no keyboard/mouse except during registration)
- Bilingual EN/VI (English and Vietnamese)

---

## 2. Current Architecture — Two Tablet Modes

### Mode Setup Flow (staff-only, one-time)

Before any player interaction, staff configure the tablet via a PIN-protected setup screen:

```
[Loading spinner]
     ↓
[PIN Pad — 4-digit, PIN: 0000]
     ↓
[Mode Selector — choose "Self Check-in" or "Join Queue"]
     ↓
[Locked into selected mode — saved in localStorage]
```

Staff can re-enter PIN by tapping a small `···` button in the bottom-right corner 5 times within 3 seconds.

---

## 3. Mode A — Entrance Self Check-In Tablet

**Route:** `/tv-queue/[venueId]` with mode=`entrance`  
**Component:** `SelfCheckInScanner`  
**Purpose:** Player check-in at the venue entrance — face recognition identifies returning players; new players register here.

### 3.1 Screen States (State Machine)

The component is a full state machine. Each state is a full-screen view:

| State | Background | Description |
|-------|-----------|-------------|
| `home` | Black | Default resting screen — player chooses Check In or First Time |
| `scanning` | Black | Camera active, face being captured (returning player flow) |
| `confirmed` | Black | Successful check-in confirmation |
| `already_checked_in` | Black | Player already checked in today |
| `no_face` | Amber-950 | No face detected after 3 attempts |
| `error` | Red-950 | Generic error |
| `network_error` | Red-950 | Offline — may show cached last check-in number |
| `needs_registration` | Neutral-900 | Face not in system — prompt to scan again or use phone |
| `existing_user` | Amber-950 | Face already registered (caught during new user reg) |
| `phone_enter` | Black | Phone number fallback check-in — input field |
| `phone_preview` | Black | Show matched player, confirm check-in |
| `wristband_enter` | Black | Wristband number lookup fallback |
| `reg_face_capture` | Black | New user — camera capture for registration photo |
| `reg_face_preview` | Black | Preview captured photo, confirm or retake |
| `reg_form` | Black | New user registration form |
| `payment_waiting` | Black | VietQR payment QR code displayed, waiting for staff confirmation |
| `payment_cash` | Black | Cash payment selected, waiting for staff to confirm |
| `payment_timeout` | Red-950 | Payment timed out after 3 minutes |
| `payment_cancelled` | Red-950 | Payment cancelled by staff |

### 3.2 Screen-by-Screen Details

---

#### HOME

**Purpose:** Default idle screen — entry point for all player interactions.

**Elements:**
- Language toggle (EN/VI) — top-right corner, absolute positioned
- Venue logo — circular avatar (96×96px), optional (if venue has logo), optional spin animation
- Venue name — small subtitle below logo
- **Primary CTA button:** "Check In" (face scan path)
  - Icon: face scan icon (ScanFace)
  - Title: bold, large
  - Subtitle: smaller hint text
  - Style: green border + green tinted background (`border-green-600/50`, `bg-green-900/30`)
- **Secondary CTA button:** "First Time? Register"
  - Icon: UserPlus
  - Style: neutral border + subtle background
- Both buttons: tall pill shape (`rounded-3xl`), left-aligned content, icon + text layout

**Behavior:** No auto-reset on home — it's the resting state.

---

#### SCANNING (Returning player face scan)

**Purpose:** Camera capture for face recognition.

**Elements:**
- Status text (top, centered):
  - `adjust` phase: "Position your face in the camera"
  - `capturing` phase: "Hold still…"
  - `between_retries` phase: "No match yet — trying again"
- Camera preview: `8:9` aspect ratio box, mirrored horizontally, `rounded-2xl`, green border glow (`border-green-600/40`, `shadow-green-900/20`)
- Overlay (only during `between_retries`): semi-transparent black overlay showing countdown timer in large green numbers
- Loading indicator (during `capturing`): spinner + "Scanning…" text
- Camera ready hint (during `adjust`): subtle neutral text

**Behavior:**
- Up to 3 face recognition attempts automatically
- 2-second pause between failed attempts with countdown
- On success → transitions to appropriate result state
- On persistent failure → `needs_registration` state

---

#### CONFIRMED

Two sub-variants depending on whether it's a **new** or **returning** player:

**New player (just registered + paid):**
- Large green checkmark circle (80×80px)
- Headline: "Welcome to [Venue], [Name]!"
- Large queue number (7xl, white)
- Supporting text: "Your face is now registered" + "Head to the TV to track your turn"

**Returning player:**
- Uses `KioskConfirmationScreen` component (shared with staff)
- Shows: player name, queue number (large), queue position, skill level, session count, returning/new label

**Behavior:** Auto-resets to home after 8 seconds.

---

#### ALREADY CHECKED IN

**Elements:**
- Same as returning player `confirmed` layout via `KioskConfirmationScreen`
- Indicates player is already checked in today

**Behavior:** Auto-resets to home after 8 seconds.

---

#### NO FACE DETECTED

**Elements:**
- Red/amber warning icon circle
- "No face detected" headline
- "Please look directly at the camera" message

**Behavior:** Auto-resets to home after 3 seconds.

---

#### ERROR

**Elements:**
- Red warning icon circle
- "Something went wrong" headline
- Error message text (from API)

**Behavior:** Auto-resets to home after 3 seconds.

---

#### NETWORK ERROR

**Elements (offline, no cache):**
- Warning icon circle (red)
- "Network issue" headline
- "Please see staff" message

**Elements (offline, cached data available):**
- Amber notice: "Showing your last check-in"
- Large queue number in green
- Player name
- Small note: "Will sync when back online"

**Behavior:** Auto-resets to home after 15 seconds.

---

#### NEEDS REGISTRATION (face not in system)

**Purpose:** Player scanned but face not recognized — offer retry or phone fallback.

**Elements:**
- Back button (top-left, arrow)
- Language toggle (top-right)
- "Face not recognized" headline
- Hint text
- **Primary CTA:** "Scan Again" (green pill button, full width)
- **Secondary CTA:** "Check In with Phone Number" (blue button with phone icon)

---

#### EXISTING USER (caught during new reg)

**Purpose:** Player tried to register but face already exists.

**Elements:**
- Amber warning icon
- "Already registered" headline
- "Please use Check In" hint

**Behavior:** Auto-resets to home after ~2 seconds.

---

#### PHONE ENTER

**Purpose:** Manual phone number lookup fallback.

**Elements:**
- Card container (`rounded-xl`, neutral border, dark background)
- Back button + "Check In by Phone Number" title
- Hint text
- Phone number input field (`type="tel"`, large text)
- Error message (if lookup fails)
- "Look Up" button (blue, full width)

---

#### PHONE PREVIEW

**Purpose:** Confirm matched player before checking in.

**Elements:**
- Card container
- Back button + player name as title
- Info row: phone number, skill level
- Alert (if already checked in today): amber text + queue number
- Error message
- "Confirm Check-In" button (green, full width)

---

#### WRISTBAND ENTER

**Purpose:** Check in via wristband number.

**Elements:**
- Card container
- Back button + "Enter Wristband Number" title
- Number input (large, numeric)
- Error message
- "Look Up" button (green)

---

#### REG FACE CAPTURE

**Purpose:** Camera capture for new player registration photo.

**Elements:**
- Title: "Register — Step 1"
- Hint: "Position your face in the circle"
- Camera preview: **circular** (`rounded-full`), aspect-square, green glow border
- "📸" capture button (large, green pill)
- "Go Back" link below

---

#### REG FACE PREVIEW

**Purpose:** Confirm captured registration photo.

**Elements:**
- "Great photo!" headline (green)
- Captured photo displayed in circle (224–256px diameter), green border + green glow
- **Two buttons side by side:**
  - "Looks Good →" (green, flex-1)
  - "Retake" (neutral)

---

#### REG FORM

**Purpose:** New player fills in profile details.

**Elements (scrollable card):**
- Name input + Gender toggle (M/F buttons, side by side in row)
  - Male: blue accent when selected
  - Female: pink accent when selected
- Phone number input
- Skill level selector: 3-column grid (Beginner / Intermediate / Advanced)
  - Green border + tint when selected
- "Next →" submit button (green, full width)
  - Disabled until all fields filled

---

#### PAYMENT WAITING (VietQR)

**Purpose:** Payment required — show QR code for bank transfer.

**Elements:**
- Back button (top-left)
- Title: "Payment for [Name]" or "Complete your payment"
- VietQR image (white card container, ~288px wide)
- Amount in large green text (Vietnamese VND format)
- Instructions text
- Pulsing green dot + "Waiting for staff to confirm…"
- Divider with "OR"
- "Pay by Cash" button (amber tint)

---

#### PAYMENT CASH

**Purpose:** Player selected cash — waiting for staff to accept.

**Elements:**
- 💵 emoji in amber circle
- "Pay [Amount] VND to staff"
- Pulsing amber dot + "Waiting for staff to confirm…"

---

#### PAYMENT TIMEOUT

**Elements:**
- Red warning circle
- "Payment timed out" headline
- Hint text
- "Try Again" button (green)

---

#### PAYMENT CANCELLED

**Elements:**
- Red X circle
- "Payment cancelled" headline
- Hint text

**Behavior:** Auto-resets to home after 10 seconds.

---

### 3.3 Entrance Tablet — Navigation Flow Diagram

```
HOME
├── [Check In] → SCANNING
│   ├── face matched + no payment → CONFIRMED / ALREADY_CHECKED_IN
│   ├── face matched + payment → PAYMENT_WAITING
│   │   └── [Pay by Cash] → PAYMENT_CASH
│   │       ├── staff confirms → CONFIRMED
│   │       └── staff cancels → PAYMENT_CANCELLED
│   ├── needs_registration → NEEDS_REGISTRATION
│   │   ├── [Scan Again] → SCANNING
│   │   └── [Check In with Phone] → PHONE_ENTER → PHONE_PREVIEW → (payment flow)
│   ├── no_face (3 failed attempts) → NO_FACE → HOME (3s)
│   └── error → ERROR → HOME (3s)
│
└── [First Time] → REG_FACE_CAPTURE
    └── [📸] → REG_FACE_PREVIEW
        ├── [Looks Good] → REG_FORM → PAYMENT_WAITING → (payment flow)
        └── [Retake] → REG_FACE_CAPTURE
```

---

## 4. Mode B — Queue Join Tablet

**Route:** `/tv-queue/[venueId]` with mode=`tv`  
**Component:** `TvQueueScanner`  
**Purpose:** Player joins the queue for the next available court. Face recognition links them to their check-in record.

### 4.1 Screen States

| State | Background | Description |
|-------|-----------|-------------|
| `idle` | Black | Default — "Scan to Join" CTA |
| `scanning` | Black | Camera active |
| `joined` | Green-950 | Successfully joined queue |
| `already_queued` | Amber-950 | Already in queue — shows position |
| `playing` | Blue-950 | Currently on a court — can't queue |
| `not_checked_in` | Red-950 | Not checked in yet |
| `not_recognised` | Neutral-900 | Face not recognized — retry or enter number |
| `error` | Red-950 | Error state |

### 4.2 Screen-by-Screen Details

---

#### IDLE

**Purpose:** Default resting screen.

**Elements:**
- Language toggle (EN/VI) — top-right, absolute
- Large decorative circle (128×128px, green border ring — `border-green-500/40`, hollow)
- Title: "Ready to Join?" (4xl bold)
- Hint text: "Tap below to scan your face and join the queue"
- **Primary CTA:** "Scan to Join" (full-width, extra-tall green pill button, `py-7`)
- Fine print: "You must check in at the entrance first"

---

#### SCANNING

**Elements:**
- Status text:
  - `adjust`: "Position your face in the camera"
  - `capturing`: "Hold still…"
  - `between_retries`: "No match yet — adjusting"
- Camera preview: `8:9` aspect ratio, green glow border, mirrored
- Between-retries overlay: countdown in large green numbers on dark overlay
- Loading spinner + "Scanning…" during capture phase

---

#### JOINED ✓

**Purpose:** Confirmation — player is now in queue.

**Elements:**
- Green checkmark circle (80×80px, green-600 bg)
- Queue number: `#42` — very large (7xl), green-400
- Queue position: "X ahead of you" (2xl, green-300)
- Player name: "Welcome back, [Name]!" (xl, white)

**Behavior:** Auto-resets to idle after 2 seconds.

---

#### ALREADY QUEUED

**Elements:**
- Amber checkmark circle
- "You're already in the queue!" (amber-300)
- "X people ahead of you" (amber-200)
- "No need to scan again" (neutral-400)

**Behavior:** Auto-resets to idle after 3 seconds.

---

#### PLAYING

**Elements:**
- 🏓 paddle emoji in blue circle
- "You're playing on [Court X]!" (blue-300)
- "Finish your current game first" (neutral-400)

**Behavior:** Auto-resets to idle after 3 seconds.

---

#### NOT CHECKED IN

**Elements:**
- Red `!` circle
- "Please check in first" (red-300)
- "Go to the entrance tablet to check in" (neutral-400)

**Behavior:** Auto-resets to idle after 3 seconds.

---

#### NOT RECOGNISED

**Purpose:** Face not matched — allow retry or manual number entry.

**Elements:**
- Language toggle (top-right)
- "Face not recognized" headline
- Hint: "Try again or enter your queue number"
- **Primary CTA:** "Scan to Join" (green pill, full width)
- **Number fallback:**
  - `#` number input (large, centered, numeric)
  - "Join by Number" button (neutral-700)

---

#### ERROR

**Elements:**
- Red warning triangle circle
- Error message text

**Behavior:** Auto-resets to idle after 3 seconds.

---

### 4.3 Queue Join Tablet — Navigation Flow Diagram

```
IDLE
└── [Scan to Join] → SCANNING
    ├── joined → JOINED → IDLE (2s)
    ├── already_queued → ALREADY_QUEUED → IDLE (3s)
    ├── playing → PLAYING → IDLE (3s)
    ├── not_checked_in → NOT_CHECKED_IN → IDLE (3s)
    ├── not_recognised → NOT_RECOGNISED
    │   ├── [Scan to Join] → SCANNING
    │   └── [Join by Number] → JOINED/ERROR
    └── error → ERROR → IDLE (3s)
```

---

## 5. Shared Setup Screens (Staff-Only)

These appear before the tablet is locked into a mode.

### 5.1 Loading

- Full-screen black
- Centered spinner (green on neutral track)

### 5.2 PIN Pad

**Elements:**
- "Staff Setup" title + "Enter PIN to configure this tablet" subtitle
- 4-dot PIN indicator row (green when filled, red on error)
- Error text: "Wrong PIN — try again"
- 3×4 numpad grid:
  - Keys 1–9: `rounded-2xl`, 64×64px, neutral-800 bg
  - Empty slot (bottom-left): blank
  - `0` key
  - Backspace `⌫` key: smaller text, neutral tint
- Cancel link (only if a mode was previously set)

### 5.3 Mode Selector

**Elements:**
- "Select Tablet Mode" title + "Choose this tablet's function" subtitle
- Two large option cards:
  - **Self Check-in** — `UserCheck` icon (green), green border+tint, description: "Place at the entrance for player check-in"
  - **Join Queue** — `Monitor` icon (blue), blue border+tint, description: "Place near TV for players to join the queue"
- Each card: `rounded-2xl`, `p-6`, icon 40×40px, icon + title/subtitle layout

---

## 6. Persistent Elements

### Tablet Header (always visible when locked in a mode)

```
[ CourtFlow Logo ]  •  [ "Pickleball Court Management" tagline ]
```

- Small `CourtFlowLogo` component (dark variant)
- Tagline text (small, neutral-300)
- Centered horizontally, bottom border `border-neutral-800`
- Short fixed height (`py-3`)

### Staff Escape Button (always visible in locked mode)

- Fixed `bottom-3 right-3`
- Small circular button (40×40px)
- `···` (MoreHorizontal) icon
- Translucent dark background, subtle border
- Label: "Staff: tap 5 times to change mode"
- Invisible until hover/focus for clean UX

### Language Toggle (EN/VI)

- Appears on: `idle`, `not_recognised` (queue scanner), `home`, `needs_registration` (check-in)
- Top-right, absolute positioned (z-index 20)
- Toggle between EN and VI locales
- Stored in `localStorage`

---

## 7. Current Design Tokens

| Token | Value |
|-------|-------|
| Background (default) | `#000000` |
| Background (card) | `neutral-900` / `#111` |
| Background (error) | `red-950` |
| Background (warning) | `amber-950` |
| Background (success) | `green-950` |
| Background (active/playing) | `blue-950` |
| Text primary | `white` |
| Text secondary | `neutral-400` |
| Text muted | `neutral-500` / `neutral-600` |
| Accent / brand | `green-500` / `green-600` |
| Accent secondary | `blue-600` |
| Accent warning | `amber-600` / `amber-700` |
| Accent error | `red-600` / `red-700` |
| Border default | `neutral-800` / `neutral-700` |
| Border accent | `green-600/40` |

### Typography Scale (tablet — standard viewport)

| Usage | Size | Weight |
|-------|------|--------|
| Section headline | `text-3xl` (1.875rem) | Bold |
| Card title | `text-2xl` (1.5rem) | Bold |
| Body / CTA | `text-xl` (1.25rem) | Medium / Semibold |
| CTA button | `text-2xl` → `text-3xl` on large | Bold |
| Queue number (large) | `text-7xl` (4.5rem) | Bold |
| Label / hint | `text-lg` (1.125rem) | Regular |
| Fine print | `text-sm` (0.875rem) | Regular |

---

## 8. Known UX Pain Points / Redesign Opportunities

1. **Camera feedback is minimal** — the user has no clear visual "framing guide" to know where to position their face (currently just a bordered rectangle). Consider a face outline overlay.

2. **Idle state (Queue Join) uses a hollow circle as the main visual** — decorative but disconnected from the face scan action.

3. **State transitions are abrupt** — color changes (black → green-950 → black) happen instantly. Animations would help communicate success/failure more expressively.

4. **The `not_recognised` state** mixes "retry" and "manual number" into one screen — could be clearer with a two-step flow or tabbed approach.

5. **Registration flow is multi-step but has no progress indicator** — user doesn't know they're on step 2 of 4.

6. **Payment waiting screen** is functional but plain — a large QR code on white with minimal surrounding context. Could feel more trustworthy with better hierarchy.

7. **Language toggle** is inconsistently positioned across screens (sometimes top-right absolute, sometimes absent). Should be persistent.

8. **The tablet header** is minimal — just logo + tagline. On the entrance tablet, displaying the venue name or current session status could add context.

9. **Error states all look the same** — same red circle + icon pattern. Differentiation in tone (error vs. warning vs. info) is mostly via color but not shape or iconography.

10. **No "return home" affordance on most states** — users rely on auto-reset timers. A visible "Start Over" tap target would be more user-friendly.

---

## 9. Screens Inventory for Figma

### Mode Setup (3 screens)
1. Loading / Splash
2. PIN Pad
3. Mode Selector

### Entrance Check-In Tablet (18 screens)
4. Home
5. Scanning — Adjust phase
6. Scanning — Capturing phase
7. Scanning — Between retries (with countdown overlay)
8. Confirmed — New player
9. Confirmed — Returning player
10. Already Checked In
11. No Face Detected
12. Error
13. Network Error (no cache)
14. Network Error (with cached data)
15. Needs Registration
16. Existing User
17. Phone Enter
18. Phone Preview
19. Wristband Enter
20. Reg Face Capture
21. Reg Face Preview

### Entrance Check-In — Registration Form Screens
22. Reg Form — Empty
23. Reg Form — Filled (all fields valid)

### Entrance Check-In — Payment Screens
24. Payment Waiting (VietQR)
25. Payment Cash
26. Payment Timeout
27. Payment Cancelled

### Queue Join Tablet (7 screens)
28. Idle / Ready
29. Scanning — Adjust phase
30. Scanning — Capturing phase
31. Scanning — Between retries
32. Joined Successfully
33. Already Queued
34. Playing on Court
35. Not Checked In
36. Not Recognised (face fallback + number input)
37. Error

**Total: ~37 screens**  
*(Some states reuse layout patterns — the confirmed/already-checked-in share `KioskConfirmationScreen`)*

---

## 10. Component Reuse Notes

- `KioskConfirmationScreen` — shared between staff check-in panel and the entrance tablet for returning player confirmation. Any redesign of this component will affect both surfaces.
- `CameraCapture` — generic camera component used in both modes. Styling/framing changes should happen in the parent component, not inside `CameraCapture`.
- `TvTabletLanguageToggle` — used in both scanner components; redesign as a standalone component.
- `CourtFlowLogo` — used in tablet header; dark variant.

---

## 11. Related Surfaces (Out of Scope for This Brief)

- **TV Wall Display (`/tv`)** — the large-format display showing courts grid, queue strip, QR code. Uses the same branding tokens but is a read-only display, not interactive.
- **Staff Dashboard** — staff-facing version of check-in with full queue/court management. Some components overlap (e.g., `KioskConfirmationScreen`).
- **Player App (`/player`)** — mobile PWA for player self-service, separate surface entirely.
