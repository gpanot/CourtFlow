"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { CourtFlowLogo } from "@/components/courtflow-logo";

export default function TvQueueVenueSelect() {
  const router = useRouter();
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [liveByVenueId, setLiveByVenueId] = useState<Record<string, boolean>>({});

  const handleBack = () => {
    router.push("/staff");
  };

  useEffect(() => {
    api
      .get<{ id: string; name: string }[]>("/api/venues")
      .then(setVenues)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (venues.length === 0) return;
    let cancelled = false;
    (async () => {
      const checks = await Promise.all(
        venues.map(async (venue) => {
          try {
            const state = await api.get<{ session: { status?: string } | null }>(
              `/api/courts/state?venueId=${venue.id}`
            );
            const isLive =
              !!state.session &&
              state.session.status !== "closed" &&
              state.session.status !== "ended";
            return [venue.id, isLive] as const;
          } catch {
            return [venue.id, false] as const;
          }
        })
      );
      if (cancelled) return;
      setLiveByVenueId(Object.fromEntries(checks));
    })();
    return () => {
      cancelled = true;
    };
  }, [venues]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-8">
      <div className="mb-2 flex flex-col items-center gap-2 text-center">
        <CourtFlowLogo asLink={false} size="small" dark />
        <p className="text-sm text-neutral-300">More gameplay, more fun</p>
      </div>
      <p className="text-xl text-neutral-400">Tablet — Select venue</p>
      <div className="grid gap-3">
        {venues.map((v) => (
          <button
            key={v.id}
            onClick={() => router.push(`/tv-queue/${v.id}`)}
            className="flex items-center gap-3 rounded-xl bg-neutral-800 px-8 py-4 text-2xl font-semibold text-white hover:bg-neutral-700"
          >
            {liveByVenueId[v.id] && (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.9)] animate-pulse"
              />
            )}
            <span>{v.name}</span>
          </button>
        ))}
        {venues.length === 0 && (
          <p className="text-neutral-500">Loading venues...</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleBack}
        className="text-sm text-neutral-500 transition-colors hover:text-neutral-300"
      >
        ← Back
      </button>
    </div>
  );
}
