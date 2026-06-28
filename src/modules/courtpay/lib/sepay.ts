import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { extractPaymentRef } from "./payment-reference";
import { checkInSubscriber } from "./check-in";
import { getActiveSubscription } from "./subscription";
import { sendBookingEmail, buildLessonEmailContext, sendLessonEventEmails } from "@/lib/email/send";
import { createCalendarEvent } from "@/lib/google-calendar";
import type { SepayWebhookPayload } from "../types";

/**
 * Validate SePay webhook request using the API key header.
 *
 * Fails CLOSED by default: if SEPAY_WEBHOOK_SECRET is not set the request is
 * rejected. This prevents a misconfigured environment from silently accepting
 * forged payment confirmations.
 *
 * To bypass validation in local development, set SEPAY_SKIP_VALIDATION=true
 * explicitly. This env var must never be set in staging or production.
 */
export function validateSepayWebhook(
  headers: Headers
): boolean {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;

  if (!secret) {
    // Explicit dev-only escape hatch — must be deliberately set, not an accident
    if (process.env.SEPAY_SKIP_VALIDATION === "true") {
      console.warn(
        "[sepay-webhook] SEPAY_SKIP_VALIDATION=true — skipping signature check (dev only)"
      );
      return true;
    }
    console.error(
      "[sepay-webhook] SEPAY_WEBHOOK_SECRET is not set — rejecting request to prevent forged payments"
    );
    return false;
  }

  const provided = headers.get("x-sepay-key") || headers.get("authorization");
  return (
    provided === secret ||
    provided === `Bearer ${secret}` ||
    provided === `Apikey ${secret}`
  );
}

async function handleBillingPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const invoice = await prisma.billingInvoice.findUnique({
    where: { paymentRef: ref },
  });

  if (!invoice || (invoice.status !== "pending" && invoice.status !== "overdue")) {
    return { matched: false };
  }

  const tolerance = 5000;
  if (
    payload.transferAmount < invoice.totalAmount - tolerance
  ) {
    return { matched: false };
  }

  await prisma.billingInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      confirmedBy: "sepay",
    },
  });

  // Restore venue if it was suspended
  await prisma.venue.updateMany({
    where: { id: invoice.venueId, billingStatus: "suspended" },
    data: { billingStatus: "active" },
  });

  emitToVenue(invoice.venueId, "billing:invoice_paid", {
    invoiceId: invoice.id,
    venueId: invoice.venueId,
    amount: invoice.totalAmount,
    weekStartDate: invoice.weekStartDate,
  });

  return { matched: true, paymentId: invoice.id };
}

async function checkVenueAutoPayment(venueId: string): Promise<boolean> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { settings: true },
  });
  const vs = (venue?.settings ?? {}) as Record<string, unknown>;
  return !!(vs.autoPaymentEnabled && vs.sepayEnabled);
}

async function handlePortalBookingPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const booking = await prisma.booking.findFirst({ where: { paymentRef: ref } });
  if (!booking || booking.paymentStatus !== "pending") return { matched: false };
  if (payload.transferAmount < booking.priceValue) return { matched: false };
  if (!(await checkVenueAutoPayment(booking.venueId))) return { matched: false };

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "paid" },
  });

  const player = await prisma.player.findUnique({
    where: { id: booking.playerId },
    select: { name: true, email: true },
  });
  if (player?.email) {
    await sendBookingEmail({
      to: player.email,
      playerName: player.name,
      bookingType: "court",
      emailType: "auto_confirmed",
      details: {},
    });
  }

  return { matched: true, paymentId: booking.id };
}

