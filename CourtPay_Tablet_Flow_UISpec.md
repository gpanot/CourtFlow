# CourtPay Tablet Flow — UI/UX Spec for Figma
**Product:** CourtFlow / CourtPay Mobile App  
**Scope:** Tablet Kiosk flow — Login → Role Select → Venue Select → Mode Select → CourtPay Kiosk  
**Excluded:** Staff Dashboard, Admin Dashboard  
**Languages:** English (primary) / Vietnamese  
**Last updated:** April 2026

---

## Flow Overview

```
Splash
  └─► Onboarding (first time only)
        └─► Staff Login
              └─► Continue As (Role Select)
                    └─► [Tablet Mode] Tablet Venue Select
                          └─► Tablet Mode Select
                                └─► CourtPay Kiosk (locked kiosk)
                                      ├─ Home
                                      ├─ [Check In] Face Scan → ...payment flow
                                      └─ [First Time?] Registration → ...payment flow
```

---

## Screen Index

| # | Screen Name | Route / Step | Context |
|---|------------|-------------|---------|
| 1 | Splash | `Splash` | App boot |
| 2 | Onboarding (×3 slides) | `Onboarding` | First-time only |
| 3 | Staff Login | `StaffLogin` | Auth entry |
| 4 | Continue As (Role Select) | `ContinueAs` | Post-login hub |
| 5 | Tablet Venue Select | `TabletVenueSelect` | Tablet stack entry |
| 6 | Tablet Mode Select | `TabletModeSelect` | Kiosk config |
| 7 | Kiosk — Home | `CourtPayCheckIn` step: `home` | Kiosk idle state |
| 8 | Kiosk — Face Scan | step: `scan_returning` | Returning player |
| 9 | Kiosk — No Face Detected | step: `no_face` | Error recovery |
| 10 | Kiosk — Face Not Recognized | step: `needs_registration` | Unknown face |
| 11 | Kiosk — Phone Entry | step: `phone_enter` | Phone fallback |
| 12 | Kiosk — Phone Preview | step: `phone_preview` | Confirm identity |
| 13 | Kiosk — Registration: Camera | step: `reg_face_capture` | New player photo |
| 14 | Kiosk — Registration: Photo Preview | step: `reg_face_preview` | Confirm photo |
| 15 | Kiosk — Registration: Profile Form | step: `reg_form` | New player details |
| 16 | Kiosk — Subscription Offer | step: `subscription_offer` | Package upsell |
| 17 | Kiosk — Subscription Exhausted | step: `subscription_exhausted_offer` | Sub ran out |
| 18 | Kiosk — Awaiting Payment | step: `awaiting_payment` | VietQR / cash |
| 19 | Kiosk — Cash Overlay | Modal over `awaiting_payment` | Cash handoff |
| 20 | Kiosk — Confirmed | step: `confirmed` | Success |
| 21 | Kiosk — Already Paid | step: `already_paid` | Duplicate check-in |
| 22 | Kiosk — Existing User (reg conflict) | step: `existing_user` | Face already registered |
| 23 | Kiosk — Error | step: `error` | Generic error |
| 24 | Staff Escape — PIN Entry | Modal (5-tap + PIN) | Staff unlock |

---

## Global Design Tokens

### Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `bg` | `#ffffff` | `#0f172a` | Screen background |
| `card` | `#f8fafc` | `#1e293b` | Card fill |
| `border` | `#e2e8f0` | `#334155` | Card/input borders |
| `text` | `#0f172a` | `#f1f5f9` | Primary text |
| `muted` | `#64748b` | `#94a3b8` | Secondary text |
| `subtle` | `#94a3b8` | `#64748b` | Placeholder, icons |
| `green400` | `#4ade80` | same | Accent highlights |
| `green500` | `#22c55e` | same | Primary CTAs |
| `green600` | `#16a34a` | same | CTA fill |
| `blue400` | `#60a5fa` | same | Staff role accent |
| `purple400` | `#c084fc` | same | Admin role accent |
| `red400` | `#f87171` | same | Destructive actions |

### CourtPay Accent System (Kiosk only)
Four selectable accent themes. Each provides: `primary`, `primaryLight`, `primaryDark`, `text`, `amountText`, `pulseDot`, `successCircle`, `glassOverlay`, `scannerBorder`, `bg`.

