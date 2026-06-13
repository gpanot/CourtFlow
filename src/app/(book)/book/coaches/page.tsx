"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePlayerVenue } from "../components/PlayerVenueContext";

interface Coach {
  id: string;
  name: string;
  coachBio: string | null;
  coachPhoto: string | null;
  startingPrice: number;
  sessionsCompleted: number;
  packages: { lessonType: string }[];
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("vi-VN").format(cents) + " VND";
}

export default function CoachesPage() {
  const { venueId } = usePlayerVenue();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const q = venueId ? `?venueId=${venueId}` : "";
    fetch(`/api/public/coaches${q}`)
      .then((r) => r.json())
      .then((d) => { setCoaches(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [venueId]);

  const filtered = coaches.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 pt-8 pb-8">
      <h1 className="text-xl font-bold mb-4">Our Coaches</h1>

      <input
        type="text"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm mb-4 outline-none focus:border-[var(--cm-accent)] text-[var(--cm-text)]"
      />

      {!loaded ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
          {search ? "No coaches match your search." : "No coaches available at this venue."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/book/coaches/${c.id}`}
              className="flex items-center gap-3 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4"
            >
              {c.coachPhoto ? (
                <img src={c.coachPhoto} alt="" className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-xl">
                  🎓
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.name}</p>
                {c.coachBio && (
                  <p className="text-xs text-[var(--cm-text-sec)] line-clamp-1">{c.coachBio}</p>
                )}
                <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">
                  From {formatPrice(c.startingPrice)}
                  {c.sessionsCompleted > 0 && ` · ${c.sessionsCompleted} sessions`}
                </p>
              </div>
              <span className="text-[var(--cm-accent)] text-sm font-medium">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
