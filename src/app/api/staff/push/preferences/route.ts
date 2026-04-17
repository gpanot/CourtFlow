import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{ pushNotificationsEnabled: boolean }>(request);

    if (typeof body.pushNotificationsEnabled !== "boolean") {
      return error("pushNotificationsEnabled (boolean) is required", 400);
    }

    await prisma.staffMember.update({
      where: { id: auth.id },
      data: { pushNotificationsEnabled: body.pushNotificationsEnabled },
    });

    if (!body.pushNotificationsEnabled) {
      await prisma.staffPushToken.updateMany({
        where: { staffId: auth.id },
        data: { active: false },
      });
    }

    return json({ success: true, pushNotificationsEnabled: body.pushNotificationsEnabled });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[staff/push/preferences]", e);
    return error("Something went wrong", 500);
  }
}