| Accent | Primary | Primary Light |
|--------|---------|---------------|
| `green` | `#22c55e` | `#4ade80` |
| `fuchsia` | `#d946ef` | `#e879f9` |
| `blue` | `#3b82f6` | `#60a5fa` |
| `amber` | `#f59e0b` | `#fbbf24` |

### LiquidGlass Surface
- `BlurView` with optional tint; used for all kiosk cards and panels
- iOS: intensity 40–52 (native blur), Android: intensity 72–88 (simulated)
- Backdrop: animated color orbs via `CourtPayLiquidBackdrop`

### Typography
| Style | Size | Weight |
|-------|------|--------|
| Brand / H1 | 34 | 800 |
| Screen title | 26 | 700 |
| Card title | 19 | 700 |
| Body | 15 | 400 |
| Caption / muted | 13–14 | 400–500 |
| KPI value | 32–36 | 700–800 |

### Shared Components
- **`TabletLanguageToggle`** — EN / VI pill, top-right corner (appears on Login, Continue As)
- **`CourtFlowKioskTopBar`** — CourtFlow logo mark + "CourtPay" wordmark, tagline, EN/VI toggle, optional theme toggle — visible only on Kiosk Home
- **`TabletStaffEscape`** — hidden escape trigger (5-tap on `⋯` icon, bottom-right) → PIN entry modal

---

## Screen Specifications

---

### Screen 1 — Splash

**Purpose:** App boot, auth hydration, route decision.

**Layout:**
- Full-screen dark background (`bg`)
- Center-aligned:
  - Brand wordmark "CourtPay" — H1, bold
  - Subtitle "Check-in & Payment" — body, muted
  - `ActivityIndicator` (green, large) below subtitle

**Logic (not visible):**
- 800ms delay → routes to: `Onboarding` (first time) → `StaffLogin` (not logged in) → `ContinueAs` (logged in)

**Figma notes:** No interactive elements. Single artboard, light + dark variant.

---

### Screen 2 — Onboarding (3 slides)

**Purpose:** First-time feature overview.

**Layout:**
- Full-screen, dark bg
- Top-right: "Skip" pill (green tint bg, green text)
- Center (per slide):
  - Circle icon container (92×92, card bg, border) with Ionicon (48px, green500)
  - Title — H1 (26, bold)
  - Body text — muted, centered, line-height 22
- Bottom fixed footer:
  - Progress dots (8px circles, green500 active = 22px wide pill)
  - "Next" / "Get Started" CTA — full-width green button (56px tall, arrow icon)

**Slides:**
| # | Icon | Title | Body |
|---|------|-------|------|
| 1 | `card-outline` | Seamless Payments | "Accept VietQR and cash payments for session check-ins with automatic confirmation." |
| 2 | `people-outline` | Fast Check-in | "Use face recognition or phone lookup to check players in within seconds." |
| 3 | `bar-chart-outline` | Session Management | "Open and close sessions, track revenue, and manage your venue from one place." |

**Interactions:**
- Swipe left / tap "Next" → advance slide
- Last slide: CTA changes to "Get Started" → navigate to `StaffLogin`
- "Skip" → jump directly to `StaffLogin`

---

### Screen 3 — Staff Login

**Purpose:** Staff authentication.

**Layout:**
- Full-screen, dark bg, keyboard-avoiding
- Top-right absolute: `TabletLanguageToggle` (EN/VI)
- Center content:
  - Brand "CourtPay" — 34px, weight 800, centered
  - Subtitle "Staff Login" (i18n: `loginStaffLogin`) — 15px, muted, centered, mb 36
  - **Login Card** (rounded-16, card bg, border):
    - Phone input row: `call-outline` icon (18px, subtle) + text input (`phone-pad`)
    - Password input row: `lock-closed-outline` icon + text input (secure) + eye toggle button (`eye-outline` / `eye-off-outline`)
    - "Sign In" CTA button — full-width, 48px, green600, bold white text; disabled state at 50% opacity
    - "View onboarding" text link — centered, dimmed text

**States:**
- Default — empty fields
- Typing — live field updates
- Loading — spinner replaces "Sign In" text, button disabled
- Error — `Alert.alert("Error", "Please enter phone and password")` for empty fields; `Alert.alert("Login Failed", message)` for API error

**On success:** → Navigate to `ContinueAs`

---

### Screen 4 — Continue As (Role Select)

**Purpose:** Post-login role/mode hub. Staff selects their intended workflow.

