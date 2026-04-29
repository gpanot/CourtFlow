import { prisma } from "@/lib/db";
import { isAnyWalkInPhone } from "@/lib/walk-in-phone";
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
  rawPhone: string,
  options?: { minimumDigits?: number }
): Promise<PlayerPhoneLookupRow | null> {
  if (isAnyWalkInPhone(rawPhone)) return null;
  const digitsOnly = rawPhone.replace(/\D/g, "");
  const minimumDigits = options?.minimumDigits ?? 8;
  if (digitsOnly.length < minimumDigits) return null;

  const rows = await prisma.$queryRaw<PlayerPhoneLookupRow[]>`
    SELECT id, name, phone, skill_level AS "skillLevel", gender AS gender
    FROM players
    WHERE phone NOT LIKE 'walkin:%'
      AND phone NOT LIKE '%+'
      AND regexp_replace(phone, '\\D', '', 'g') = ${digitsOnly}
    LIMIT 1
  `;

  return rows[0] ?? null;
}
