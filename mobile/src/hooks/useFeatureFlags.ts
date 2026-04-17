import { useEffect } from "react";
import { api } from "../lib/api-client";
import { useFeatureFlagsStore } from "../stores/feature-flags-store";
import type { FeatureFlags } from "../types/api";

/**
 * Fetches server-driven feature flags for the given venue.
 * Falls back to defaults if the endpoint is unavailable (temporary adapter).
 */
export function useFeatureFlags(venueId: string | null) {
  const setFlags = useFeatureFlagsStore((s) => s.setFlags);
  const loaded = useFeatureFlagsStore((s) => s.loaded);

  useEffect(() => {
    if (!venueId || loaded) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await api.get<{ flags?: Partial<FeatureFlags> }>(
          `/api/venues/${venueId}/feature-flags`
        );
        if (!cancelled && data.flags) {
          setFlags(data.flags);
        }
      } catch {
        // Endpoint may not exist yet; use defaults
        if (!cancelled) {
          setFlags({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [venueId, loaded, setFlags]);
}