**Layout:**
- Full-screen, dark bg, paddingTop = safeArea + 16, paddingH 20
- Top-right: `TabletLanguageToggle`
- **Welcome pill** (top-left): hand icon (green400) + "Welcome, [Name]" — green tinted pill with green border, radius 20
- **Title** "Continue as" (26px, bold) — below pill, mb 6
- **Subtitle** "Select your role to get started" (14px, muted) — mb 32
- **Mode Cards** (vertical list, gap 10):
  - Each card: row layout, card bg, border, radius 14, padding 16
  - Left: 48×48 icon container (rounded-12, tinted bg) + Ionicon (24px, accent)
  - Middle: Label (16px, semibold) + Description (13px, muted, mt 2) — flex 1
  - Right: `chevron-forward` (18px, dimmed)

**Mode cards (visible by role):**

| Card | Icon | Accent | Label | Description | Route |
|------|------|--------|-------|-------------|-------|
| Staff Dashboard | `people-outline` | Blue (`#60a5fa`) | "Staff Dashboard" | "Manage sessions, check-ins, and payments" | `StaffStack` |
| Admin | `settings-outline` | Purple (`#c084fc`) | "Admin" | "Full admin panel (web view)" | `AdminWebView` |
| Tablet Mode | `tablet-landscape-outline` | Green (`#4ade80`) | "Tablet Mode" | "Self check-in or CourtPay kiosk" | `TabletStack` |

> Admin card only shown for `role === "superadmin"`.

- **Sign Out button** — bottom, row layout, `log-out-outline` (red400) + "Sign out" text (red400, semibold), red tinted bg, radius 12, height 48, mt 32

**Interactions:**
- Tap card → navigate to respective stack
- Admin card (non-superadmin) → `Alert` "Access restricted"
- Sign Out → confirm alert → clearAuth → reset to `StaffLogin`

---

### Screen 5 — Tablet Venue Select

**Purpose:** Staff chooses which venue to operate the tablet kiosk for.

**Layout (via `VenueSelectList` component):**
- Full-screen, dark bg
- **Header row**: Back button (`arrow-back`) + Title "Select Venue (Tablet)"
- **Session status indicator** per venue: small dot/tag showing "open" (green), "closed" (muted), or "unknown"
- **Venue list**: scrollable, each item:
  - Venue name — title text
  - Session status badge — colored pill
  - Chevron or selection indicator
- **Loading state**: skeleton / spinner while fetching venues
- **Empty/error**: refresh trigger, alert on API failure

**Interactions:**
- Tap venue → `setVenue(id)` → connect WebSocket → `socketJoinVenue(id)` → navigate to `TabletModeSelect`
- Back → parent navigate to `ContinueAs`
- Pull to refresh → re-fetch venues + session statuses

---

### Screen 6 — Tablet Mode Select

**Purpose:** Configure the kiosk before deploying. Staff chooses kiosk mode and appearance.

**Layout:**
- Full-screen, adaptive bg (light/dark), paddingTop = safeArea + 40, paddingH 20
- **Header** (centered):
  - Title "Select Tablet Mode" (26px, bold)
  - Subtitle "Choose how this device will be used" (14px, muted), mt 6
- **Mode Card** — one large card (border, card bg, radius 16, padding 24, centered):
  - Icon container (64×64, rounded-16, green tint bg `rgba(34,197,94,0.13)`): `card-outline` icon (32px, `#22c55e`)
  - Title "CourtPay Check-in" (19px, bold)
  - Description "Payment-first check-in with subscription support" (14px, muted, centered, line-height 20)
- **Theme Toggle Row** (mt 20, card bg, border, radius 14, paddingV 14, paddingH 16):
  - Left: 36×36 icon circle (sun/moon icon, 18px): amber `#f59e0b` in light mode, yellow `#facc15` in dark
  - Center (flex 1): Label "Light Mode" / "Dark Mode" (15px, semibold) + Hint "Applies to CourtPay kiosk screens" (12px, muted)
  - Right: Custom toggle switch (44×26 track, 20×20 thumb) — green-tinted track when light, grey when dark
- **Accent Color Row** (mt 12, card bg, border, radius 14, paddingV 14, paddingH 16):
  - Label "Accent Color" (15px, semibold)
  - 4 swatches (32×32 circles, gap 10):
    - Green `#22c55e`, Fuchsia `#d946ef`, Blue `#3b82f6`, Amber `#f59e0b`
    - Active swatch: `checkmark` icon + white border (2.5px) + drop shadow
