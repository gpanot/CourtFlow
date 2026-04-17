import { create } from "zustand";
import type { FeatureFlags } from "../types/api";

interface FeatureFlagsStore {
  flags: FeatureFlags;
  loaded: boolean;
  setFlags: (flags: Partial<FeatureFlags>) => void;
  reset: () => void;
}

const defaults: FeatureFlags = {
  courtpay_enabled: true,
  subscriptions_enabled: false,
  face_recognition: true,
  cash_payment: true,
};

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set) => ({
  flags: defaults,
  loaded: false,
  setFlags: (flags) =>
    set((s) => ({ flags: { ...s.flags, ...flags }, loaded: true })),
  reset: () => set({ flags: defaults, loaded: false }),
}));
