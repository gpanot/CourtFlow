import { NextRequest } from "next/server";

export function getPortalVenueId(): string {
  const id = process.env.NEXT_PUBLIC_VENUE_ID || process.env.COURTFLOW_VENUE_ID;
  if (!id) throw new Error("NEXT_PUBLIC_VENUE_ID (or COURTFLOW_VENUE_ID) is required");
  return id;
}

/**
 * Resolve venue ID from request query param `venueId`, falling back to env.
 * All public portal APIs should use this so the client can override per-player.
 */
export function resolveVenueId(request?: NextRequest): string {
  const override = request?.nextUrl.searchParams.get("venueId");
  if (override) return override;
  return getPortalVenueId();
}

/**
 * Resolve the venue ID for a player, falling back to the env var.
 * Used when multi-venue support is enabled in the future.
 */
export function resolvePlayerVenueId(registrationVenueId?: string | null): string {
  const envId = process.env.NEXT_PUBLIC_VENUE_ID || process.env.COURTFLOW_VENUE_ID;
  if (envId) return envId;
  if (registrationVenueId) return registrationVenueId;
  throw new Error("No venue ID available (set NEXT_PUBLIC_VENUE_ID or complete onboarding)");
}
