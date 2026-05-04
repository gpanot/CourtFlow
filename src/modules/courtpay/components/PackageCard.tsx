"use client";

import { useState } from "react";
import { Pencil, Trash2, Infinity, Star } from "lucide-react";
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
    isBestChoice?: boolean;
    discountPct?: number | null;
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
  const [expanded, setExpanded] = useState(false);

  const perkList = pkg.perks
    ? pkg.perks.split(/[\n,]/).map((p) => p.trim()).filter(Boolean).slice(0, 4)
    : [];
  const firstPerk = perkList[0];
  const extraCount = perkList.length - 1;

  const handleClick = () => {
    if (onSelect) {
      onSelect(pkg.id);
      setExpanded((v) => !v);
    }
  };

  return (
    <div
      onClick={onSelect ? handleClick : undefined}
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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white truncate">{pkg.name}</h3>
            {pkg.isBestChoice && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 font-semibold whitespace-nowrap">
                <Star className="h-2.5 w-2.5 fill-fuchsia-300" />
                Most Popular
              </span>
            )}
            {pkg.discountPct != null && pkg.discountPct > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold whitespace-nowrap">
                Save {pkg.discountPct}%
              </span>
            )}
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

      {/* Perks — collapsed shows summary line, expanded shows all bullets */}
      {perkList.length > 0 && (
        expanded ? (
          <ul className="mt-2 space-y-0.5">
            {perkList.map((perk, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-400">
                <span className="text-purple-400 mt-px">•</span>
                <span className="truncate">{perk}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-neutral-400 italic truncate">
            {firstPerk}{extraCount > 0 ? ` + ${extraCount} more` : ""}
          </p>
        )
      )}

      {!compact && subscriberCount > 0 && (
        <p className="mt-2 text-xs text-neutral-500">
          Active subscribers: {subscriberCount}
        </p>
      )}
    </div>
  );
}
