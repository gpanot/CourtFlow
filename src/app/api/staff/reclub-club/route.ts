import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

/** Staff updates their default Reclub club (groupId) for roster fetch — global per account. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{ reclubGroupId: number | null }>(request);

    const gid =
      body.reclubGroupId === null || body.reclubGroupId === undefined
        ? null
        : Number(body.reclubGroupId);
    if (gid !== null && (Number.isNaN(gid) || !Number.isInteger(gid))) {
      return error("reclubGroupId must be an integer or null", 400);
    }

    const staff = await prisma.staffMember.update({
      where: { id: auth.id },
      data: { reclubGroupId: gid },
      select: { id: true, reclubGroupId: true },
    });

    return json(staff);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
