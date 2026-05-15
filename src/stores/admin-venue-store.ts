"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AdminVenueState {
  selectedVenueId: string | null;
  setSelectedVenueId: (id: string) => void;
}

export const useAdminVenueStore = create<AdminVenueState>()(
  persist(
    (set) => ({
      selectedVenueId: null,
      setSelectedVenueId: (id) => set({ selectedVenueId: id }),
    }),
    { name: "admin-venue" }
  )
);
