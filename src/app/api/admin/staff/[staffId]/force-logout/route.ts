import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/staff/:staffId/force-logout
 *
 * Bumps the staff member's tokenVersion, immediately invalidating all
 * currently-issued JWTs (mobile app + web admin). The next time any
 * version-checked endpoint (e.g. /api/auth/staff-me) is called, the
 * stale token will be rejected and the client will be forced back to
 * the login screen.
 *
 * Requires superadmin JWT.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);

    const { staffId } = await params;

    const staff = await prisma.staffMember.findUnique({
      where: { id: staffId },
      select: { id: true, name: true, phone: true, tokenVersion: true },
    });

    if (!staff) return error("Staff member not found", 404);

    const updated = await prisma.staffMember.update({
      where: { id: staffId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    return json({
      success: true,
      staffId,
      name: staff.name,
      phone: staff.phone,
      tokenVersion: updated.tokenVersion,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Super admin access required") return error(msg, 403);
    return error("Something went wrong", 500);
  }
}