async function handlePortalLessonPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const lesson = await prisma.coachLesson.findFirst({ where: { paymentRef: ref } });
  if (!lesson || lesson.paymentStatus !== "pending") return { matched: false };
  if (payload.transferAmount < lesson.priceValue) return { matched: false };
  if (!(await checkVenueAutoPayment(lesson.venueId))) return { matched: false };

  const updated = await prisma.coachLesson.update({
    where: { id: lesson.id },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      paymentMethod: "vietqr",
      status: "confirmed",
    },
    include: {
      coach: {
        select: {
          googleRefreshToken: true,
          googleCalendarId: true,
          calendarSyncEnabled: true,
        },
      },
      player: { select: { name: true } },
      package: { select: { name: true } },
    },
  });

  const ctx = await buildLessonEmailContext(lesson.id);
  if (ctx) {
    void sendLessonEventEmails(ctx, "auto_confirmed");
  }

  if (
    updated.coach.calendarSyncEnabled &&
    updated.coach.googleRefreshToken &&
    updated.coach.googleCalendarId
  ) {
    createCalendarEvent(
      updated.coach.googleRefreshToken,
      updated.coach.googleCalendarId,
      updated
    )
      .then((googleEventId) =>
        prisma.coachLesson.update({
          where: { id: lesson.id },
          data: { googleEventId },
        })
      )
      .catch((err) => console.error("[sepay] Calendar event creation failed:", err));
  }

  return { matched: true, paymentId: lesson.id };
}

async function handlePortalOpenPlayPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const reg = await prisma.openPlayRegistration.findFirst({ where: { paymentRef: ref } });
  if (!reg || reg.paymentStatus !== "pending") return { matched: false };
  if (payload.transferAmount < reg.priceValue) return { matched: false };
  if (!(await checkVenueAutoPayment(reg.venueId))) return { matched: false };

  await prisma.openPlayRegistration.update({
    where: { id: reg.id },
    data: { paymentStatus: "paid", holdExpiresAt: null },
  });

  const player = await prisma.player.findUnique({
    where: { id: reg.playerId },
    select: { name: true, email: true },
  });
  if (player?.email) {
    await sendBookingEmail({
      to: player.email,
      playerName: player.name,
      bookingType: "open_play",
      emailType: "auto_confirmed",
      details: {},
    });
  }

  return { matched: true, paymentId: reg.id };
}

async function handlePortalCreditPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const credit = await prisma.playerCoachCredit.findFirst({ where: { paymentRef: ref } });
  if (!credit || credit.paymentStatus !== "pending") return { matched: false };
  if (payload.transferAmount < credit.priceValue) return { matched: false };
  if (!(await checkVenueAutoPayment(credit.venueId))) return { matched: false };

  await prisma.playerCoachCredit.update({
    where: { id: credit.id },
    data: { paymentStatus: "paid", confirmedBy: "sepay", confirmedAt: new Date() },
  });

  // Notify student, coach, and staff about credit package confirmation
  const [player, coach, venue] = await Promise.all([
    prisma.player.findUnique({ where: { id: credit.playerId }, select: { name: true, email: true } }),
    prisma.staffMember.findUnique({ where: { id: credit.coachId }, select: { name: true, email: true } }),
    prisma.venue.findUnique({ where: { id: credit.venueId }, select: { settings: true } }),
  ]);

  const venueSettings = (venue?.settings ?? {}) as Record<string, unknown>;
  const staffEmail = (venueSettings.notificationEmail as string | undefined) ?? null;

  const roles = [
    { role: "student" as const, email: player?.email ?? null, name: player?.name ?? "" },
    { role: "coach" as const, email: coach?.email ?? null, name: coach?.name ?? "" },
    { role: "staff" as const, email: staffEmail, name: "Staff" },
  ];

  for (const { role, email, name } of roles) {
    if (email) {
      void sendBookingEmail({
        to: email,
        playerName: name,
        bookingType: "coach",
        emailType: "auto_confirmed",
        recipientRole: role,
        details: { studentName: player?.name, coachName: coach?.name },
      });
    }
  }

  return { matched: true, paymentId: credit.id };
}

/**
 * Process a SePay webhook payload: match payment, confirm, and activate subscription if applicable.
 * Returns true if a payment was matched and processed.
 *
 * Deduplication: SePay may send the same transaction multiple times (auto-retry up to 7×,
 * plus manual replay from dashboard). We guard against this by checking whether the
 * PendingPayment is still in "pending" status before writing — the unique paymentRef + status
 * check makes the handler naturally idempotent without a separate log table.
 */
