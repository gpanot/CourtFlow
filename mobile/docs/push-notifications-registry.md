# Push Notifications Registry — CourtFlow

Last updated: 2026-06-30

This document is the **single source of truth** for every push notification in the CourtFlow mobile app. Update it whenever a new notification is added, changed, or removed.

---

## Architecture summary

```
Server (firebase-admin / src/lib/staff-push.ts)
  → FCM message (notification + data keys)
    → Android: system presents via FCM notification key
    → iOS:     APNs → presented by system
    → Expo JS layer receives data in addNotificationResponseReceivedListener
```

**Two separate push audiences:**

| Audience | Table | Channel | Scope |
|---|---|---|---|
| Staff (venue workers) | `staff_push_tokens` (venueId set) | `courtpay_payments` | Scoped to a venue |
| Coaches | `staff_push_tokens` (venueId = null) | `coach_lessons` | Scoped to the coach's own staffId |

Both use the same `StaffMember.pushNotificationsEnabled` flag and the same register/unregister API endpoints.

---

## Token registration

### Staff (venue-scoped)

- Hook: `mobile/src/hooks/useStaffPushRegistration.ts`
- Bootstrap: `mobile/src/components/StaffPushBootstrap.tsx`
- Registers with: `POST /api/staff/push/register` — body includes `{ token, venueId, platform }`
- Active when: `pushNotificationsEnabled === true` AND a `venueId` is selected
- Android channel created: `courtpay_payments`

### Coach (not venue-scoped)

- Hook: `mobile/src/hooks/useCoachPushRegistration.ts`
- Bootstrap: `mobile/src/components/CoachPushBootstrap.tsx`
- Registers with: `POST /api/staff/push/register` — body includes `{ token, platform }` (no `venueId`)
  - Server validates `isCoach === true` when `venueId` is omitted
- Active when: `pushNotificationsEnabled === true` AND a JWT token exists
- Android channel created: `coach_lessons`

### Shared API endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/staff/push/register` | Register/refresh FCM token |
| `POST` | `/api/staff/push/unregister` | Remove specific or all tokens for this staff member |
| `POST` | `/api/staff/push/preferences` | Toggle `pushNotificationsEnabled` flag |
| `GET` | `/api/auth/staff-me` | Sync `pushNotificationsEnabled` on app launch |

### Toggle UI

- **Staff:** `mobile/src/screens/staff/…` (existing staff settings screen)
- **Coach:** `mobile/src/screens/coach/CoachProfileScreen.tsx` — Switch component in the "Push Notifications" row

---

## Notification catalog

### A. Staff notifications (existing)

These are sent to venue staff when payment events occur. They use **data-only FCM** (no `notification` key) so Expo's JS handler presents them.

---

#### A1 — New payment submitted

| Field | Value |
|---|---|
| **Event name** | `payment_new` |
| **Trigger** | Player submits a payment proof or SePay webhook fires for a court booking |
| **Sender** | `sendPaymentPushToStaff("payment_new", ctx)` in `src/lib/staff-push.ts` |
| **Recipient** | All active staff with `pushNotificationsEnabled = true` at the venue |
| **Channel** | `courtpay_payments` |
| **Title** | `Approve Payment · {playerName} — {amount} VND ({method})` |
| **Body** | `{playerName} — {amount} VND ({method})` |
| **Data keys** | `event`, `venueId`, `pendingPaymentId`, `screen: "PaymentTab"` |
| **FCM format** | Data-only (no `notification` key) |
| **Wired in** | `src/modules/courtpay/lib/sepay.ts` |

---

#### A2 — Payment confirmed

| Field | Value |
|---|---|
| **Event name** | `payment_confirmed` |
| **Trigger** | Payment is approved/confirmed by staff or automatically |
| **Sender** | `sendPaymentPushToStaff("payment_confirmed", ctx)` in `src/lib/staff-push.ts` |
| **Recipient** | All active staff with `pushNotificationsEnabled = true` at the venue |
| **Channel** | `courtpay_payments` |
| **Title** | `Payment Confirmed · {playerName} — {amount} VND ({method})` |
| **Body** | `{playerName} — {amount} VND ({method})` |
| **Data keys** | `event`, `venueId`, `pendingPaymentId`, `screen: "PaymentTab"` |
| **FCM format** | Data-only (no `notification` key) |
| **Wired in** | `src/modules/courtpay/lib/sepay.ts`, payment confirm routes |

---

