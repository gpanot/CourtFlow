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
    console.log("[TvQueueVenueGate] checking", { venueId, token: !!token, staffId: !!staffId, role });
    if (!venueId.trim()) {
      console.warn("[TvQueueVenueGate] no venueId → redirect /staff");
      router.replace("/staff");
      return;
    }
    if (!token || !staffId) {
      console.warn("[TvQueueVenueGate] no session → redirect /staff");
      router.replace("/staff");
      return;
    }
    // Allow staff, manager, and superadmin to use tablet mode
    if (role !== "staff" && role !== "manager" && role !== "superadmin") {
      console.warn("[TvQueueVenueGate] role not allowed:", role, "→ redirect /staff");
      router.replace("/staff");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.get<{ venues: { id: string }[] }>("/api/auth/staff-me");
        if (cancelled) return;
        const allowed = me.venues.some((v) => v.id === venueId);
        console.log("[TvQueueVenueGate] staff-me venues:", me.venues.map((v) => v.id), "allowed:", allowed);
        if (!allowed) {
          console.warn("[TvQueueVenueGate] venue not in staff list → redirect /staff");
          router.replace("/staff");
          return;
        }
        setGate("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[TvQueueVenueGate] staff-me error → redirect /staff", err);
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
