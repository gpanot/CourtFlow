/** Values stored per staff–venue assignment and returned to clients. */
export type StaffAppAccessKind = "courtflow" | "courtpay";

const ALLOWED = new Set<StaffAppAccessKind>(["courtflow", "courtpay"]);

export function normalizeAppAccess(raw: string[] | undefined | null): StaffAppAccessKind[] {
  const list = (raw ?? [])
    .map((s) => String(s).toLowerCase().trim())
    .filter((s): s is StaffAppAccessKind => ALLOWED.has(s as StaffAppAccessKind));
  const dedup = [...new Set(list)];
  if (dedup.length === 0) return ["courtflow"];
  return dedup;
}

export type StaffVenueWithAppAccess = {
  id: string;
  name: string;
  appAccess: StaffAppAccessKind[];
};

export function staffAssignmentsToVenues(
  rows: { appAccess: string[]; venue: { id: string; name: string } }[]
): StaffVenueWithAppAccess[] {
  return rows.map((r) => ({
    id: r.venue.id,
    name: r.venue.name,
    appAccess: normalizeAppAccess(r.appAccess),
  }));
}