### B. Coach notifications (added 2026-06-30)

These are sent directly to a specific coach (by `staffId`) when their lesson changes state. They use the **`notification` key** so they are displayed in both foreground and background on all platforms without requiring the app to be open.

**Server function:** `sendPushToCoach(ctx)` and `sendCoachLessonPushFromCtx(ctx, event)` in `src/lib/staff-push.ts`

**Guard:** only sends if `StaffMember.pushNotificationsEnabled === true` for the coach.

---

#### B1 — New booking pending approval

| Field | Value |
|---|---|
| **Event name** | `lesson_pending` |
| **Trigger** | Student uploads payment proof for a one-time lesson |
| **API route** | `POST /api/public/coach-sessions/[id]/proof` |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `New booking — {studentName}` |
| **Body** | `Pending approval · {date} · {time}` |
| **Data keys** | `event: "lesson_pending"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |
| **When NOT sent** | Credit-based bookings (auto-confirmed directly, see B5) |

---

#### B2 — Booking confirmed (payment approved)

| Field | Value |
|---|---|
| **Event name** | `lesson_confirmed` |
| **Trigger** | Staff member approves the student's payment proof |
| **API route** | `PATCH /api/admin/coach-lessons/[id]/approve-payment` |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `Lesson confirmed ✓ — {studentName}` |
| **Body** | `{date} · {time}` |
| **Data keys** | `event: "lesson_confirmed"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |

---

#### B3 — Booking rejected (payment proof rejected)

| Field | Value |
|---|---|
| **Event name** | `lesson_rejected` |
| **Trigger** | Staff member rejects the student's payment proof |
| **API route** | `PATCH /api/admin/coach-lessons/[id]/reject-payment` |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `Booking rejected — {studentName}` |
| **Body** | `The student's payment proof was rejected by staff` |
| **Data keys** | `event: "lesson_rejected"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |

---

#### B4 — Lesson cancelled (student self-cancel)

| Field | Value |
|---|---|
| **Event name** | `lesson_cancelled` |
| **Trigger** | Student cancels their own lesson (>48 h before start) |
| **API route** | `POST /api/public/coach-sessions/[id]/cancel` |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `Lesson cancelled — {studentName}` |
| **Body** | `{date} · {time}` |
| **Data keys** | `event: "lesson_cancelled"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |
| **Note** | Staff-initiated cancellations go through a separate admin route; push is not yet wired there |

---

#### B5 — Lesson auto-confirmed (SePay bank transfer)

| Field | Value |
|---|---|
| **Event name** | `lesson_auto_confirmed` |
| **Trigger** | SePay webhook matches payment reference, auto-confirms the lesson |
| **Server file** | `src/modules/courtpay/lib/sepay.ts` |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `Lesson auto-confirmed ✓ — {studentName}` |
| **Body** | `Payment confirmed · {date} · {time}` |
| **Data keys** | `event: "lesson_auto_confirmed"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |

---

#### B6 — Lesson auto-confirmed (credit booking)

| Field | Value |
|---|---|
| **Event name** | `lesson_auto_confirmed` |
| **Trigger** | Student books using a pre-purchased credit — no payment proof needed |
| **Server file** | `src/lib/coach-lesson.ts` (credit deduction path) |
| **Recipient** | The lesson's coach |
| **Channel** | `coach_lessons` |
| **Title** | `Lesson auto-confirmed ✓ — {studentName}` |
| **Body** | `Payment confirmed · {date} · {time}` |
| **Data keys** | `event: "lesson_auto_confirmed"`, `coachId`, `title`, `body`, `channelId`, `sound` |
| **FCM format** | `notification` + `data` keys |
| **Note** | Same `event` string as B5, different trigger path |

---

## Database schema (relevant parts)

```prisma
model StaffMember {
  pushNotificationsEnabled Boolean @default(false) @map("push_notifications_enabled")
  pushTokens               StaffPushToken[]
}

