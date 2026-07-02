import { prisma } from "./db";

let firebaseApp: import("firebase-admin").app.App | null = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  const credJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credJson) {
    console.warn("[StaffPush] FIREBASE_SERVICE_ACCOUNT_JSON not set — push disabled");
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin") as typeof import("firebase-admin");
    const credential = JSON.parse(credJson);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credential),
    });
    return firebaseApp;
  } catch (err) {
    console.error("[StaffPush] Firebase init error:", err);
    return null;
  }
}

interface StaffPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type StaffPushSendResult =
  | { ok: true; targets: number; delivered: number }
  | { ok: false; reason: "no_firebase" | "no_tokens"; targets: number };

export type SendPushToVenueStaffOptions = {
  /**
   * When true, delivers to all active staff device tokens (every venue).
   * Use only for intentional system-wide alerts — default is venue-scoped.
   */
  broadcast?: boolean;
};

/**
 * Send a push notification to active staff devices with push enabled.
 * By default only tokens whose `venueId` matches (payment / venue events).
 * Pass `{ broadcast: true }` only for intentional cross-venue system alerts.
 */
export async function sendPushToVenueStaff(
  venueId: string,
  payload: StaffPushPayload,
  options?: SendPushToVenueStaffOptions
): Promise<StaffPushSendResult> {
  const app = getFirebaseApp();
  if (!app) return { ok: false, reason: "no_firebase", targets: 0 };

  const broadcast = options?.broadcast === true;

  const tokens = await prisma.staffPushToken.findMany({
    where: broadcast
      ? {
          active: true,
          staff: { pushNotificationsEnabled: true },
        }
      : {
          venueId,
          active: true,
          staff: { pushNotificationsEnabled: true },
        },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) return { ok: false, reason: "no_tokens", targets: 0 };

  const { getMessaging } = await import("firebase-admin/messaging");
  const messaging = getMessaging(app);

  // Data-only FCM messages (no `notification` key). Expo's native
  // ExpoFirebaseMessagingService presents these as local notifications.
  // If we used the `notification` key, Android's system would display
  // the notification directly and bypass Expo entirely.
  const results = await Promise.allSettled(
    tokens.map((t) =>
      messaging.send({
        token: t.token,
        data: {
          ...payload.data,
          title: payload.title,
          message: payload.body,
          body: payload.body,
          channelId: "courtpay_payments",
          sound: "default",
        },
        android: { priority: "high" },
      })
    )
  );

  const staleIds: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const code = (result.reason as { code?: string })?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        staleIds.push(tokens[i].id);
      } else {
        console.warn("[StaffPush] Send failed:", result.reason);
      }
    }
  });

  if (staleIds.length > 0) {
    await prisma.staffPushToken.deleteMany({
      where: { id: { in: staleIds } },
    });
  }

  const delivered = results.filter((r) => r.status === "fulfilled").length;
  return { ok: true, targets: tokens.length, delivered };
}

// ─── Coach push ───────────────────────────────────────────────────────────────

type CoachLessonPushEvent =
  | "lesson_pending"
  | "lesson_confirmed"
  | "lesson_rejected"
  | "lesson_cancelled"
  | "lesson_auto_confirmed";

interface CoachLessonPushContext {
  coachId: string;
  studentName: string;
  date?: string;
  time?: string;
  event: CoachLessonPushEvent;
}

/**
 * Send a push notification directly to a specific coach (by staffId),
 * regardless of venue. Used for lesson lifecycle events.
 */
