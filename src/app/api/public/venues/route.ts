import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const venues = await prisma.venue.findMany({
      where: { active: true, portalEnabled: true },
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
