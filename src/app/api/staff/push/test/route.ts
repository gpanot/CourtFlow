import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { sendStaffTestPush } from "@/lib/staff-push";

/**
 * POST /api/staff/push/test
 * Body: { venueId: string }
 * Sends a test FCM notification to staff devices registered for that venue
 * (push enabled + active token). Requires staff JWT with access to the venue.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    let body: { venueId?: string };
    try {
      body = await parseBody<{ venueId?: string }>(request);
    } catch {
      return error("Invalid JSON body", 400);
    }
    const venueId = body.venueId?.trim();
    if (!venueId) return error("venueId is required", 400);

    const allowed = await prisma.staffMember.findFirst({
      where: { id: auth.id, venues: { some: { id: venueId } } },
      select: { id: true },
    });
    if (!allowed) return error("You do not have access to this venue", 403);

    const result = await sendStaffTestPush(venueId);

    if (!result.ok) {
      return json(
        {
          ok: false,
          reason: result.reason,
          message:
            result.reason === "no_firebase"
              ? "Firebase is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON)."
              : "No registered devices for this venue with push enabled. Open the staff app, select the venue, enable Push in Profile, and wait for registration.",
        },
        200
      );
    }

    return json({
      ok: true,
      targets: result.targets,
      delivered: result.delivered,
      message:
        result.delivered > 0
          ? "Test notification sent."
          : "FCM accepted no deliveries (check invalid tokens / logs).",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[staff/push/test]", e);
    return error("Something went wrong", 500);
  }
}