- **Loading indicator** (large spinner, blue500) — shows while checking session status
- **Back link** (mt 28, centered): `arrow-back` (16px, muted) + "Back to Venues" text (14px, muted)

**Interactions:**
- Tap mode card → `GET /api/courts/state` → if session open → navigate to `CourtPayCheckIn`; if no session → `Alert` "No Active Session / Please open a session from the Staff Dashboard"
- Theme toggle → toggles light/dark mode (persisted via `useThemeStore`)
- Accent swatch → sets accent color (persisted)
- Back link → pop to `TabletVenueSelect`

> **Note for Figma:** Show 2 states — loading (spinner visible on card) and idle.

---

## CourtPay Kiosk Screens (Steps 7–24)

> All kiosk screens share:
> - `CourtPayLiquidBackdrop` — full-screen animated gradient orbs using accent color
> - `LiquidGlassSurface` cards/panels — frosted glass with BlurView
> - Android back button is disabled (locked kiosk mode)
> - 30-second idle timer resets to Home (except on active interaction steps)
> - `TabletStaffEscape` component (hidden, bottom-right `⋯` icon — 5 rapid taps → PIN modal)

---

### Screen 7 — Kiosk: Home

**Purpose:** Idle kiosk state. Player self-selects their check-in path.

**Layout:**
- Full-screen kiosk with `CourtPayLiquidBackdrop`
- **`CourtFlowKioskTopBar`** (fixed top):
  - Left: CourtFlow logo mark
  - Center: "CourtPay" wordmark
  - Right: EN/VI language toggle + theme toggle icon
  - Below: Tagline text (`courtpayTagline`: "CourtPay" / locale-specific)
- **Center content** (vertically centered):
  - Optional venue logo circle (animated spin if `logoSpin` setting enabled) — 120×120, circular
  - Venue name (muted, below logo) — if available
  - **Two action cards** (side-by-side or stacked, glass surface):
    - **Check In card** (`LiquidGlassSurface`, accent tint):
      - `ScanFace` icon (40px, accent text color)
      - Title "Check In" (bold)
      - Subtitle "I've played here before" (muted)
    - **First Time? card** (`LiquidGlassSurface`, neutral/no accent):
      - `UserPlus` icon (40px, `#a3a3a3`)
      - Title "First Time?" (bold)
      - Subtitle "Register & pay to play" (muted)
- **Hidden escape** (bottom-right): invisible `⋯` hit area (5 taps → PIN)

**Interactions:**
- Tap "Check In" → step `scan_returning`
- Tap "First Time?" → step `reg_face_capture`

**Figma notes:** Show light + dark variants × 4 accent colors = 8 artboards. Mark `TabletStaffEscape` zone with annotation.

---

### Screen 8 — Kiosk: Face Scan (Returning Player)

**Purpose:** Camera-based facial recognition for returning players.

**Layout (via `SelfCheckInReturningFaceScanner`):**
- Full-screen camera view, accent overlay
- **Instruction states** (animated text):
  - "Position your face — scanning starts in a moment"
  - "Hold still — scanning now"
  - "Scanning..."
  - "Next scan in [N]s"
  - "No match yet — adjust if needed"
- **Action buttons** (bottom):
  - "Check in with phone" (secondary, ghost) — fallback
  - "Back" (ghost, text link)
- Camera permission prompt (if not granted):
  - Title + hint text
  - "Allow Camera" CTA

**Result outcomes:**
| API Result | Next Step |
|-----------|-----------|
| `matched` | → subscription routing → payment |
| `needs_registration` | → `needs_registration` step |
| `no_face` / `multi_face` | → continue scanning |
| `already_paid` | → `already_paid` step |
| `error` | → `error` step |
| Exhausted retries | → `no_face` step |

---

### Screen 9 — Kiosk: No Face Detected

**Purpose:** Recovery screen when camera cannot detect a face.

**Layout (`LiquidGlassSurface` panel, `accent="none"`):**
- Icon: `scan-outline` (56px, amber `#fbbf24`)
- Title: "No face detected" (formTitle style)
- Subtitle: "Look at the camera and try again"
- **CTA 1 (primary):** "Try again" → step `scan_returning`
- **CTA 2 (secondary ghost):** `call-outline` icon + "Use phone number instead" → step `phone_enter`
- **Text link:** "Back to Home" → `resetToHome`

