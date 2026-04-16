"use client";

import { Pencil, Trash2, Infinity } from "lucide-react";
import { cn } from "@/lib/cn";

interface PackageCardProps {
  pkg: {
    id: string;
    name: string;
    sessions: number | null;
    durationDays: number;
    price: number;
    perks: string | null;
    isActive: boolean;
    _count?: { subscriptions: number };
  };
  venueName?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  selected?: boolean;
  compact?: boolean;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export function PackageCard({
  pkg,
  venueName,
  onEdit,
  onDelete,
  onSelect,
  selected,
  compact,
}: PackageCardProps) {
  const subscriberCount = pkg._count?.subscriptions ?? 0;

  return (
    <div
      onClick={onSelect ? () => onSelect(pkg.id) : undefined}
      className={cn(
        "rounded-xl border p-4 transition-all",
        onSelect && "cursor-pointer hover:border-purple-500/50",
        selected
          ? "border-purple-500 bg-purple-500/10"
          : "border-neutral-800 bg-neutral-900",
        !pkg.isActive && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">{pkg.name}</h3>
            {!pkg.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-400">
            {pkg.sessions === null ? (
              <span className="flex items-center gap-1">
                <Infinity className="h-3.5 w-3.5" /> Unlimited
              </span>
            ) : (
              <span>{pkg.sessions} sessions</span>
            )}
            <span>·</span>
            <span>{pkg.durationDays} days</span>
          </div>
          {venueName && (
            <p className="mt-0.5 text-xs text-neutral-500">{venueName}</p>
          )}
        </div>

        {!compact && (onEdit || onDelete) && (
          <div className="flex gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(pkg.id); }}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && pkg.isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(pkg.id); }}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-900/30 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-lg font-bold text-purple-400">
          {pkg.price === 0 ? "Set price" : `${formatVND(pkg.price)} VND`}
        </span>
      </div>

      {pkg.perks && !compact && (
        <p className="mt-2 text-xs text-neutral-400 line-clamp-2">
          {pkg.perks}
        </p>
      )}

      {!compact && subscriberCount > 0 && (
        <p className="mt-2 text-xs text-neutral-500">
          Active subscribers: {subscriberCount}
        </p>
      )}
    </div>
  );
}
