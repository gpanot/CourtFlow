import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      token: string;
      venueId: string;
      platform?: string;
      deviceId?: string;
    }>(request);

    if (!body.token?.trim()) return error("token is required", 400);
    if (!body.venueId?.trim()) return error("venueId is required", 400);

    const venueId = body.venueId.trim();

    const assigned = await prisma.staffVenueAssignment.findFirst({
      where: { staffId: auth.id, venueId },
      select: { id: true },
    });
    if (!assigned) {
      return error("You do not have access to this venue", 403);
    }

    await prisma.staffPushToken.upsert({
      where: {
        staffId_token: { staffId: auth.id, token: body.token },
      },
      update: {
        venueId,
        platform: body.platform || "android",
        deviceId: body.deviceId || null,
        active: true,
        lastSeenAt: new Date(),
      },
      create: {
        staffId: auth.id,
        venueId,
        token: body.token,
        platform: body.platform || "android",
        deviceId: body.deviceId || null,
      },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[staff/push/register]", e);
    return error("Something went wrong", 500);
  }
}