model StaffPushToken {
  id         String   @id @default(cuid())
  staffId    String   @map("staff_id")
  venueId    String?  @map("venue_id")   // null for coach-only accounts
  token      String
  platform   String   @default("android")
  active     Boolean  @default(true)
  lastSeenAt DateTime @default(now()) @map("last_seen_at")

  @@unique([staffId, token])
  @@index([venueId, active])
  @@map("staff_push_tokens")
}
```

Migration: `prisma/migrations/20260630000000_coach_push_token_nullable_venue/migration.sql`
— drops `NOT NULL` on `venue_id` to allow coach token registration without a venue.

---

## Key code locations

| Layer | File |
|---|---|
| FCM send (staff) | `src/lib/staff-push.ts` → `sendPushToVenueStaff()` |
| FCM send (coach) | `src/lib/staff-push.ts` → `sendPushToCoach()`, `sendCoachLessonPushFromCtx()` |
| Register API | `src/app/api/staff/push/register/route.ts` |
| Unregister API | `src/app/api/staff/push/unregister/route.ts` |
| Toggle preference API | `src/app/api/staff/push/preferences/route.ts` |
| Test push API | `src/app/api/staff/push/test/route.ts` |
| Mobile hook (staff) | `mobile/src/hooks/useStaffPushRegistration.ts` |
| Mobile bootstrap (staff) | `mobile/src/components/StaffPushBootstrap.tsx` |
| Mobile hook (coach) | `mobile/src/hooks/useCoachPushRegistration.ts` |
| Mobile bootstrap (coach) | `mobile/src/components/CoachPushBootstrap.tsx` |
| Coach toggle UI | `mobile/src/screens/coach/CoachProfileScreen.tsx` |
| i18n keys (coach PNS) | `mobile/src/lib/tablet-check-in-strings.ts` → `coachPortalPushTitle`, `coachPortalPushSubtitle` |

---

## Notification channels (Android)

| Channel ID | Name | Importance | Used by |
|---|---|---|---|
| `courtpay_payments` | Payment Notifications | HIGH | Staff payment events (A1, A2) |
| `coach_lessons` | Lesson Notifications | HIGH | Coach lesson events (B1–B6) |

Channels are created at bootstrap time in `StaffPushBootstrap` and `CoachPushBootstrap` respectively. Android caches channel settings permanently — a changed `importance` level requires an uninstall + reinstall.

---

## Notification differences: staff vs coach

| | Staff (A1, A2) | Coach (B1–B6) |
|---|---|---|
| FCM payload | Data-only (no `notification` key) | `notification` + `data` keys |
| Why | Expo's JS handler must present it (custom action buttons) | No custom actions needed; system can display reliably |
| Foreground display | Via `setNotificationHandler` + `onMessage` in `App.tsx` | Via `notification` key — system presents automatically |
| Channel scope | `venueId`-scoped tokens | `staffId`-scoped tokens (no venue) |

---

## Testing

### Manual end-to-end test (coach)

1. Log in as a coach account on a physical Android device.
2. Open **My Profile** → enable **Push Notifications** toggle.
3. From the player portal, book a lesson and upload a payment proof.
4. Verify notification B1 appears on the device: `"New booking — {name}"`.
5. Log in as staff in the web app and approve the payment.
6. Verify notification B2 appears: `"Lesson confirmed ✓ — {name}"`.
7. Toggle push off → confirm no further notifications arrive.

### Server-side test endpoint

```
POST /api/staff/push/test
Authorization: Bearer <staff_jwt>
Body: { "venueId": "..." }
```

Sends a test message to all active staff tokens for that venue. No equivalent coach-specific test endpoint exists yet — use the manual flow above.

---

## Troubleshooting checklist

1. **No notification received** → Check `StaffMember.pushNotificationsEnabled = true` in DB.
2. **Token not registered** → Check `StaffPushToken` table for the coach's `staffId` with `active = true`.
3. **Firebase error in Railway logs** → Check `FIREBASE_SERVICE_ACCOUNT_JSON` is set in production env.
4. **`lesson_pending` not firing** → The student must upload proof via `/api/public/coach-sessions/[id]/proof`. Direct admin creation does not trigger it.
5. **Background notifications not shown** → Verify `notification` key is present in the FCM payload (coach messages have it; staff messages do not — that's intentional).
6. **Android channel importance ignored** → Channel settings are cached after first creation. Uninstall the app and reinstall to reset channel importance.
7. **iOS badge/sound not working** → Verify `apns-priority: "10"` and `aps.sound: "default"` are set in the FCM message (they are, in `sendPushToCoach`).

---

## Future work / not yet implemented

- [ ] Staff-initiated lesson cancellation push (admin panel) — currently only student self-cancel (B4) sends a push
- [ ] Coach-specific test endpoint (`POST /api/coach/push/test`)
- [ ] Deep link from notification tap into the lesson detail screen in the coach portal
- [ ] PWA push for coaches (web version of the coach portal)
- [ ] Notification history / in-app inbox for coaches
