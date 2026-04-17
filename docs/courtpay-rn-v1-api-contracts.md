# CourtPay RN V1 — API Contract Matrix

All endpoints use the existing CourtFlow server. The mobile app consumes them via HTTP with Bearer JWT auth (staff token) unless noted.

## Auth

| Endpoint                        | Method | Auth    | Screen         | Request Body                     | Response                                                      |
|---------------------------------|--------|---------|----------------|----------------------------------|---------------------------------------------------------------|
| `/api/auth/staff-login`         | POST   | None    | StaffLogin     | `{ phone, password }`            | `{ token, staffId, staffName, staffPhone, role, venues[] }`   |
| `/api/auth/staff-me`            | GET    | Staff   | StaffProfile   | —                                | `{ staffName, staffPhone }`                                   |

## Venue

| Endpoint                        | Method | Auth    | Screen         | Request Body / Query             | Response                                                      |
|---------------------------------|--------|---------|----------------|----------------------------------|---------------------------------------------------------------|
| `/api/venues/:venueId`          | GET    | Staff   | VenueSelect    | —                                | `{ id, name, settings, bankName, bankAccount, ... }`          |

## Session (Staff)

| Endpoint                                 | Method | Auth  | Screen      | Request Body / Query                        | Response                                   |
|------------------------------------------|--------|-------|-------------|---------------------------------------------|--------------------------------------------|
| `/api/courts/state`                      | GET    | Staff | SessionTab  | `?venueId=X`                                | `{ session, courts[], queueCount, ... }`   |
| `/api/sessions`                          | POST   | Staff | SessionTab  | `{ venueId, sessionFee?, gameTypeMix? }`    | `{ session }`                              |
| `/api/sessions/:sessionId/close`         | POST   | Staff | SessionTab  | `{}`                                        | `{ ok }`                                   |
| `/api/sessions/history`                  | GET    | Staff | SessionTab  | `?venueId=X`                                | `Session[]`                                |

## Check-in (Staff)

| Endpoint                                 | Method | Auth   | Screen      | Request Body                                | Response                                   |
|------------------------------------------|--------|--------|-------------|---------------------------------------------|--------------------------------------------|
| `/api/queue/check-walk-in-phone`         | GET    | Staff  | CheckInTab  | `?phone=X`                                  | `{ exists, player? }`                      |
| `/api/kiosk/register`                    | POST   | None*  | CheckInTab  | `{ name, phone, venueId, photo?, gender? }` | `{ checkInPlayer, pendingPayment?, qrUrl? }` |
| `/api/kiosk/cash-payment`               | POST   | None*  | CheckInTab  | `{ pendingPaymentId }`                      | `{ ok }`                                   |
| `/api/queue/analyze-face-quality`        | POST   | Staff  | CheckInTab  | FormData (image)                            | `{ quality, passesThreshold }`             |
| `/api/kiosk/process-face`               | POST   | None*  | CheckInTab  | FormData (image + venueId)                  | `{ matched, player? }`                     |

*Kiosk endpoints are unauthenticated (venue-scoped by body/query).

## Payment (Staff)

| Endpoint                                 | Method | Auth  | Screen       | Request Body                                | Response                                   |
|------------------------------------------|--------|-------|--------------|---------------------------------------------|--------------------------------------------|
| `/api/staff/pending-payments`            | GET    | Staff | PaymentTab   | `?venueId=X`                                | `PendingPayment[]`                         |
| `/api/staff/paid-payments`              | GET    | Staff | PaymentTab   | `?venueId=X`                                | `CheckInRecord[]`                          |
| `/api/staff/confirm-payment`             | POST   | Staff | PaymentTab   | `{ pendingPaymentId }`                      | `{ ok }`                                   |
| `/api/staff/cancel-payment`              | POST   | Staff | PaymentTab   | `{ pendingPaymentId }`                      | `{ ok }`                                   |

## Venue Payment Settings (Staff Profile)

| Endpoint                                 | Method | Auth  | Screen       | Request Body                                                   | Response                    |
|------------------------------------------|--------|-------|--------------|----------------------------------------------------------------|-----------------------------|
| `/api/staff/venue-payment-settings`      | GET    | Staff | StaffProfile | `?venueId=X`                                                  | `{ sessionFee, bankName, bankAccount, bankOwnerName, ... }`   |
| `/api/staff/venue-payment-settings`      | PATCH  | Staff | StaffProfile | `{ venueId, sessionFee?, bankName?, bankAccount?, bankOwnerName?, ... }` | `{ ok }` |

