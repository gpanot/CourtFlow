"use client";

import { useOnboardingGuard } from "./useOnboardingGuard";

export function OnboardingGuard() {
  useOnboardingGuard();
  return null;
}
