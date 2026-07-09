import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { buildLessonEmailContext, sendBookingEmail, sendLessonEventEmails } from "@/lib/email/send";
import { allocateInvoiceNumber } from "@/lib/invoice-number";
import {
  isPaidPaymentStatus,
  paidCancellationUpdate,
  requirePaidCancellationReason,
} from "@/lib/paid-cancellation";

export const dynamic = "force-dynamic";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const body = await parseBody<{
      coachId?: string;
      packageId?: string;
      playerId?: string;
      courtId?: string | null;
      date?: string;
      startTime?: string;
      endTime?: string;
      status?: "confirmed" | "completed" | "cancelled" | "no_show";
      /** Required when cancelling a paid lesson */
      cancellationReason?: string;
      note?: string | null;
      paymentStatus?: "UNPAID" | "PAID" | "pending" | "paid" | "proof_submitted";
      paidAt?: string;
      paymentMethod?: string;
      proofUrl?: string;
      paymentNote?: string;
      amountValue?: number;
    }>(request);

    const existing = await prisma.coachLesson.findUnique({
      where: { id },
      include: { package: true },
    });
    if (!existing) return error("Lesson not found", 404);

    const data: Record<string, unknown> = {};

    if (body.coachId !== undefined) data.coachId = body.coachId;
    if (body.packageId !== undefined) data.packageId = body.packageId;
    if (body.playerId !== undefined) data.playerId = body.playerId;

    if (body.status !== undefined) {
      if (body.status === "cancelled") {
        const wasPaid = isPaidPaymentStatus(existing.paymentStatus);
        const reasonError = requirePaidCancellationReason(wasPaid, body.cancellationReason);
        if (reasonError) return error(reasonError, 400);

        if (wasPaid && body.cancellationReason) {
          Object.assign(data, paidCancellationUpdate(body.cancellationReason));
        } else {
          data.status = "cancelled";
          data.cancelledAt = new Date();
        }
      } else {
        data.status = body.status;
      }
    }

    if (body.note !== undefined) data.note = body.note;
    if (body.courtId !== undefined) data.courtId = body.courtId;

    if (body.paymentStatus !== undefined) {
      // Normalise legacy uppercase statuses to lowercase
      const normalised = body.paymentStatus === "PAID" ? "paid"
        : body.paymentStatus === "UNPAID" ? "pending"
        : body.paymentStatus;
      data.paymentStatus = normalised;
      if (normalised === "paid" && !body.paidAt) {
        data.paidAt = new Date();
      }
      if (normalised === "paid" && !existing.invoiceNumber) {
        data.invoiceNumber = await allocateInvoiceNumber(existing.venueId, "CL");
        data.invoicedAt = new Date();
      }
      if (normalised === "pending") {
        data.paidAt = null;
        data.paymentMethod = null;
        data.proofUrl = null;
        data.paymentNote = null;
      }
    }
    if (body.paidAt !== undefined) data.paidAt = new Date(body.paidAt);
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod;
    if (body.proofUrl !== undefined) data.proofUrl = body.proofUrl;
    if (body.paymentNote !== undefined) data.paymentNote = body.paymentNote;
    if (body.amountValue !== undefined) data.priceValue = body.amountValue;

    if (body.date || body.startTime || body.endTime) {
      const date = body.date ? new Date(body.date) : new Date(existing.date);
      date.setHours(0, 0, 0, 0);

      const startTime = body.startTime ? new Date(body.startTime) : new Date(existing.startTime);
      const endTime = body.endTime
        ? new Date(body.endTime)
        : body.startTime
          ? new Date(startTime.getTime() + existing.package.durationMin * 60 * 1000)
          : new Date(existing.endTime);

      const coachId = (data.coachId as string) || existing.coachId;
      const conflict = await prisma.coachLesson.findFirst({
        where: {
          id: { not: id },
          coachId,
          date,
          status: { in: ["confirmed", "completed"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (conflict) return error("Coach has a conflicting lesson at this time", 409);

      data.date = date;
      data.startTime = startTime;
      data.endTime = endTime;

      if (body.amountValue === undefined) {
        const pkg = body.packageId
          ? await prisma.coachPackage.findUnique({ where: { id: body.packageId } })
          : existing.package;
        if (pkg) {
          const durationMin = (endTime.getTime() - startTime.getTime()) / (60 * 1000);
          data.priceValue = Math.round((pkg.priceValue / pkg.durationMin) * durationMin);
        }
      }
    }

    const lesson = await prisma.coachLesson.update({
      where: { id },
      data: data as never,
      include: {
        coach: { select: { id: true, name: true } },
        player: { select: { id: true, name: true, email: true } },
        court: { select: { id: true, label: true } },
        package: { select: { id: true, name: true, lessonType: true, durationMin: true } },
      },
    });

    console.log(`[staffEditLesson] lessonId=${lesson.id} player="${lesson.player.name}" email=${lesson.player.email ?? "NONE"} status=${body.status ?? "unchanged"} rescheduled=${!!(body.date || body.startTime || body.endTime)}`);

    if (body.status === "cancelled") {
      // Cancellation: notify all roles
      void (async () => {
        const ctx = await buildLessonEmailContext(lesson.id);
        if (ctx) {
          await sendLessonEventEmails(ctx, "cancelled");
        }
      })();
    } else if (body.date || body.startTime || body.endTime || body.coachId) {
      // Reschedule or coach change: notify player + coach
      void (async () => {
        const ctx = await buildLessonEmailContext(lesson.id);
        if (ctx) {
          await sendLessonEventEmails(ctx, "staff_confirmed");
        }
      })();
    }

    return json(lesson);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const existing = await prisma.coachLesson.findUnique({ where: { id } });
    if (!existing) return error("Lesson not found", 404);

    if (isPaidPaymentStatus(existing.paymentStatus)) {
      return error(
        "Use PATCH with status=cancelled and cancellationReason to cancel a paid lesson",
        400
      );
    }

    await prisma.coachLesson.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    console.log(`[staffDeleteLesson] lessonId=${id} — sending cancellation emails`);
    void (async () => {
      const ctx = await buildLessonEmailContext(id);
      if (ctx) {
        await sendLessonEventEmails(ctx, "cancelled");
      }
    })();

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