---

### Screen 10 — Kiosk: Face Not Recognized

**Purpose:** Face was scanned but not found in the database.

**Layout (`LiquidGlassSurface`, `accent="amber"`):**
- Back arrow (top-left, `arrow-back`) → `resetToHome`
- Icon: `alert-circle-outline` (60px, `#f59e0b`)
- Title: "Face not recognised"
- Subtitle: "Try checking in with your phone number, or scan again"
- **CTA 1 (large primary):** "Scan Again" → step `scan_returning`
- **CTA 2 (phone, darker accent):** `call-outline` icon + "Check in with phone" → step `phone_enter`

---

### Screen 11 — Kiosk: Phone Entry

**Purpose:** Player enters phone number to look themselves up.

**Layout (`LiquidGlassSurface`, accent tint):**
- Card inner layout:
  - **Header row:** back arrow (`arrow-back`) + title "Check in by phone"
  - Hint text: "Enter your phone number"
  - Large phone input (`bigInput` style) — auto-focus, `phone-pad` keyboard, placeholder "Phone number"
  - Error text (red) — shown when phone not found
  - **"Look up" CTA** (primary, accent bg) — disabled if empty or loading; spinner when loading

**Interactions:**
- Valid phone → `POST /api/courtpay/identify` → if found → step `phone_preview`; if not found → inline error "No player found with this phone number"
- Back → `resetToHome`

---

### Screen 12 — Kiosk: Phone Preview

**Purpose:** Confirm player identity before check-in.

**Layout (`LiquidGlassSurface`, accent tint):**
- **Header row:** back arrow + player name (large)
- Info box:
  - "Phone: [number]"
  - "Level: [skill level]" (if set)
- **"Confirm check-in" CTA** (primary, accent bg, full-width) — spinner when loading

**Interactions:**
- Confirm → subscription routing → navigate to payment or `confirmed`
- Back → return to `phone_enter`

---

### Screen 13 — Kiosk: Registration — Camera

**Purpose:** New player takes their registration photo.

**Layout:**
- Full-screen camera view
- **Top bar**: back arrow (ghost, top-left)
- **Center:**
  - Title "Let's set up your profile"
  - Hint "First, look at the camera"
  - **Circular camera view** (260×260 circle, `regCircleOuter` with accent border color)
    - Live front-facing camera feed (mirrored)
  - **Shutter button** (large, accent bg, camera icon 36px, centered below circle) — circular button
    - Disabled/spinner state while capturing

**Camera permission state (no permission):**
- `LiquidGlassSurface` panel
- Title: "Camera access"
- Hint: "Allow the camera to take your registration photo."
- "Allow Camera" CTA
- "Back" link

**Interactions:**
- Tap shutter → capture photo → step `reg_face_preview`
- Back → `resetToHome`

---

### Screen 14 — Kiosk: Registration — Photo Preview

**Purpose:** Player confirms their captured photo before proceeding.

**Layout:**
- Center-aligned content, paddingH 20
- Title: "Got your photo!" (accent text color)
- **Circle photo preview** (260×260, same border treatment as camera view)
  - Captured image displayed as `cover`
- **Action row:**
  - "Looks good →" CTA (accent bg, rounded) — spinner while verifying face
  - "Retake" ghost button — returns to camera

**Interactions:**
- "Looks good" → `POST /api/courtpay/check-face` → if face exists → step `existing_user`; if new → step `reg_form`
- "Retake" → clears photo, back to step `reg_face_capture`

---

### Screen 15 — Kiosk: Registration — Profile Form

**Purpose:** New player fills in their details.

**Layout (scrollable, `LiquidGlassSurface`, `accent="none"`):**
- **Header row:** back arrow + title "Let's set up your profile"
- **Name field:** label "Name" + large text input (auto-focus)
- **Phone field:** label "Phone number" + phone-pad input
- **Gender selector:** label "Gender" + 2 pill toggle buttons ("Male" / "Female") — accent bg when selected, border when not
- **Level selector:** label "Level" + 3 pill toggle buttons ("Beginner" / "Intermediate" / "Advanced") — each with description subtext in tooltip/caption
- **"Next" CTA** (primary, accent bg, full-width) — disabled until all fields filled (name, phone, gender, level + face photo exists); spinner when loading

**Skill level options:**

