import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      status?: "paused" | "active" | "cancelled";
      deferredStartDate?: string | null;
      clearDeferred?: boolean;
    }>(request);

    const existing = await prisma.programPass.findUnique({ where: { id } });
    if (!existing) return notFound("Program pass not found");

    const updateData: Record<string, unknown> = {};

    if (body.status === "paused") {
      updateData.status = "paused";
      if (body.deferredStartDate) {
        updateData.deferredStartDate = new Date(body.deferredStartDate + "T12:00:00+07:00");
      }
    } else if (body.status === "active") {
      updateData.status = "active";
      if (body.clearDeferred) {
        updateData.deferredStartDate = null;
      }
    } else if (body.status === "cancelled") {
      updateData.status = "cancelled";
    }

    const updated = await prisma.programPass.update({
      where: { id },
      data: updateData,
    });

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
