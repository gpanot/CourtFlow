import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { id } = await params;
    const body = await req.json();

    const subscription = await prisma.playerSubscription.findUnique({
      where: { id },
    });
    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.sessionsRemaining !== undefined)
      data.sessionsRemaining = body.sessionsRemaining;
    if (body.expiresAt) data.expiresAt = new Date(body.expiresAt);

    const updated = await prisma.playerSubscription.update({
      where: { id },
      data,
      include: { player: true, package: true },
    });

    return NextResponse.json({ subscription: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
