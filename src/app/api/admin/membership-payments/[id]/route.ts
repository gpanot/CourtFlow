import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.membershipPayment.findUnique({ where: { id } });
    if (!existing) return notFound("Payment record not found");

    const body = await parseBody<{
      status?: "PAID" | "UNPAID";
      amountInCents?: number;
      paymentMethod?: string;
      proofUrl?: string | null;
      paidAt?: string;
      note?: string;
    }>(request);

    const data: Record<string, unknown> = {};

    if (body.status === "PAID") {
      data.status = "PAID";
      data.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
      if (body.paymentMethod) data.paymentMethod = body.paymentMethod;
      if (body.note !== undefined) data.note = body.note;
      if (body.proofUrl !== undefined) data.proofUrl = body.proofUrl;
    } else if (body.status === "UNPAID") {
      data.status = "UNPAID";
      data.paidAt = null;
      data.paymentMethod = null;
    }

    if (body.amountInCents !== undefined) data.amountInCents = body.amountInCents;
    if (body.note !== undefined) data.note = body.note;
    if (body.proofUrl !== undefined) data.proofUrl = body.proofUrl;

    const payment = await prisma.membershipPayment.update({
      where: { id },
      data,
      include: {
        membership: {
          include: {
            player: { select: { id: true, name: true, phone: true } },
            tier: { select: { id: true, name: true, priceInCents: true } },
          },
        },
      },
    });

    return json(payment);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
