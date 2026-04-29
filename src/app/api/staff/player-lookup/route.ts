import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { findPlayerByPhoneDigits } from "@/lib/find-player-by-phone-digits";
import { prisma } from "@/lib/db";
import { isWalkInSyntheticPhone } from "@/lib/walk-in-phone";

/**
 * Staff-authenticated player lookup by phone.
 * Searches both the `players` table (self check-in / face-scan flow)
 * and the `check_in_players` table (CourtPay flow).
 * Does NOT require an active session.
 */
export async function POST(request: NextRequest) {
  console.log("[Staff Player Lookup] POST received");
  try {
    requireStaff(request.headers);

    const { phone, venueId } = await parseBody<{ phone: string; venueId?: string }>(request);
    console.log("[Staff Player Lookup] phone:", phone, "venueId:", venueId);

    if (!phone?.trim()) return error("phone is required", 400);
    if (isWalkInSyntheticPhone(phone)) {
      return error("Walk-in synthetic phone numbers cannot be looked up", 400);
    }

    const digitsOnly = phone.trim().replace(/\D/g, "");
    if (digitsOnly.length < 4) return error("Phone number too short", 400);

    console.log("[Staff Player Lookup] digitsOnly:", digitsOnly);

    // 1. At a venue, prefer CourtPay `CheckInPlayer` so staff flows stay CourtPay-first.
    type CipRow = { id: string; name: string; phone: string; skill_level: string | null };
    let checkInRows: CipRow[] = [];

    if (venueId) {
      checkInRows = await prisma.$queryRaw<CipRow[]>`
        SELECT id, name, phone, skill_level
        FROM check_in_players
        WHERE venue_id = ${venueId}
          AND phone NOT LIKE 'walkin:%'
          AND phone NOT LIKE '%+'
          AND regexp_replace(phone, '\\D', '', 'g') = ${digitsOnly}
        LIMIT 1
      `;
    }

    const checkInPlayer = checkInRows[0] ?? null;
    if (checkInPlayer) {
      console.log("[Staff Player Lookup] check_in_players (venue) result:", checkInPlayer.id);
      return json({
        success: true,
        source: "checkInPlayer",
        player: {
          id: checkInPlayer.id,
          name: checkInPlayer.name,
          phone: checkInPlayer.phone,
          skillLevel: checkInPlayer.skill_level ?? null,
          facePhotoPath: null,
          avatarPhotoPath: null,
        },
      });
    }

    // 2. Legacy `Player` row (linked face / app) — staff check-in bridges to CheckInPlayer at payment time.
    const player = await findPlayerByPhoneDigits(phone.trim(), { minimumDigits: 4 });
    console.log("[Staff Player Lookup] players table result:", player?.id ?? "not found");

    if (player) {
      const fullPlayer = await prisma.player.findUnique({
        where: { id: player.id },
        select: { id: true, name: true, phone: true, skillLevel: true, facePhotoPath: true, avatarPhotoPath: true },
      });
      return json({
        success: true,
        source: "player",
        player: {
          id: fullPlayer?.id ?? player.id,
          name: fullPlayer?.name ?? player.name,
          phone: fullPlayer?.phone ?? player.phone,
          skillLevel: fullPlayer?.skillLevel ?? null,
          facePhotoPath: fullPlayer?.facePhotoPath ?? null,
          avatarPhotoPath: fullPlayer?.avatarPhotoPath ?? null,
        },
      });
    }

    // 3. CheckInPlayer at any venue (only when venue-scoped search did not run)
    if (!venueId) {
      checkInRows = await prisma.$queryRaw<CipRow[]>`
        SELECT id, name, phone, skill_level
        FROM check_in_players
        WHERE phone NOT LIKE 'walkin:%'
          AND phone NOT LIKE '%+'
          AND regexp_replace(phone, '\\D', '', 'g') = ${digitsOnly}
        LIMIT 1
      `;
      const cipGlobal = checkInRows[0] ?? null;
      if (cipGlobal) {
        console.log("[Staff Player Lookup] check_in_players (global) result:", cipGlobal.id);
        return json({
          success: true,
          source: "checkInPlayer",
          player: {
            id: cipGlobal.id,
            name: cipGlobal.name,
            phone: cipGlobal.phone,
            skillLevel: cipGlobal.skill_level ?? null,
            facePhotoPath: null,
            avatarPhotoPath: null,
          },
        });
      }
    }

    console.log("[Staff Player Lookup] no player found for digits:", digitsOnly);
    return error("No player found with this phone number", 404);
  } catch (e) {
    console.error("[Staff Player Lookup] ERROR:", e);
    return error((e as Error).message, 500);
  }
}
