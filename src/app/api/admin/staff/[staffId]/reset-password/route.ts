import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin, hashPassword } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { staffId } = await params;
    const { newPassword } = await parseBody<{ newPassword: string }>(request);

    if (!newPassword || newPassword.length < 4) {
      return error("Password must be at least 4 characters");
    }

    const existing = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: { venueAssignments: { select: { venueId: true } } },
    });
    if (!existing) return error("Staff member not found", 404);

    if (auth.role === "manager") {
      if (existing.role === "superadmin") return error("Cannot reset superadmin password", 403);
      const ownedVenueIds = await getAuthorizedVenueIds(auth);
      const hasOverlap = existing.venueAssignments.some((a) => ownedVenueIds.includes(a.venueId));
      if (!hasOverlap && staffId !== auth.id) return error("Cannot modify staff outside your venues", 403);
    }

    await prisma.staffMember.update({
      where: { id: staffId },
      data: { passwordHash: hashPassword(newPassword) },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
