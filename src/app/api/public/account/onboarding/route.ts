import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth();
    const body = await request.json();
    const { phone, gender, skillLevel, venueId } = body as {
      phone: string;
      gender: string;
      skillLevel: string;
      venueId?: string | null;
    };

    if (!phone || phone.length < 8) return error("Phone number is required", 400);
    if (!["male", "female"].includes(gender)) return error("Invalid gender", 400);
    if (!["beginner", "intermediate", "advanced", "pro"].includes(skillLevel))
      return error("Invalid skill level", 400);

    const normalizedPhone = phone.replace(/\s+/g, "");

    // Check if another real player (not the placeholder-phone current user) has this phone
    const existing = await prisma.player.findFirst({
      where: {
        phone: normalizedPhone,
        NOT: { id: playerId },
        // Only treat it as a conflict if it's a real player (not another placeholder)
        AND: [
          { NOT: { phone: { startsWith: "oauth_" } } },
          { NOT: { phone: { startsWith: "email_" } } },
        ],
      },
    });

    if (existing) {
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
