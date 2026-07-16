import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const instances = await prisma.classInstance.findMany({
      where: { programRunId: id },
      include: {
        courtBlock: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            courtIds: true,
            courtBlockCoaches: {
              include: { coach: { select: { id: true, name: true } } },
            },
          },
        },
        _count: { select: { checkIns: true } },
      },
      orderBy: { startAt: "asc" },
    });

    return json(instances);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
