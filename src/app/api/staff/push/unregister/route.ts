import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{ token: string }>(request);

    if (!body.token?.trim()) return error("token is required", 400);

    await prisma.staffPushToken.deleteMany({
      where: { staffId: auth.id, token: body.token },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[staff/push/unregister]", e);
    return error("Something went wrong", 500);
  }
}
