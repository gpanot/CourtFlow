import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.replace(/\s+/g, "");
  if (!phone || phone.length < 5) return json({ exists: false });

  const player = await prisma.player.findFirst({
    where: {
      phone,
      NOT: [
        { phone: { startsWith: "oauth_" } },
        { phone: { startsWith: "email_" } },
        { phone: { startsWith: "deleted_" } },
      ],
    },
    select: { id: true },
  });

  return json({ exists: !!player, existingPlayerId: player?.id ?? null });
}