export async function sendPushToCoach(ctx: CoachLessonPushContext): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;

  // Check coach has push enabled
  const staff = await prisma.staffMember.findUnique({
    where: { id: ctx.coachId },
    select: { pushNotificationsEnabled: true },
  });
  if (!staff?.pushNotificationsEnabled) return;

  const tokens = await prisma.staffPushToken.findMany({
    where: { staffId: ctx.coachId, active: true },
    select: { id: true, token: true },
  });
  if (tokens.length === 0) return;

  const { title, body } = buildCoachLessonPushContent(ctx);

  const { getMessaging } = await import("firebase-admin/messaging");
  const messaging = getMessaging(app);

  const results = await Promise.allSettled(
    tokens.map((t) =>
      messaging.send({
        token: t.token,
        notification: { title, body },
        data: {
          screen: "CoachPortal",
          event: ctx.event,
          coachId: ctx.coachId,
          title,
          body,
          channelId: "coach_lessons",
          sound: "default",
        },
        android: {
          priority: "high",
          notification: { channelId: "coach_lessons", sound: "default" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
          headers: { "apns-priority": "10" },
        },
      })
    )
  );

  const staleIds: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const code = (result.reason as { code?: string })?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        staleIds.push(tokens[i].id);
      } else {
        console.warn("[CoachPush] Send failed:", result.reason);
      }
    }
  });

  if (staleIds.length > 0) {
    await prisma.staffPushToken.deleteMany({ where: { id: { in: staleIds } } });
  }

  console.log(`[CoachPush] ${ctx.event} → coachId=${ctx.coachId} targets=${tokens.length} delivered=${results.filter((r) => r.status === "fulfilled").length}`);
}

/**
 * Convenience wrapper that wires directly from the `LessonEmailContext` produced
 * by `buildLessonEmailContext`. Fire-and-forget (void); never throws.
 */
export function sendCoachLessonPushFromCtx(
  ctx: { coachId: string; studentName: string; details: { date?: string; time?: string } },
  event: CoachLessonPushEvent
): void {
  void sendPushToCoach({
    coachId: ctx.coachId,
    studentName: ctx.studentName,
    date: ctx.details.date,
    time: ctx.details.time,
    event,
  }).catch((err) => console.warn("[CoachPush] dispatch error:", err));
}

function buildCoachLessonPushContent(ctx: CoachLessonPushContext): { title: string; body: string } {
  const when = ctx.date && ctx.time ? `${ctx.date} · ${ctx.time}` : ctx.date ?? "";
  switch (ctx.event) {
    case "lesson_pending":
      return {
        title: `New booking — ${ctx.studentName}`,
        body: when ? `Pending approval · ${when}` : "Pending staff approval",
      };
    case "lesson_confirmed":
      return {
        title: `Lesson confirmed ✓ — ${ctx.studentName}`,
        body: when ? when : "Your lesson is confirmed",
      };
    case "lesson_rejected":
      return {
        title: `Booking rejected — ${ctx.studentName}`,
        body: "The student's payment proof was rejected by staff",
      };
    case "lesson_cancelled":
      return {
        title: `Lesson cancelled — ${ctx.studentName}`,
        body: when ? when : "A lesson has been cancelled",
      };
    case "lesson_auto_confirmed":
      return {
        title: `Lesson auto-confirmed ✓ — ${ctx.studentName}`,
        body: when ? `Payment confirmed · ${when}` : "Payment confirmed automatically",
      };
  }
}

type PaymentPushEvent = "payment_new" | "payment_confirmed";

interface PaymentPushContext {
  venueId: string;
  pendingPaymentId: string;
  playerName: string;
  amount: number;
  paymentMethod?: string;
  type?: string;
}

export function sendPaymentPushToStaff(
  event: PaymentPushEvent,
  ctx: PaymentPushContext
) {
  const amountStr = ctx.amount.toLocaleString("en");
  const detail = `${ctx.playerName} — ${amountStr} VND (${ctx.paymentMethod ?? "vietqr"})`;

  const title =
    event === "payment_new"
      ? `Approve Payment · ${detail}`
      : `Payment Confirmed · ${detail}`;

  const body = detail;

  const data: Record<string, string> = {
    event,
    venueId: ctx.venueId,
    pendingPaymentId: ctx.pendingPaymentId,
    screen: "PaymentTab",
  };

  void sendPushToVenueStaff(ctx.venueId, { title, body, data }).catch((err) =>
    console.warn("[StaffPush] dispatch error:", err)
  );
}

/** Manual test from `POST /api/staff/push/test`. */
export async function sendStaffTestPush(venueId: string) {
  return sendPushToVenueStaff(venueId, {
    title: "CourtFlow test",
    body: "If you see this, staff push notifications are working.",
    data: {
      event: "test",
      venueId,
      screen: "PaymentTab",
      pendingPaymentId: "test",
    },
  });
}
