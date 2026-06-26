import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { phone, gender, skillLevel, venueId, faceLinked, venueOnly } = body as {
      phone?: string;
      gender?: string;
      skillLevel?: string;
      venueId?: string | null;
      faceLinked?: boolean;
      venueOnly?: boolean;
    };

    // Venue-only update: the profile step already validated & saved the phone.
    // Skip all phone validation and conflict checks — just set registrationVenueId.
    if (venueOnly && venueId) {
      const updated = await prisma.player.update({
        where: { id: playerId },
        data: { registrationVenueId: venueId },
      });
      console.log("[onboarding API] venue-only update:", { playerId, venueId });
      return json({ playerId: updated.id });
    }

    if (!phone || phone.length < 8) return error(`Phone number is required (got "${phone}", len=${phone?.length})`, 400);
    if (!["male", "female"].includes(gender ?? "")) return error("Invalid gender", 400);
    if (!["beginner", "intermediate", "advanced", "pro"].includes(skillLevel ?? ""))
      return error("Invalid skill level", 400);

    const normalizedPhone = phone.replace(/\s+/g, "");

    // Last 9 digits for fuzzy duplicate check — same logic as check-phone route.
    const digits = normalizedPhone.replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    console.log("[onboarding API] phone check:", { playerId, phone: normalizedPhone, tail, faceLinked });

    // Check if another real player (not the current user) has this phone.
    const existingRows = await prisma.$queryRaw<{ id: string; phone: string }[]>`
      SELECT id, phone
      FROM players
      WHERE id != ${playerId}
        AND phone NOT LIKE 'oauth_%'
        AND phone NOT LIKE 'email_%'
        AND phone NOT LIKE 'deleted_%'
        AND phone NOT LIKE 'walkin:%'
        AND phone NOT LIKE '%+'
        AND length(regexp_replace(phone, '\\D', '', 'g')) >= 8
        AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = ${tail}
      LIMIT 1
    `;

    const existing = existingRows[0] ?? null;
    console.log("[onboarding API] conflict check:", { tail, match: existing?.phone ?? "none", matchId: existing?.id ?? "none", faceLinked });

    if (existing && !faceLinked) {
      return json({ existingPlayerId: existing.id, error: "phone_match" }, 409);
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        phone: normalizedPhone,
        gender: gender as "male" | "female",
        skillLevel: skillLevel as "beginner" | "intermediate" | "advanced" | "pro",
        ...(venueId ? { registrationVenueId: venueId } : {}),
      },
    });

    return json({ playerId: updated.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    if ((e as { code?: string }).code === "P2002") {
      return error("Phone number already in use", 409);
    }
    return error(msg, 500);
  }
}
