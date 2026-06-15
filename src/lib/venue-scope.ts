import { prisma } from "./db";
import type { JwtPayload } from "./auth";

/**
 * Returns the venue IDs the caller is authorized to access.
 * - superadmin: venues they are assigned to
 * - manager: venues they own OR are assigned to
 */
export async function getAuthorizedVenueIds(auth: JwtPayload): Promise<string[]> {
  // superadmin: all venues, no restriction
  if (auth.role === "superadmin") {
    const venues = await prisma.venue.findMany({ select: { id: true } });
    return venues.map((v) => v.id);
  }

  // manager: venues they own OR are assigned to
  const venues = await prisma.venue.findMany({
    where: {
      OR: [
        { ownerId: auth.id },
        { staffAssignments: { some: { staffId: auth.id } } },
      ],
    },
    select: { id: true },
  });
  return venues.map((v) => v.id);
}

/**
 * Asserts that the given venueId is within the caller's authorized scope.
 * Throws if not.
 */
export async function assertVenueAccess(auth: JwtPayload, venueId: string): Promise<void> {
  const venueIds = await getAuthorizedVenueIds(auth);
  if (!venueIds.includes(venueId)) {
    throw new Error("Access denied to this venue");
  }
}
