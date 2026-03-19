import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
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
      note?: string | null;
      paymentStatus?: "UNPAID" | "PAID";
      paidAt?: string;
      paymentMethod?: string;
      proofUrl?: string;
      paymentNote?: string;
      amountInCents?: number;
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
      data.status = body.status;
      if (body.status === "cancelled") {
        data.cancelledAt = new Date();
      }
    }

    if (body.note !== undefined) data.note = body.note;
    if (body.courtId !== undefined) data.courtId = body.courtId;

    if (body.paymentStatus !== undefined) {
      data.paymentStatus = body.paymentStatus;
      if (body.paymentStatus === "PAID" && !body.paidAt) {
        data.paidAt = new Date();
      }
      if (body.paymentStatus === "UNPAID") {
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
    if (body.amountInCents !== undefined) data.priceInCents = body.amountInCents;

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

      if (body.amountInCents === undefined) {
        const pkg = body.packageId
          ? await prisma.coachPackage.findUnique({ where: { id: body.packageId } })
          : existing.package;
        if (pkg) {
          const durationMin = (endTime.getTime() - startTime.getTime()) / (60 * 1000);
          data.priceInCents = Math.round((pkg.priceInCents / pkg.durationMin) * durationMin);
        }
      }
    }

    const lesson = await prisma.coachLesson.update({
      where: { id },
      data: data as never,
      include: {
        coach: { select: { id: true, name: true } },
        player: { select: { id: true, name: true } },
        court: { select: { id: true, label: true } },
        package: { select: { id: true, name: true, lessonType: true, durationMin: true } },
      },
    });

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
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.coachLesson.findUnique({ where: { id } });
    if (!existing) return error("Lesson not found", 404);

    await prisma.coachLesson.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
