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

    const existing = await prisma.courtBlock.findUnique({ where: { id } });
    if (!existing) return notFound("Court block not found");

    const body = await parseBody<{
      type?: "private_competition" | "private_event" | "maintenance";
      title?: string;
      note?: string;
      courtIds?: string[];
      startTime?: string;
      endTime?: string;
    }>(request);

    const data: Record<string, unknown> = {};
    if (body.type) data.type = body.type;
    if (body.title !== undefined) data.title = body.title || null;
    if (body.note !== undefined) data.note = body.note || null;
    if (body.courtIds) data.courtIds = body.courtIds;
    if (body.startTime) data.startTime = new Date(body.startTime);
    if (body.endTime) data.endTime = new Date(body.endTime);

    const block = await prisma.courtBlock.update({ where: { id }, data });
    return json(block);
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

    const existing = await prisma.courtBlock.findUnique({ where: { id } });
    if (!existing) return notFound("Court block not found");

    await prisma.courtBlock.delete({ where: { id } });
    return json({ deleted: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
