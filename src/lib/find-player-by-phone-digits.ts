import { prisma } from "@/lib/db";
import type { Gender, SkillLevel } from "@prisma/client";

export type PlayerPhoneLookupRow = {
  id: string;
  name: string;
  phone: string;
  skillLevel: SkillLevel;
  gender: Gender;
};

/**
 * Match by digits-only equality so +66… vs 66… still matches. Excludes synthetic walk-in phones.
 */
export async function findPlayerByPhoneDigits(
  rawPhone: string
): Promise<PlayerPhoneLookupRow | null> {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  if (digitsOnly.length < 8) return null;

  const rows = await prisma.$queryRaw<PlayerPhoneLookupRow[]>`
    SELECT id, name, phone, skill_level AS "skillLevel", gender AS gender
    FROM players
    WHERE phone NOT LIKE 'walkin:%'
      AND regexp_replace(phone, '\\D', '', 'g') = ${digitsOnly}
    LIMIT 1
  `;

  return rows[0] ?? null;
}