| Value | EN Label | EN Description |
|-------|----------|----------------|
| `beginner` | Beginner | "New to pickleball" |
| `intermediate` | Intermediate | "Know the rules, can rally" |
| `advanced` | Advanced | "Competitive play" |

**On submit:**
- If packages available + `showSubscriptionsInFlow` → step `subscription_offer`
- Otherwise → `POST /api/courtpay/register` → payment routing

---

### Screen 16 — Kiosk: Subscription Offer

**Purpose:** Upsell player to buy a session package before paying.

**Layout (scrollable):**
- Back arrow (top-left, absolute, above scroll) → `resetToHome`
- **Greeting:** "Welcome back, [Name]!" (returning) or "Welcome to the club, [Name]!" (new) — large text
- **Subtitle:** "Save with a package today?" / "Want to save with a package?"
- **Package list** (vertical, each item is a `LiquidGlassSurface` card):
  - Package name (bold, right margin for badges)
  - Meta: "[N] sessions · [N] days" or "Unlimited · [N] days"
  - Price (VND formatted, large)
  - Optional **"Best Choice"** badge (top-right, accent bg)
  - Optional **"Save X%"** badge (discount, below Best Choice)
  - Selected state: accent border + accent tint overlay
- **"Continue" CTA** (primary, full-width) — disabled until package selected; spinner when loading
- **OR separator** (horizontal line, "OR" text centered)
- **"Pay for Today Only" card** (`LiquidGlassSurface`, neutral):
  - Title "Pay for Today Only"
  - Description "Single session — no package required"
  - Session fee amount (if set)
  - Chevron right

**Interactions:**
- Tap package → select/deselect
- "Continue" → `doPaySession(player, selectedPkg)` → payment routing
- "Pay for Today Only" → `doPaySession(player)` → payment routing (single session)
- Back → `resetToHome`

---

### Screen 17 — Kiosk: Subscription Exhausted

**Purpose:** Player's subscription has run out of sessions — they're still checked in, but shown renewal options.

**Layout (scrollable):**
- Back arrow (top-left, absolute) → `resetToHome`
- **Success circle** (accent bg, `checkmark` icon 42px)
- **Greeting:** "Welcome back, [Name]!"
- **Subtitle:** "You are in — consider buying a new package for next time."
- **KPI row** (2 glass cards side-by-side):
  - Ticket icon + value "0" + label "Sessions Left"
  - Calendar icon + value "[N]" + label "Days Left"
- **Default state (countdown visible):**
  - Countdown text: "Returning to menu in [N]s…" (30s auto-reset)
  - "Show New Packages" CTA (primary)
  - "Next time" text link → `resetToHome`
- **Expanded state (after "Show New Packages" tapped):**
  - Countdown hidden
  - Full package list (same as Screen 16 package cards)
  - "Continue" CTA (accent, disabled until selection)
  - "Next time" text link

---

### Screen 18 — Kiosk: Awaiting Payment

**Purpose:** Display VietQR payment code for player to scan.

**Layout (`LiquidGlassSurface`, accent tint):**
- **Title:** "Almost there, [Name]!" (new player) or "Payment" (returning)
- **Hint:** "Scan with your banking app then show staff to confirm"
- **QR code** (large image, if available): centered, square, white bg container
- **Amount:** formatted VND, large accent color text
- **"Pay by cash" button** (secondary/outline): `cash-outline` icon + "Pay by cash"
  - Hint below: "Tell staff you're paying cash"
- **"Cancel" text link** (ghost, bottom) → cancel payment → `resetToHome`
- **Pulse animation** on payment amount (dot indicator)

**Interactions:**
- QR payment: player scans via banking app → staff confirms → `payment:confirmed` socket event → step `confirmed`
- "Pay by cash" → `POST /api/courtpay/cash-payment` → shows Cash Overlay modal (Screen 19)
- "Cancel" → `POST /api/kiosk/cancel-payment` → `resetToHome`

---

### Screen 19 — Kiosk: Cash Payment Overlay

**Purpose:** Modal overlay instructing player to hand cash to staff while waiting.

**Layout (Modal, full-screen overlay, semi-transparent dark bg):**
- Centered card content:
  - Icon: `cash-outline` or bills icon (large)
  - Title: "Cash Payment"
  - Hint: "Please hand the cash to the staff.\nWaiting for staff to confirm…"
  - Animated spinner / pulse dots
  - **"Cancel — go back" text link** (ghost)

