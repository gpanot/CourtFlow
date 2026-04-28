"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";

type GateState = "checking" | "ready";

function paramVenueId(params: { venueId?: string | string[] }): string {
  const v = params.venueId;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

/**
 * Requires staff session and a venue the user is assigned to before rendering the TV / tablet kiosk.
 */
export function TvQueueVenueGate({ children }: { children: (venueId: string) => ReactNode }) {
  const params = useParams<{ venueId?: string | string[] }>();
  const router = useRouter();
  const hydrated = useHasHydrated();
  const { token, staffId, role } = useSessionStore();
  const [gate, setGate] = useState<GateState>("checking");
  const venueId = paramVenueId(params);

  useLayoutEffect(() => {
    setGate("checking");
  }, [venueId, token, staffId, role]);

  useEffect(() => {
    if (!hydrated) return;
    if (!venueId.trim()) {
      router.replace("/staff");
      return;
    }
    if (!token || !staffId || (role !== "staff" && role !== "superadmin")) {
      router.replace("/staff");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.get<{ venues: { id: string }[] }>("/api/auth/staff-me");
        if (cancelled) return;
        const allowed = me.venues.some((v) => v.id === venueId);
        if (!allowed) {
          router.replace("/staff");
          return;
        }
        setGate("ready");
      } catch {
        if (cancelled) return;
        router.replace("/staff");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, venueId, token, staffId, role, router]);

  if (!hydrated || gate !== "ready") {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-black text-neutral-400">
        <Loader2 className="h-10 w-10 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return <>{children(venueId)}</>;
}
