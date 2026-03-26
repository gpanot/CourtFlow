import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

/** Current staff member name and phone (Bearer staff/superadmin JWT). */
export async function GET(request: NextRequest) {
  try {
    const payload = requireStaff(request.headers);
    const staff = await prisma.staffMember.findUnique({
      where: { id: payload.id },
      select: { name: true, phone: true },
    });
    if (!staff) return error("Staff not found", 404);
    return json({ name: staff.name, phone: staff.phone });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[staff-me]", e);
    return error("Something went wrong", 500);
  }
}
