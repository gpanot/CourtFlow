import { create } from "zustand";

interface CoachPortalState {
  /** Incremented each time a coach lesson notification is tapped — CoachPortalScreen watches this. */
  refreshTick: number;
  triggerRefresh: () => void;
}

export const useCoachPortalStore = create<CoachPortalState>((set) => ({
  refreshTick: 0,
  triggerRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
}));
