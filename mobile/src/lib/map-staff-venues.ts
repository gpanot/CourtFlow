import type { Venue } from "../types/api";

/** Normalize login / staff-me venue list to the shape UI expects. */
export function mapStaffVenuesToVenues(
  venues: { id: string; name: string }[] | undefined
): Venue[] {
  if (!venues?.length) return [];
  return venues.map((v) => ({
    id: v.id,
    name: v.name,
    code: "",
    settings: null,
    bankName: null,
    bankAccount: null,
    bankOwnerName: null,
  }));
}