## Tablet — Self Check-in

| Endpoint                                 | Method | Auth   | Screen          | Request Body                                | Response                                     |
|------------------------------------------|--------|--------|-----------------|---------------------------------------------|----------------------------------------------|
| `/api/kiosk/checkin-payment`             | POST   | None*  | SelfCheckIn     | `{ venueId, checkInPlayerId }`              | `{ pendingPayment, qrUrl }`                  |
| `/api/kiosk/phone-check-in`             | POST   | None*  | SelfCheckIn     | `{ phone, venueId, phase }`                 | `{ player?, pendingPayment? }`               |
| `/api/kiosk/check-existing-face`        | POST   | None*  | SelfCheckIn     | FormData (image + venueId)                  | `{ matched, player? }`                       |
| `/api/kiosk/register`                   | POST   | None*  | SelfCheckIn     | `{ name, phone, venueId, photo? }`          | `{ checkInPlayer, pendingPayment?, qrUrl? }` |
| `/api/kiosk/cash-payment`               | POST   | None*  | SelfCheckIn     | `{ pendingPaymentId }`                      | `{ ok }`                                     |

## Tablet — CourtPay Check-in

| Endpoint                                 | Method | Auth   | Screen             | Request Body                                    | Response                              |
|------------------------------------------|--------|--------|--------------------|-------------------------------------------------|---------------------------------------|
| `/api/courtpay/face-checkin`             | POST   | None*  | CourtPayCheckIn    | FormData (image + venueId)                      | `{ matched, player?, subscription? }` |
| `/api/courtpay/identify`                | POST   | None*  | CourtPayCheckIn    | FormData (image + venueId)                      | `{ matched, player? }`               |
| `/api/courtpay/check-face`              | POST   | None*  | CourtPayCheckIn    | FormData (image + venueId)                      | `{ exists }`                          |
| `/api/courtpay/register`                | POST   | None*  | CourtPayCheckIn    | `{ name, phone, venueId, photo?, packageId? }`  | `{ checkInPlayer, pendingPayment? }`  |
| `/api/courtpay/pay-session`             | POST   | None*  | CourtPayCheckIn    | `{ checkInPlayerId, venueId, packageId? }`      | `{ pendingPayment?, qrUrl?, free? }`  |
| `/api/courtpay/cash-payment`            | POST   | None*  | CourtPayCheckIn    | `{ pendingPaymentId }`                          | `{ ok }`                              |
| `/api/courtpay/packages/:venueCode`     | GET    | None*  | CourtPayCheckIn    | —                                               | `Package[]`                           |

## WebSocket Events (socket.io-client)

| Event               | Direction | Used In                          | Payload                          |
|----------------------|-----------|----------------------------------|----------------------------------|
| `joinVenue`          | Client→Server | All screens after venue select | `{ venueId }`                  |
| `payment:new`        | Server→Client | PaymentTab                     | `{ pendingPayment }`           |
| `payment:confirmed`  | Server→Client | PaymentTab, CheckIn, Tablet    | `{ pendingPaymentId, paymentRef }` |
| `payment:cancelled`  | Server→Client | PaymentTab, CheckIn, Tablet    | `{ pendingPaymentId }`         |
| `session:updated`    | Server→Client | SessionTab                     | `{ session }`                  |

## Feature Flags

Fetched on venue selection. Server returns flags per venue/organization.

| Flag                      | Controls                                      | Default |
|---------------------------|-----------------------------------------------|---------|
| `courtpay_enabled`        | CourtPay tablet mode visibility               | true    |
| `subscriptions_enabled`   | Subscription offers and auto-check-in bypass  | false   |
| `face_recognition`        | Face scan features                            | true    |
| `cash_payment`            | Cash payment option                           | true    |

## Out of Scope (Rotation-Coupled)

These endpoints are NOT consumed by the RN app:

- `/api/courts/:courtId/start-game`
- `/api/courts/:courtId/end-game`
- `/api/queue/*` (except `check-walk-in-phone`)
- `/api/courts/:courtId` (PATCH for assign/maintenance)
- `/api/tv-queue/*`
