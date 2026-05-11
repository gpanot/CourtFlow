import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const reviewed = searchParams.get("reviewed");

  const where =
    reviewed === "true" ? { reviewed: true } : reviewed === "false" ? { reviewed: false } : {};

  const [total, logs] = await Promise.all([
    prisma.signupDuplicateLog.count({ where }),
    prisma.signupDuplicateLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        matchedPlayer: {
          select: {
            id: true,
            name: true,
            phone: true,
            facePhotoPath: true,
            avatarPhotoPath: true,
          },
        },
        venue: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}

export async function PATCH(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id: string;
    reviewed: boolean;
    reviewNote?: string;
  };
  const { id, reviewed, reviewNote } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const log = await prisma.signupDuplicateLog.update({
    where: { id },
    data: {
      reviewed,
      reviewedAt: reviewed ? new Date() : null,
      reviewNote: reviewNote ?? null,
    },
  });

  return NextResponse.json({ log });
}
