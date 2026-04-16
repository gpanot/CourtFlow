"use client";

import { cn } from "@/lib/cn";
import { Search, Infinity } from "lucide-react";

interface Subscriber {
  id: string;
  playerName: string;
  playerPhone: string;
  venueName?: string;
  packageName: string;
  packagePrice?: number;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  usageCount: number;
  activatedAt: string;
  expiresAt: string;
}

interface SubscriberListProps {
  subscribers: Subscriber[];
  search: string;
  onSearchChange: (s: string) => void;
  onSelect?: (id: string) => void;
  showVenue?: boolean;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

const statusColors: Record<string, string> = {
  active: "bg-green-900/30 text-green-400",
  exhausted: "bg-yellow-900/30 text-yellow-400",
  expired: "bg-neutral-800 text-neutral-400",
  cancelled: "bg-red-900/30 text-red-400",
};

export function SubscriberList({
  subscribers,
  search,
  onSearchChange,
  onSelect,
  showVenue,
}: SubscriberListProps) {
  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-10 pr-3 text-sm text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {subscribers.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          {search ? "No subscribers found" : "No subscribers yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {subscribers.map((s) => {
            const daysLeft = Math.max(
              0,
              Math.ceil(
                (new Date(s.expiresAt).getTime() - Date.now()) / 86400000
              )
            );

            return (
              <div
                key={s.id}
                onClick={onSelect ? () => onSelect(s.id) : undefined}
                className={cn(
                  "rounded-lg border border-neutral-800 bg-neutral-900 p-3",
                  onSelect && "cursor-pointer hover:border-neutral-700"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">
                      {s.playerName}
                    </p>
                    <p className="text-xs text-neutral-500">{s.playerPhone}</p>
                    {showVenue && s.venueName && (
                      <p className="text-xs text-neutral-500">{s.venueName}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      statusColors[s.status] || statusColors.expired
                    )}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                  <span className="text-purple-400 font-medium">
                    {s.packageName}
                  </span>
                  {s.totalSessions === null ? (
                    <span className="flex items-center gap-0.5">
                      <Infinity className="h-3 w-3" /> Unlimited
                    </span>
                  ) : (
                    <span>
                      {s.sessionsRemaining ?? 0}/{s.totalSessions} left
                    </span>
                  )}
                  <span>{daysLeft}d remaining</span>
                  {s.packagePrice !== undefined && (
                    <span>{formatVND(s.packagePrice)} VND</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
