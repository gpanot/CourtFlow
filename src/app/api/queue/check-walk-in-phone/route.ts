import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { isWalkInSyntheticPhone } from "@/lib/walk-in-phone";

/**
 * GET ?phone=...
 * Returns whether a real player (non–walk-in synthetic phone) already uses this number.
 * Match is by digits-only equality so +66… vs 66… still matches.
 */
export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const raw = request.nextUrl.searchParams.get("phone")?.trim() ?? "";
    if (isWalkInSyntheticPhone(raw)) {
      return json({ exists: false });
    }
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length < 8) {
      return json({ exists: false });
    }

    const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name
      FROM players
      WHERE phone NOT LIKE 'walkin:%'
        AND phone NOT LIKE '%+'
        AND regexp_replace(phone, '\\D', '', 'g') = ${digitsOnly}
      LIMIT 1
    `;

    const row = rows[0];
    return json({
      exists: !!row,
      name: row?.name ?? null,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (/Missing authorization|Invalid or expired|Staff access required/i.test(msg)) {
      return error(msg, 401);
    }
    console.error("[check-walk-in-phone]", e);
    return error(msg, 500);
  }
}
