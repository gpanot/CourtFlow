"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

interface PlayerVenueCtx {
  venueId: string | null;
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<PlayerVenueCtx>({ venueId: null, loading: true, refresh: () => {} });

export function PlayerVenueProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    fetch("/api/public/account")
      .then((r) => r.json())
      .then((p) => {
        setVenueId(p.venue?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") load();
    else setLoading(false);
  }, [status, load]);

  return <Ctx.Provider value={{ venueId, loading, refresh: load }}>{children}</Ctx.Provider>;
}

export function usePlayerVenue() {
  return useContext(Ctx);
}
