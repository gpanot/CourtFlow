import { prisma } from "@/lib/db";
import type { Perk, PerkType } from "../types";

/**
 * Load the structured perks for a player's active membership at a venue.
 *
 * Returns an empty array when:
 * - The player has no membership at this venue
 * - The membership exists but is not active (suspended, cancelled, expired)
 * - The tier has no structured perks configured (structuredPerks is empty)
 *
 * Cached per-request via the caller — this function always hits the DB.
 */
export async function getActiveMembershipPerks(
  playerId: string,
  venueId: string
): Promise<Perk[]> {
  const membership = await prisma.membership.findUnique({
    where: { playerId_venueId: { playerId, venueId } },
    include: {
      tier: { select: { structuredPerks: true } },
    },
  });

  if (!membership || membership.status !== "active") {
    return [];
  }

  const raw = membership.tier.structuredPerks;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  // Validate and filter to known perk types so unknown future entries don't throw
  const perks: Perk[] = [];
  for (const entry of raw) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as { type?: unknown }).type === "string" &&
      typeof (entry as { value?: unknown }).value === "number"
    ) {
      perks.push(entry as unknown as Perk);
    }
  }
  return perks;
}

/**
 * Convenience: look up a single perk value by type, or null if not present.
 */
export async function getActivePerkValue(
  playerId: string,
  venueId: string,
  type: PerkType
): Promise<number | null> {
  const perks = await getActiveMembershipPerks(playerId, venueId);
  const match = perks.find((p) => p.type === type);
  return match?.value ?? null;
}
