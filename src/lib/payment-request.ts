/**
 * Payment-request image helpers.
 *
 * Provides:
 *  - ensurePaymentRef  — lazily generates + persists a paymentRef when the
 *    record was created without one (staff-created bookings / lessons).
 *  - loadPaymentRequestData  — fetches all the data an image renderer needs.
 */

import { prisma } from "./db";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { toDateKey } from "./date";

export type PaymentRequestType = "booking" | "lesson" | "openplay";

export interface PaymentRequestData {
  type: PaymentRequestType;
  paymentRef: string;
  /** Court label / "Coaching – Coach · Package" / "Open Play" */
  description: string;
  /** YYYY-MM-DD */
  dateKey: string;
  startTime: Date;
  endTime: Date;
  /** Amount in full VND (e.g. 200000) */
  amountValue: number;
  playerName: string;
  venueName: string;
  /** BIN used by VietQR (stored in venue.bankName) */
  bankBin: string | null;
  bankAccount: string | null;
  bankOwnerName: string | null;
}

// ─── ensurePaymentRef ────────────────────────────────────────────────────────

/**
 * Returns the entity's existing paymentRef, or generates one and persists it.
 * For group bookings the ref is stored on the BookingGroup row.
 */
export async function ensurePaymentRef(
  type: PaymentRequestType,
  id: string,
): Promise<string> {
  if (type === "booking") {
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { paymentRef: true, bookingGroupId: true },
    });
    if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });

    // Group bookings: ref lives on the group
    if (booking.bookingGroupId) {
      const group = await prisma.bookingGroup.findUnique({
        where: { id: booking.bookingGroupId },
        select: { paymentRef: true },
      });
      if (group?.paymentRef) return group.paymentRef;

      const ref = await generatePaymentRef("booking");
      await prisma.bookingGroup.update({
        where: { id: booking.bookingGroupId },
        data: { paymentRef: ref },
      });
      return ref;
    }

    if (booking.paymentRef) return booking.paymentRef;

    const ref = await generatePaymentRef("booking");
    await prisma.booking.update({ where: { id }, data: { paymentRef: ref } });
    return ref;
  }

  if (type === "lesson") {
    const lesson = await prisma.coachLesson.findUnique({
      where: { id },
      select: { paymentRef: true },
    });
    if (!lesson) throw Object.assign(new Error("Lesson not found"), { status: 404 });
    if (lesson.paymentRef) return lesson.paymentRef;

    const ref = await generatePaymentRef("coach-lesson");
    await prisma.coachLesson.update({ where: { id }, data: { paymentRef: ref } });
    return ref;
  }

  // openplay
  const reg = await prisma.openPlayRegistration.findUnique({
    where: { id },
    select: { paymentRef: true },
  });
  if (!reg) throw Object.assign(new Error("Open-play registration not found"), { status: 404 });
  if (reg.paymentRef) return reg.paymentRef;

  const ref = await generatePaymentRef("open-play");
  await prisma.openPlayRegistration.update({ where: { id }, data: { paymentRef: ref } });
  return ref;
}

// ─── loadPaymentRequestData ──────────────────────────────────────────────────

const VENUE_BANK_SELECT = {
  name: true,
  bankName: true,
  bankAccount: true,
  bankOwnerName: true,
} as const;

export async function loadPaymentRequestData(
  type: PaymentRequestType,
  id: string,
): Promise<PaymentRequestData> {
  if (type === "booking") {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        court: { select: { label: true } },
        player: { select: { name: true } },
        venue: { select: VENUE_BANK_SELECT },
        bookingGroup: {
          select: {
            paymentRef: true,
            totalPriceValue: true,
            startTime: true,
            endTime: true,
            bookings: { select: { court: { select: { label: true } }, priceValue: true } },
          },
        },
      },
    });
    if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });

    const paymentRef = await ensurePaymentRef("booking", id);

    const isGroup = !!booking.bookingGroup;
    const courts = isGroup
      ? booking.bookingGroup!.bookings.map((b) => b.court.label)
      : [booking.court.label];
    const description = courts.length > 1
      ? `Courts: ${courts.join(", ")}`
      : `Court ${courts[0]}`;
    const amountValue = isGroup
      ? booking.bookingGroup!.totalPriceValue
      : booking.priceValue;
    const startTime = isGroup ? booking.bookingGroup!.startTime : booking.startTime;
    const endTime = isGroup ? booking.bookingGroup!.endTime : booking.endTime;

    return {
      type: "booking",
      paymentRef,
      description,
      dateKey: toDateKey(booking.date),
      startTime,
      endTime,
      amountValue,
      playerName: booking.player.name,
      venueName: booking.venue.name,
      bankBin: booking.venue.bankName ?? null,
      bankAccount: booking.venue.bankAccount ?? null,
      bankOwnerName: booking.venue.bankOwnerName ?? null,
    };
  }

  if (type === "lesson") {
    const lesson = await prisma.coachLesson.findUnique({
      where: { id },
      include: {
        coach: { select: { name: true } },
        package: { select: { name: true } },
        player: { select: { name: true } },
        venue: { select: VENUE_BANK_SELECT },
      },
    });
    if (!lesson) throw Object.assign(new Error("Lesson not found"), { status: 404 });

    const paymentRef = await ensurePaymentRef("lesson", id);

    return {
      type: "lesson",
      paymentRef,
      description: `Coaching – ${lesson.coach.name} · ${lesson.package.name}`,
      dateKey: toDateKey(lesson.date),
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      amountValue: lesson.priceValue,
      playerName: lesson.player.name,
      venueName: lesson.venue.name,
      bankBin: lesson.venue.bankName ?? null,
      bankAccount: lesson.venue.bankAccount ?? null,
      bankOwnerName: lesson.venue.bankOwnerName ?? null,
    };
  }

  // openplay
  const reg = await prisma.openPlayRegistration.findUnique({
    where: { id },
    include: {
      player: { select: { name: true } },
      venue: { select: VENUE_BANK_SELECT },
    },
  });
  if (!reg) throw Object.assign(new Error("Open-play registration not found"), { status: 404 });

  const paymentRef = await ensurePaymentRef("openplay", id);

  return {
    type: "openplay",
    paymentRef,
    description: "Open Play",
    dateKey: toDateKey(reg.date),
    startTime: reg.startTime,
    endTime: reg.endTime,
    amountValue: reg.priceValue,
    playerName: reg.player.name,
    venueName: reg.venue.name,
    bankBin: reg.venue.bankName ?? null,
    bankAccount: reg.venue.bankAccount ?? null,
    bankOwnerName: reg.venue.bankOwnerName ?? null,
  };
}