**Behavior:**
- Overlay persists until staff confirms (`payment:confirmed` socket → step `confirmed`) or player cancels
- Cancel → calls cancel API → closes overlay, `resetToHome`

---

### Screen 20 — Kiosk: Confirmed (Success)

**Purpose:** Check-in / payment success screen with auto-return countdown.

**Layout:**
- Animated success circle (accent bg, `checkmark` icon)
- **Greeting:**
  - New player: "Welcome to the club, [Name]!"
  - Returning: "Welcome back, [Name]!"
- **Optional KPI cards** (2 glass cards, if subscription):
  - Sessions remaining / Unlimited
  - Days left
- **Confirmation message** (centered, muted)
- **Countdown:** "Returning to menu in [N]s…" (10s auto-reset)
- **"Done" CTA** (primary, accent) → immediate `resetToHome`

---

### Screen 21 — Kiosk: Already Paid

**Purpose:** Player scanned/entered phone but already has a paid/pending payment this session.

**Layout (via `CourtPayStatusCard` component):**
- Status card variant: `already_paid`
- Optional face image (circular, if captured)
- Title: "[Name] already paid" or "Already paid"
- Subtitle:
  - `pending` status: "Payment is pending confirmation — no new payment needed."
  - `confirmed` status: "This player has already paid for this session."
- **Primary CTA** → `resetToHome`

---

### Screen 22 — Kiosk: Existing User (Registration Conflict)

**Purpose:** Player tried to register but their face is already in the system.

**Layout (via `CourtPayStatusCard` component):**
- Status card variant: `existing_user`
- Icon: warning or person icon
- Title: "[Name] already exists. Use Check In." or "Existing player"
- Hint: "This face is already registered. Please use Check In."
- **Primary CTA** → `resetToHome` or → step `scan_returning`

---

### Screen 23 — Kiosk: Error

**Purpose:** Generic error fallback.

**Layout (`LiquidGlassSurface` panel, `accent="none"`):**
- Icon: `alert-circle-outline` or similar (amber/red)
- Title: "Something went wrong"
- Error message text (dynamic)
- **"Try again" CTA** (primary) → `resetToHome`

---

### Screen 24 — Staff Escape: PIN Entry

**Purpose:** Hidden mechanism for staff to exit the locked kiosk.

**Trigger:** 5 rapid taps on the `⋯` (`ellipsis-horizontal`) icon in the bottom-right corner within a short time window.

**Layout (Modal, full-screen):**
- Centered content:
  - Lock icon (`lock-closed`, 44px, blue)
  - Title: "Enter PIN to unlock" (19px, semibold)
  - PIN input (4-digit, numeric, secure, centered, wide letter-spacing, auto-focus)
    - Width 160, height 52
  - **"Unlock" CTA** (blue bg, 44px tall)

**Interactions:**
- Correct PIN → dismiss modal → navigate to `TabletModeSelect`
- Wrong PIN → `Alert` "Wrong PIN" → clear input, try again

---

## Navigation & Flow Diagram (for Figma Prototype)

### Pre-Kiosk Setup Flow
```
Splash ──────────────────────────────────────────────►
  └── [no onboarding] ─► StaffLogin
  └── [first time]    ─► Onboarding ─► StaffLogin
                               StaffLogin ─► ContinueAs
                                   ContinueAs
                                     ├── [Staff Dashboard] ─► (out of scope)
                                     ├── [Admin] ─► (out of scope)
                                     └── [Tablet Mode] ─► TabletVenueSelect
                                                             └── TabletModeSelect
                                                                   └── CourtPayCheckIn (Home)
```

### Kiosk Internal Flow (CourtPayCheckIn steps)
```
Home
  ├── [Check In] ──► Face Scan
  │                   ├── matched ──────────────────────► subscription routing
  │                   ├── needs_registration ───────────► needs_registration step
  │                   ├── no_face/retries exhausted ────► no_face step
  │                   ├── already_paid ─────────────────► already_paid step
  │                   └── error ────────────────────────► error step
  │
  └── [First Time?] ─► reg_face_capture
                          └── capture ─► reg_face_preview
                                           ├── face exists ─► existing_user
                                           └── new face ───► reg_form
                                                               └── next ──► subscription routing

subscription routing
  ├── active sub + sessions left ─► doPaySession (auto, no offer) ──► confirmed / exhausted_offer
  ├── packages available + enabled ─► subscription_offer ──────────► awaiting_payment or confirmed
  └── no packages ─────────────────► doPaySession ────────────────► awaiting_payment or confirmed

phone fallback (from no_face / needs_registration)
  └── phone_enter ─► phone_preview ─► subscription routing

awaiting_payment
  ├── QR scan (async socket) ─► confirmed
  ├── cash ─► cash overlay ─► confirmed (via socket)
  └── cancel ─► Home

confirmed ──► (10s countdown) ──► Home
exhausted_offer ──► (30s countdown) ──► Home (or buy package ──► awaiting_payment)
already_paid ──► Home
existing_user ──► Home or Face Scan
error ──► Home
```

