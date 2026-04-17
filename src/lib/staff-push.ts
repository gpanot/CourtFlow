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

/**
 * Send a push notification to all active staff devices registered for a venue
 * that have pushNotificationsEnabled.
 */
export async function sendPushToVenueStaff(
  venueId: string,
  payload: StaffPushPayload
): Promise<StaffPushSendResult> {
  const app = getFirebaseApp();
  if (!app) return { ok: false, reason: "no_firebase", targets: 0 };

  const tokens = await prisma.staffPushToken.findMany({
    where: {
      venueId,
      active: true,
      staff: { pushNotificationsEnabled: true },
    },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) return { ok: false, reason: "no_tokens", targets: 0 };

  const { getMessaging } = await import("firebase-admin/messaging");
  const messaging = getMessaging(app);

  const results = await Promise.allSettled(
    tokens.map((t) =>
      messaging.send({
        token: t.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: {
          priority: "high",
          notification: {
            channelId: "courtpay_payments",
            sound: "default",
          },
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
  const title =
    event === "payment_new" ? "New Payment Pending" : "Payment Confirmed";

  const amountStr = ctx.amount.toLocaleString("en");
  const body =
    event === "payment_new"
      ? `${ctx.playerName} — ${amountStr} VND (${ctx.paymentMethod ?? "vietqr"})`
      : `${ctx.playerName} — ${amountStr} VND approved`;

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
