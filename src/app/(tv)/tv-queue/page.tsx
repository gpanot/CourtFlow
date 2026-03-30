"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";

export default function TvQueueVenueSelect() {
  const router = useRouter();
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .get<{ id: string; name: string }[]>("/api/venues")
      .then(setVenues)
      .catch(console.error);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-8">
      <h1 className="text-4xl font-bold text-green-500">CourtFlow</h1>
      <p className="text-xl text-neutral-400">TV Tablet — Select venue</p>
      <div className="grid gap-3">
        {venues.map((v) => (
          <button
            key={v.id}
            onClick={() => router.push(`/tv-queue/${v.id}`)}
            className="rounded-xl bg-neutral-800 px-8 py-4 text-2xl font-semibold text-white hover:bg-neutral-700"
          >
            {v.name}
          </button>
        ))}
        {venues.length === 0 && (
          <p className="text-neutral-500">Loading venues...</p>
        )}
      </div>
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
    </div>
  );
}
