import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    await assertVenueAccess(auth, id);

    const body = await parseBody<{ notificationEmail: string | null }>(request);
    const email = body.notificationEmail?.trim() || null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error("Invalid email address", 400);
    }

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) return notFound("Venue not found");

    const settings = { ...(venue.settings as Record<string, unknown>), notificationEmail: email };

    const updated = await prisma.venue.update({
      where: { id },
      data: { settings: settings as never },
    });

    return json({
      notificationEmail: (updated.settings as Record<string, unknown>).notificationEmail ?? null,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
