export const COURTFLOW_SELECTED_VENUE_STORAGE_KEY = "courtflow-selected-venue";

export function setPersistedTabletVenueId(venueId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURTFLOW_SELECTED_VENUE_STORAGE_KEY, venueId);
  } catch {
    /* ignore */
  }
}
