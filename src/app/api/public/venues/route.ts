import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const allCountries = searchParams.get("allCountries") === "true";

    let playerCountry: string | null = null;
    if (!allCountries) {
      try {
        const { playerId } = await requirePortalAuth(request);
        const account = await prisma.playerAccount.findFirst({
          where: { playerId },
          select: { country: true },
        });
        playerCountry = account?.country ?? null;
      } catch {
        // unauthenticated — no filter
      }
    }

    const venues = await prisma.venue.findMany({
      where: {
        active: true,
        portalEnabled: true,
        ...(playerCountry
          ? { organization: { country: playerCountry } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        location: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
    });

    return json(venues);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
