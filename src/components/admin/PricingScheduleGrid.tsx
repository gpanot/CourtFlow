"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { PricingRule } from "@/lib/booking";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriceGrid = (number | null)[][];

export const DAYS_ORDERED = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

// ─── Converters ───────────────────────────────────────────────────────────────

export function rulesToGrid(rules: PricingRule[]): PriceGrid {
  const grid: PriceGrid = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (const r of rules) {
    for (let h = r.startHour; h < r.endHour && h < 24; h++) {
      grid[r.dayOfWeek][h] = r.priceValue;
    }
  }
  return grid;
}

export function gridToRules(grid: PriceGrid, startHour: number, endHour: number): PricingRule[] {
  const rules: PricingRule[] = [];
  for (let day = 0; day < 7; day++) {
    let h = startHour;
    while (h < endHour) {
      const price = grid[day][h];
      if (price === null) { h++; continue; }
      let end = h + 1;
      while (end < endHour && grid[day][end] === price) end++;
      rules.push({ dayOfWeek: day, startHour: h, endHour: end, priceValue: price });
      h = end;
    }
  }
  return rules;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface PricingScheduleGridProps {
  /** Current pricing rules for this group/court. */
  pricingRules: PricingRule[];
  /** Fallback price shown in cells with no rule — displayed as "default" bucket. */
  defaultPriceValue: number;
  /** Venue operating hours — only cells within [startHour, endHour) are rendered. */
  startHour: number;
  endHour: number;
  /** Called whenever the grid changes. Parent should hold state if needed. */
  onChange?: (rules: PricingRule[], defaultPriceValue: number) => void;
  /** When true, renders in read-only mode (no edits). */
  readOnly?: boolean;
  /** Optional class for the outer wrapper. */
  className?: string;
}

export function PricingScheduleGrid({
  pricingRules,
  defaultPriceValue,
  startHour,
  endHour,
  onChange,
  readOnly = false,
  className,
}: PricingScheduleGridProps) {
  const [grid, setGrid] = useState<PriceGrid>(() => rulesToGrid(pricingRules));
  const [localDefault, setLocalDefault] = useState(defaultPriceValue);
  const [editingCell, setEditingCell] = useState<{ day: number; hour: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Sync when parent changes the rules (e.g. switching group tabs)
  useEffect(() => {
    setGrid(rulesToGrid(pricingRules));
    setLocalDefault(defaultPriceValue);
  }, [pricingRules, defaultPriceValue]);

  const resolve = (cell: number | null) => cell ?? localDefault;
  const fmt = (v: number) => v.toLocaleString("vi-VN");

  const fireChange = (newGrid: PriceGrid, newDefault: number) => {
    if (onChange) {
      onChange(gridToRules(newGrid, startHour, endHour), newDefault);
    }
  };

  const updateCell = (day: number, hour: number, value: number) => {
    const next = grid.map((row) => [...row]);
    next[day][hour] = value === localDefault ? null : value;
    setGrid(next);
    fireChange(next, localDefault);
  };

  const startEdit = (day: number, hour: number) => {
    if (readOnly) return;
    setEditingCell({ day, hour });
    setEditValue(String(resolve(grid[day][hour])));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const value = Math.max(0, parseInt(editValue.replace(/[^0-9]/g, "") || "0", 10));
    updateCell(editingCell.day, editingCell.hour, value);
    setEditingCell(null);
  };

  const fillDay = (day: number, value: number) => {
    const next = grid.map((row) => [...row]);
    for (let h = startHour; h < endHour; h++) {
      next[day][h] = value === localDefault ? null : value;
    }
    setGrid(next);
    fireChange(next, localDefault);
  };

  const copyDayToAll = (sourceDay: number) => {
    const next = grid.map((row) => [...row]);
    for (let day = 0; day < 7; day++) {
      if (day === sourceDay) continue;
      for (let h = 0; h < 24; h++) {
        next[day][h] = grid[sourceDay][h];
      }
    }
    setGrid(next);
    fireChange(next, localDefault);
  };

  const handleDefaultChange = (value: number) => {
    setLocalDefault(value);
    fireChange(grid, value);
  };

  const activeHours: number[] = [];
  for (let h = startHour; h < endHour; h++) activeHours.push(h);

  const inputCls =
    "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Default price row */}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <label className="text-[11px] text-neutral-400 whitespace-nowrap">Default price (₫):</label>
          <input
            type="text"
            inputMode="numeric"
            value={localDefault.toLocaleString("en-US")}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10);
              handleDefaultChange(v);
            }}
            className={cn(inputCls, "max-w-[140px]")}
          />
          <span className="text-[10px] text-neutral-600">Used for hours not overridden in the grid below.</span>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-collapse text-[10px] table-fixed">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-900 px-1 py-1 text-left font-medium text-neutral-500 w-[80px]">Day</th>
              {activeHours.map((h) => (
                <th key={h} className="px-0 py-1 text-center font-medium text-neutral-500 w-[46px]">
                  {h}:00
                </th>
              ))}
              {!readOnly && (
                <th className="px-1 py-1 text-center font-medium text-neutral-500 min-w-[50px]">Fill</th>
              )}
            </tr>
          </thead>
          <tbody>
            {DAYS_ORDERED.map((day) => (
              <tr key={day} className="group">
                <td className="sticky left-0 z-10 bg-neutral-900 px-1 py-0.5 font-medium text-neutral-300 text-xs whitespace-nowrap">
                  {DAY_LABELS[day]}
                </td>
                {activeHours.map((h) => {
                  const isEditing = editingCell?.day === day && editingCell?.hour === h;
                  const raw = grid[day][h];
                  const isDefault = raw === null;
                  const cents = resolve(raw);
                  return (
                    <td key={h} className="px-0.5 py-0.5">
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingCell(null);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-full max-w-full rounded border border-purple-500 bg-neutral-800 px-1 py-1 text-[10px] text-white text-center focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(day, h)}
                          disabled={readOnly}
                          className={cn(
                            "w-full rounded border px-1 py-1 text-center transition-colors",
                            isDefault
                              ? "border-transparent bg-neutral-800/60 text-neutral-500 hover:bg-neutral-700/80 hover:text-neutral-300 disabled:hover:bg-neutral-800/60 disabled:hover:text-neutral-500"
                              : "border-purple-600/20 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 disabled:cursor-default",
                            readOnly && "cursor-default"
                          )}
                        >
                          {fmt(cents)}
                        </button>
                      )}
                    </td>
                  );
                })}
                {!readOnly && (
                  <td className="px-0.5 py-0.5">
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => {
                          const val = prompt(
                            `Set all ${DAY_LABELS[day]} slots (₫):`,
                            String(localDefault)
                          );
                          if (val !== null) {
                            fillDay(day, Math.max(0, parseInt(val.replace(/[^0-9]/g, "") || "0", 10)));
                          }
                        }}
                        className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                        title={`Fill all ${DAY_LABELS[day]} slots`}
                      >
                        Fill
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Copy ${DAY_LABELS[day]} prices to all days?`)) copyDayToAll(day);
                        }}
                        className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                        title={`Copy ${DAY_LABELS[day]} to all days`}
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-neutral-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-neutral-800/60" /> = default price
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded bg-purple-600/20 border border-purple-600/20" /> = custom price
        </span>
      </div>
    </div>
  );
}
