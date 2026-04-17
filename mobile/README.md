# CourtPay Mobile (Expo RN)

React Native (Expo) mobile app for CourtPay check-in and payment management, decoupled from CourtFlow rotation logic.

## Quick Start

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` / `a` for simulators.

## Architecture

- **Navigation:** React Navigation (native stack + bottom tabs)
- **State:** Zustand with SecureStore persistence for auth
- **API:** Adapter layer consuming existing CourtFlow REST APIs
- **Realtime:** socket.io-client for payment events
- **Admin:** WebView encapsulation of the web admin panel

## App Flow

```
Splash -> Onboarding -> Staff Login -> Continue As...
  ├── Staff Dashboard -> Venue Select -> Home Tabs (Session / Check-in / Payment)
  ├── Admin -> WebView
  └── Tablet -> Venue Select -> Mode Select -> Self Check-in | CourtPay Check-in
```

## Project Structure

```
src/
├── config/          # Environment configuration
├── stores/          # Zustand stores (auth, feature flags)
├── lib/             # API client, socket, VietQR, payment ref
├── types/           # TypeScript types (API contracts, CourtPay domain)
├── hooks/           # Custom hooks (socket, feature flags)
├── navigation/      # React Navigation setup
├── screens/
│   ├── auth/        # Splash, Onboarding, Login, ContinueAs
│   ├── staff/       # VenueSelect, Session/CheckIn/Payment tabs, Profile
│   ├── tablet/      # VenueSelect, ModeSelect, SelfCheckIn, CourtPayCheckIn
│   └── admin/       # AdminWebView
└── components/      # Shared reusable components
```

## Feature Flags

Subscription features are gated by server-driven feature flags per venue. The `useFeatureFlags` hook fetches flags on venue selection and the `useFeatureFlagsStore` controls UI visibility.

## Environment

Release builds default to the production Railway API. Override with `mobile/.env` (not the repo root `.env`, which is only for the web app):

- `EXPO_PUBLIC_API_BASE_URL` — CourtFlow backend (HTTPS in production)
- `EXPO_PUBLIC_SOCKET_URL` — Socket.io endpoint (defaults to API host)
- `EXPO_PUBLIC_ADMIN_WEB_URL` — Web admin URL for the embedded WebView

Internal QA against a LAN server in a release build: set `EXPO_PUBLIC_ALLOW_PRIVATE_API_IN_RELEASE=true` (never ship that to stores).
