import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (q.length < 2) return json({ players: [] });

    const players = await prisma.player.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        facePhotoPath: true,
        avatarPhotoPath: true,
      },
      take: 15,
      orderBy: { name: "asc" },
    });

    return json({ players });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
