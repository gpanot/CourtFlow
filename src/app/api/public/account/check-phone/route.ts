import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

/**
 * Normalize a phone number to its trailing subscriber digits for fuzzy comparison.
 *
 * The problem: CourtPay stores raw keypad input ("9595656959"), while CourtPass
 * builds E.164 on the frontend ("+849595656959"). Exact-match fails.
 *
 * Strategy: strip all non-digits, then take the last 9 digits as the "local number".
 * 9 digits covers all Vietnamese subscriber numbers (10-digit local = 0 + 9 digits).
 * This also handles "+84…" (12 digits) vs "0…" (10 digits) vs bare "…" (9–10 digits).
 * Minimum 8 trailing digits are required to avoid false positives on very short strings.
 */
function localDigits(phone: string, len = 9): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= len ? d.slice(-len) : d;
}

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.replace(/\s+/g, "");
  if (!phone || phone.length < 5) return json({ exists: false });

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return json({ exists: false, existingPlayerId: null });

  // Last 9 digits of the input (the local subscriber part)
  const tail = localDigits(phone);

  // Match any stored phone whose last-9 digits equal our tail.
  // regexp_replace strips non-digits; RIGHT() takes trailing N chars.
  const rows = await prisma.$queryRaw<{ id: string; phone: string }[]>`
    SELECT id, phone
    FROM players
    WHERE phone NOT LIKE 'oauth_%'
      AND phone NOT LIKE 'email_%'
      AND phone NOT LIKE 'deleted_%'
      AND phone NOT LIKE 'walkin:%'
      AND phone NOT LIKE '%+'
      AND length(regexp_replace(phone, '\\D', '', 'g')) >= 8
      AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = ${tail}
    LIMIT 1
  `;

  const player = rows[0] ?? null;

  console.log("[check-phone] input:", phone, "tail:", tail, "match:", player?.phone ?? "none", "id:", player?.id ?? "none");

  return json({ exists: !!player, existingPlayerId: player?.id ?? null });
}
