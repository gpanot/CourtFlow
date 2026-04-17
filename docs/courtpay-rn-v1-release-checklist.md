# CourtPay RN V1 — Release Checklist

## Pre-release QA Matrix

### Auth & Navigation
- [ ] Fresh install: splash -> onboarding (3 slides) -> login
- [ ] Login with valid staff credentials
- [ ] Login with invalid credentials (error displayed)
- [ ] ContinueAs: Staff / Admin / Tablet mode selection works
- [ ] Logout from ContinueAs and Profile screens
- [ ] Session persistence: kill app, reopen -> resumes at ContinueAs
- [ ] Onboarding seen flag persists across reinstalls

### Staff Dashboard Mode
- [ ] Venue selection displays all assigned venues
- [ ] Session Tab: open session -> status shows "open" with fee
- [ ] Session Tab: close session -> confirmation dialog -> status updates
- [ ] Session Tab: pull-to-refresh loads latest state
- [ ] Session Tab: session history shows recent sessions
- [ ] Session Tab: profile icon navigates to StaffProfile
- [ ] Check-in Tab: phone lookup finds existing player
- [ ] Check-in Tab: register new player -> payment flow
- [ ] Check-in Tab: VietQR image displays correctly
- [ ] Check-in Tab: cash payment confirmation works
- [ ] Check-in Tab: socket payment:confirmed auto-advances to success
- [ ] Check-in Tab: success -> "Next Check-in" resets form
- [ ] Payment Tab: pending list loads and displays correctly
- [ ] Payment Tab: confirm payment -> moves to paid list
- [ ] Payment Tab: cancel payment -> removes from pending
- [ ] Payment Tab: revenue total updates correctly
- [ ] Payment Tab: socket events update lists in real-time
- [ ] Staff Profile: loads venue payment settings
- [ ] Staff Profile: edit and save session fee, bank details
- [ ] Staff Profile: QR preview renders with current settings
- [ ] Staff Profile: bank selector scrolls and selects correctly

### Tablet Mode
- [ ] Venue selection works for tablet flow
- [ ] Mode selector shows Self Check-in and CourtPay options
- [ ] Mode selector blocks access when no open session
- [ ] Self Check-in: phone input -> lookup -> existing player check-in
- [ ] Self Check-in: new player registration -> payment
- [ ] Self Check-in: VietQR display and cash fallback
- [ ] Self Check-in: socket confirmation advances to success
- [ ] Self Check-in: idle timeout returns to home
- [ ] CourtPay Check-in: phone input -> existing player flow
- [ ] CourtPay Check-in: subscription packages display (when enabled)
- [ ] CourtPay Check-in: pay-session flow with VietQR
- [ ] CourtPay Check-in: new player registration + payment
- [ ] CourtPay Check-in: cash payment works
- [ ] CourtPay Check-in: idle timeout returns to home

### Admin WebView
- [ ] WebView loads admin panel with injected auth token
- [ ] Back button navigates within WebView, then exits
- [ ] Reload button refreshes the WebView

### Feature Flags
- [ ] Subscription UI hidden when subscriptions_enabled = false
- [ ] Subscription packages shown when subscriptions_enabled = true
- [ ] Graceful fallback when feature-flags endpoint unavailable

### Cross-cutting
- [ ] Socket.io connects and receives payment events across all modes
- [ ] Error handling: network errors show user-friendly alerts
- [ ] Dark mode: UI renders correctly with dark color scheme
- [ ] Tablet orientation: landscape layout is usable
- [ ] iOS and Android: test on both platforms

## Build & Distribution
- [ ] `npx expo prebuild` generates clean iOS/Android projects
- [ ] iOS: archive builds and signs correctly
- [ ] Android: APK/AAB builds correctly
- [ ] EAS Build configured (if using Expo Application Services)
- [ ] App icons and splash screen are correct

## Post-launch Monitoring
- [ ] Crash reporting configured (Sentry/Bugsnag)
- [ ] Basic analytics events for key user flows
- [ ] Payment confirmation success rate monitored
- [ ] Socket connection reliability tracked