---

## Figma File Structure Recommendation

```
CourtPay / Tablet Flow
  ├── 00 - Tokens
  │   ├── Colors (light + dark)
  │   ├── CourtPay Accent System (4 accents)
  │   ├── Typography
  │   └── Component library
  │       ├── TabletLanguageToggle
  │       ├── CourtFlowKioskTopBar
  │       ├── LiquidGlassSurface (variants: none, green, fuchsia, blue, amber)
  │       ├── PackageCard
  │       ├── VenueListItem
  │       └── ModeCard
  │
  ├── 01 - Pre-Login
  │   ├── Splash (light / dark)
  │   ├── Onboarding - Slide 1
  │   ├── Onboarding - Slide 2
  │   ├── Onboarding - Slide 3
  │   └── Staff Login (light / dark)
  │
  ├── 02 - Role & Setup
  │   ├── Continue As - 2 cards (staff + tablet)
  │   ├── Continue As - 3 cards (staff + admin + tablet)
  │   ├── Tablet Venue Select
  │   └── Tablet Mode Select (idle / loading)
  │
  ├── 03 - Kiosk Home
  │   ├── Home - Green Accent (light + dark)
  │   ├── Home - Fuchsia Accent
  │   ├── Home - Blue Accent
  │   └── Home - Amber Accent
  │
  ├── 04 - Check In Flow (Returning)
  │   ├── Face Scan (scanning)
  │   ├── Face Scan (no permission)
  │   ├── No Face Detected
  │   ├── Face Not Recognized
  │   ├── Phone Entry
  │   └── Phone Preview
  │
  ├── 05 - Registration Flow (New Player)
  │   ├── Camera - awaiting
  │   ├── Camera - capturing
  │   ├── Photo Preview
  │   ├── Registration Form (empty / filled)
  │   └── Existing User (conflict)
  │
  ├── 06 - Payment Flow
  │   ├── Subscription Offer (no selection / selected)
  │   ├── Subscription Exhausted (default / expanded)
  │   ├── Awaiting Payment (QR shown)
  │   ├── Cash Overlay (waiting)
  │   └── Confirmed (with sub KPIs / without)
  │
  ├── 07 - Terminal States
  │   ├── Already Paid
  │   └── Error
  │
  └── 08 - Staff Escape
      └── PIN Entry Modal
```

---

## Key UX Notes for Redesign

1. **Kiosk is touch-first, tablet-optimized**: All tap targets should be minimum 56px tall, generous touch areas.
2. **Glass morphism aesthetic**: Cards use frosted glass layered over animated gradient backdrop — a signature CourtPay visual.
3. **Bilingual by default**: Every string has EN + VI. Language toggle is always accessible on pre-kiosk screens; on kiosk home it lives in the top bar.
4. **Idle timeout**: 30 seconds of inactivity on most steps → silent reset to Home. Visual countdown only shown on `confirmed` (10s) and `exhausted_offer` (30s).
5. **No back gesture on kiosk**: Android hardware back disabled. Navigation only via on-screen buttons.
6. **Hidden staff escape**: The `⋯` tap zone should be visually invisible — do NOT label or hint at it. Design as a dead zone in the bottom-right corner.
7. **Accent system drives kiosk identity**: The chosen accent color should bleed into every interactive element — CTAs, borders, text highlights, backdrop orbs. The accent is set pre-kiosk and cannot be changed by the player.
8. **Session gate**: The kiosk cannot launch without an open session (`status === "open"`) — this is enforced at `TabletModeSelect`.
9. **Face scanner is continuous**: Unlike a one-shot button, the face scanner auto-fires every few seconds until a result or retry limit.
10. **Subscription flow is optional**: Staff can toggle "Show packages in flow" — if off, players skip directly from identity verification to payment.
