import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { staffId } = await params;
    const { newPassword } = await parseBody<{ newPassword: string }>(request);

    if (!newPassword || newPassword.length < 4) {
      return error("Password must be at least 4 characters");
    }

    const existing = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!existing) return error("Staff member not found", 404);

    await prisma.staffMember.update({
      where: { id: staffId },
      data: { passwordHash: hashPassword(newPassword) },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
