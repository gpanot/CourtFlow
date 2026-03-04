import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function GET() {
  try {
    const venues = await prisma.venue.findMany({
      where: { active: true },
      include: { courts: true },
    });
    return json(venues);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