export async function processSepayWebhook(
  payload: SepayWebhookPayload
): Promise<{ matched: boolean; paymentId?: string }> {
  // Prefer the pre-extracted `code` field (SePay parses it from content via payment prefix config).
  // Fall back to regex scan of the raw `content` string if `code` is null/empty.
  const searchText = payload.code || payload.content;
  const ref = extractPaymentRef(searchText);
  if (!ref) {
    return { matched: false };
  }

  if (ref.startsWith("CF-BILL-")) {
    return handleBillingPayment(payload, ref);
  }

  if (ref.startsWith("CF-BK-")) {
    return handlePortalBookingPayment(payload, ref);
  }
  if (ref.startsWith("CF-CL-")) {
    return handlePortalLessonPayment(payload, ref);
  }
  if (ref.startsWith("CF-CR-")) {
    return handlePortalCreditPayment(payload, ref);
  }
  if (ref.startsWith("CF-OP-")) {
    return handlePortalOpenPlayPayment(payload, ref);
  }

  const pending = await prisma.pendingPayment.findUnique({
    where: { paymentRef: ref },
    include: { checkInPlayer: true },
  });

  if (!pending || pending.status !== "pending") {
    return { matched: false };
  }

  if (payload.transferAmount < pending.amount) {
    return { matched: false };
  }

  // Only auto-confirm if the venue has auto-payment enabled via Sepay
  const venue = await prisma.venue.findUnique({
    where: { id: pending.venueId },
    select: { settings: true },
  });
  const venueSettings = (venue?.settings ?? {}) as Record<string, unknown>;
  if (!venueSettings.autoPaymentEnabled || !venueSettings.sepayEnabled) {
    console.log(`[sepay-webhook] Auto-payment disabled for venue ${pending.venueId} — skipping auto-confirm`);
    return { matched: false };
  }

  await prisma.pendingPayment.update({
    where: { id: pending.id },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
      confirmedBy: "sepay",
      paymentMethod: "vietqr",
    },
  });

  if (!pending.checkInPlayerId) {
    return { matched: true, paymentId: pending.id };
  }

  let updatedSub: Awaited<ReturnType<typeof getActiveSubscription>> = null;
  if (pending.type === "subscription") {
    // Package purchase: after payment confirmation, check-in now and deduct 1 session.
    const activeSub = await prisma.playerSubscription.findFirst({
      where: {
        playerId: pending.checkInPlayerId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      orderBy: { activatedAt: "desc" },
    });

    if (activeSub) {
      await checkInSubscriber(
        pending.checkInPlayerId,
        pending.venueId,
        activeSub.id,
        pending.createdAt
      );
    } else {
      // Fallback (should be rare): still record the paid check-in.
      await prisma.checkInRecord.create({
        data: {
          playerId: pending.checkInPlayerId,
          venueId: pending.venueId,
          paymentId: pending.id,
          source: "vietqr",
        },
      });
    }
    updatedSub = await getActiveSubscription(pending.checkInPlayerId);
  } else if (pending.type === "subscription_renewal") {
    // Renewal flow: do not consume a session from the new package.
    await prisma.checkInRecord.create({
      data: {
        playerId: pending.checkInPlayerId,
        venueId: pending.venueId,
        paymentId: pending.id,
        source: "subscription",
      },
    });
    updatedSub = await getActiveSubscription(pending.checkInPlayerId);
  } else {
    await prisma.checkInRecord.create({
      data: {
        playerId: pending.checkInPlayerId,
        venueId: pending.venueId,
        paymentId: pending.id,
        source: "vietqr",
      },
    });
  }

  emitToVenue(pending.venueId, "payment:confirmed", {
    pendingPaymentId: pending.id,
    paymentRef: ref,
    playerId: pending.checkInPlayerId,
    playerName: pending.checkInPlayer?.name ?? "Unknown",
    subscription: updatedSub,
  });

  sendPaymentPushToStaff("payment_confirmed", {
    venueId: pending.venueId,
    pendingPaymentId: pending.id,
    playerName: pending.checkInPlayer?.name ?? "Unknown",
    amount: pending.amount,
    paymentMethod: "vietqr",
  });

  return { matched: true, paymentId: pending.id };
}
