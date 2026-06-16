"use client";

import { useState } from "react";
import { Pencil, Trash2, Infinity, Star, Eye, EyeOff, Loader2, Gift } from "lucide-react";
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
    showInCheckIn?: boolean;
    isBestChoice?: boolean;
    discountPct?: number | null;
    isFreePass?: boolean;
    _count?: { subscriptions: number };
  };
  venueName?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  onToggleVisibility?: (id: string) => Promise<void>;
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
  onToggleVisibility,
  selected,
  compact,
}: PackageCardProps) {
  const subscriberCount = pkg._count?.subscriptions ?? 0;
  const [expanded, setExpanded] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

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

  const isHidden = pkg.showInCheckIn === false;

  return (
    <div
      onClick={onSelect ? handleClick : undefined}
      className={cn(
        "relative rounded-xl border p-4 transition-all overflow-hidden",
        onSelect && "cursor-pointer hover:border-purple-500/50",
        selected
          ? "border-purple-500 bg-purple-500/10"
          : isHidden
            ? "border-neutral-700 bg-neutral-900/60 opacity-60"
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
            {pkg.discountPct != null && pkg.discountPct > 0 && !pkg.isFreePass && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold whitespace-nowrap">
                Save {pkg.discountPct}%
              </span>
            )}
            {pkg.isFreePass && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold whitespace-nowrap">
                <Gift className="h-2.5 w-2.5" />
                Free Pass
              </span>
            )}
            {pkg.showInCheckIn !== false ? (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-semibold whitespace-nowrap">
                <Eye className="h-2.5 w-2.5" />
                Visible
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700/50 border border-neutral-600 text-neutral-400 font-semibold whitespace-nowrap">
                <EyeOff className="h-2.5 w-2.5" />
                Hidden
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

        {!compact && (onEdit || onDelete || onToggleVisibility) && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Eye toggle — icon + label acts as a labelled toggle button */}
            {onToggleVisibility && (
              <button
                type="button"
                disabled={togglingVisibility}
                onClick={async (e) => {
                  e.stopPropagation();
                  setTogglingVisibility(true);
                  try { await onToggleVisibility(pkg.id); } finally { setTogglingVisibility(false); }
                }}
                title={pkg.showInCheckIn !== false ? "Hide from check-in" : "Show in check-in"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors",
                  pkg.showInCheckIn !== false
                    ? "border-green-700/50 bg-green-600/10 text-green-400 hover:bg-green-600/20"
                    : "border-red-700/50 bg-red-600/10 text-red-400 hover:bg-red-600/20"
                )}
              >
                {togglingVisibility ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : pkg.showInCheckIn !== false ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
                {pkg.showInCheckIn !== false ? "Visible" : "Hidden"}
              </button>
            )}
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
        <span className={`text-lg font-bold ${pkg.isFreePass ? "text-emerald-400" : "text-purple-400"}`}>
          {pkg.isFreePass ? "Free" : pkg.price === 0 ? "Set price" : `${formatVND(pkg.price)} VND`}
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
