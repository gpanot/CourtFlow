# CourtPay RN V1 — Information Architecture & Flow Map

## Navigation Flow

```
Splash
  └─> Onboarding (first-launch only, 3 slides)
        └─> Staff Login (phone + password)
              └─> Continue As...
                    ├─> Staff Dashboard ──> Select Venue ──> Staff Home (tabs)
                    ├─> Admin ──> WebView shell (encapsulated web admin)
                    └─> Tablet ──> Select Venue ──> Select Tablet Mode
                                                        ├─> Self Check-in
                                                        └─> CourtPay Check-in
```

## Screen Inventory

### Auth & Entry (Stack Navigator)

| Screen            | Description                                            |
|-------------------|--------------------------------------------------------|
| Splash            | Brand splash, check persisted auth, auto-advance       |
| Onboarding        | 3-slide intro (skip if seen); stored in AsyncStorage   |
| StaffLogin        | Phone + password form; mirrors `/api/auth/staff-login` |
| ContinueAs        | Role/mode picker: Staff, Admin, Tablet                 |

### Staff Flow (Tab Navigator inside Stack)

| Screen                | Tab / Route      | Description                                       |
|-----------------------|------------------|---------------------------------------------------|
| VenueSelect           | (pre-tabs stack) | Pick venue from staff's assigned venues            |
| StaffHome             | —                | Tab container with bottom tabs                    |
| SessionTab            | Session          | Open/close session; session summary; history       |
| CheckInTab            | Check-in         | Face capture, phone lookup, register + payment     |
| PaymentTab            | Payment          | Pending payments list, confirm/cancel, paid history|
| StaffProfile          | (stack push)     | Profile settings, venue payment config, language   |

**Removed from PWA:** QR tab in top bar, queue/courts management tabs (rotation-coupled).

### Tablet Flow (Stack Navigator)

| Screen                | Description                                           |
|-----------------------|-------------------------------------------------------|
| VenueSelect           | Pick venue (shared with staff flow)                   |
| TabletModeSelect      | Choose Self Check-in or CourtPay; PIN lock/unlock     |
| SelfCheckIn           | Face scan → phone fallback → payment → confirmation   |
| CourtPayCheckIn       | Face scan → subscription check → payment → confirm    |

### Admin Flow

| Screen                | Description                                           |
|-----------------------|-------------------------------------------------------|
| AdminWebView          | Full-screen WebView pointing to web admin URL         |

## State Management

- **Auth store** (Zustand + MMKV/AsyncStorage persist): token, role, staffId, staffName, staffPhone, venueId, onboardingCompleted, rememberMe.
- **Feature flags store**: server-driven flags fetched per venue on venue select.
- **Socket**: socket.io-client for payment:confirmed, payment:cancelled, payment:new events.

## Navigation Structure (React Navigation)

```
RootStack (native stack)
  ├─ Splash
  ├─ Onboarding
  ├─ StaffLogin
  ├─ ContinueAs
  ├─ StaffStack (native stack)
  │     ├─ VenueSelect
  │     ├─ StaffTabs (bottom tab navigator)
  │     │     ├─ SessionTab
  │     │     ├─ CheckInTab
  │     │     └─ PaymentTab
  │     └─ StaffProfile
  ├─ TabletStack (native stack)
  │     ├─ VenueSelect
  │     ├─ TabletModeSelect
  │     ├─ SelfCheckIn
  │     └─ CourtPayCheckIn
  └─ AdminWebView
```

## Feature Flag Gating (V1)

Subscription-related features (package offers, subscription check-in bypass) are gated by server feature flags per venue. The app fetches flags on venue selection and conditionally renders subscription UI.

## Decoupled from CourtFlow Rotation

The following are explicitly excluded from V1:
- Court management (assign, maintenance, autofill)
- Queue management (add to queue, reorder, remove)
- Game lifecycle (start game, end game, rotation algorithm)
- Player app flows (wristband, QR join, game screens)
- TV wall display
