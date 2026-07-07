"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import adminI18n from "@/i18n/admin-i18n";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { getPricingGroupColor } from "@/lib/pricing-group-colors";

export interface Court {
  id: string;
  label: string;
  status: string;
  isBookable: boolean;
  pricingGroupId?: string | null;
  priceOverride?: unknown;
}

export interface PricingGroupOption {
  id: string;
  name: string;
  isDefault: boolean;
  defaultPriceValue: number;
  pricingRules: unknown[];
}

export function CourtsManager({
  venueId,
  courts,
  pricingGroups = [],
  onRefresh,
  showBookable = false,
  readOnly = false,
}: {
  venueId: string;
  courts: Court[];
  pricingGroups?: PricingGroupOption[];
  onRefresh: () => void;
  showBookable?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [addLabel, setAddLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Pricing group assignment
  const [assigningGroupId, setAssigningGroupId] = useState<string | null>(null);

  const addCourt = async () => {
    if (!addLabel.trim()) return;
    setAdding(true);
    try {
      await api.post(`/api/venues/${venueId}/courts`, { label: addLabel.trim() });
      setAddLabel("");
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const renameCourt = async (courtId: string) => {
    if (!editLabel.trim()) return;
    try {
      await api.patch(`/api/courts/${courtId}`, { label: editLabel.trim() });
      setEditingId(null);
      setEditLabel("");
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteCourt = async (courtId: string, label: string) => {
    if (!confirm(`Delete "${label}"? This will also remove its game history.`)) return;
    try {
      await api.delete(`/api/courts/${courtId}`);
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const toggleBookable = async (court: Court) => {
    if (togglingId) return;
    setTogglingId(court.id);
    try {
      await api.patch(`/api/courts/${court.id}`, { isBookable: !court.isBookable });
      await onRefresh();
    } catch (err) { alert((err as Error).message); }
    finally { setTogglingId(null); }
  };

  const assignGroup = async (courtId: string, groupId: string | null) => {
    setAssigningGroupId(courtId);
    try {
      await api.patch(`/api/courts/${courtId}`, { pricingGroupId: groupId });
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setAssigningGroupId(null); }
  };

  const startEdit = (court: Court) => {
    setEditingId(court.id);
    setEditLabel(court.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  const bookableDotColor = (isBookable: boolean) =>
    isBookable ? "bg-green-500" : "bg-neutral-500";

  const statusColor = (s: string) => {
    if (s === "active") return "bg-green-500";
    if (s === "maintenance") return "bg-neutral-500";
    return "bg-neutral-600";
  };

  const toggleCls = (on: boolean) => cn(
    "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50",
    on ? "bg-purple-600" : "bg-neutral-600"
  );
  const knobCls = (on: boolean) => cn(
    "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
    on ? "translate-x-3" : "translate-x-0"
  );

  const hasPricingGroups = pricingGroups.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          {t("bookings.courts")}
        </h4>
        <span className="text-xs text-neutral-600">
          {courts.length} {courts.length !== 1 ? t("bookings.courtsPlural") : t("bookings.court")}
        </span>
      </div>

      {courts.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-neutral-800 py-8 text-center">
          <p className="text-sm text-neutral-500">No courts yet.</p>
          <p className="text-xs text-neutral-600 mt-1">Add your first court below.</p>
        </div>
      )}

      <div
        className={cn(
          "grid",
          showBookable
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2",
        )}
      >
        {courts.map((court) => {
          const groupColor = getPricingGroupColor(pricingGroups, court.pricingGroupId);

          return (
            <div
              key={court.id}
              className={cn(
                "group relative rounded-xl border overflow-hidden transition-all",
                showBookable
                  ? cn(
                      "border-neutral-700/60 bg-neutral-900/60",
                      court.isBookable ? "hover:border-neutral-600" : "opacity-80",
                    )
                  : cn(
                      "border-2 bg-gradient-to-b from-neutral-800/80 to-neutral-900/80",
                      court.isBookable
                        ? "border-neutral-700/60 hover:border-purple-600/40"
                        : "border-neutral-800/60 opacity-75 hover:border-neutral-600/40",
                    ),
              )}
            >
              {!showBookable && (
                <>
                  <div className="absolute inset-2 rounded-lg border border-neutral-700/30 pointer-events-none" />
                  <div className="absolute inset-[18px] border-t border-neutral-700/20 top-1/2 pointer-events-none" />
                </>
              )}

              {editingId === court.id ? (
                <div className="relative z-10 p-3 space-y-2">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full rounded-lg border border-purple-500 bg-neutral-800 px-2.5 py-1.5 text-sm text-white text-center focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameCourt(court.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <div className="flex justify-center gap-1.5">
                    <button
                      onClick={() => renameCourt(court.id)}
                      disabled={!editLabel.trim()}
                      className="rounded-lg bg-green-600/20 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 disabled:opacity-40"
                    >Save</button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-lg bg-neutral-700/50 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
                    >Cancel</button>
                  </div>
                </div>
              ) : showBookable ? (
                <div className="relative z-10 p-3 space-y-3">
                  <div className="flex items-center gap-2 min-w-0 border-b border-neutral-800 pb-2.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        bookableDotColor(court.isBookable),
                      )}
                    />
                    <h5 className="text-sm font-semibold text-white truncate flex-1 min-w-0">
                      {court.label}
                    </h5>
                    <button
                      type="button"
                      onClick={() => startEdit(court)}
                      className="shrink-0 rounded p-1 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                      title={t("common.rename", "Rename")}
                      aria-label={`${t("common.rename", "Rename")} ${court.label}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor={`bookable-${court.id}`}
                        className="text-xs font-medium text-neutral-400 shrink-0"
                      >
                        {t("bookings.bookable")}
                      </label>
                      <button
                        id={`bookable-${court.id}`}
                        type="button"
                        role="switch"
                        aria-checked={court.isBookable}
                        aria-label={`${court.label} — ${t("bookings.bookable")}`}
                        disabled={togglingId === court.id}
                        onClick={() => toggleBookable(court)}
                        className={toggleCls(court.isBookable)}
                      >
                        <span className={knobCls(court.isBookable)} />
                      </button>
                    </div>

                    {hasPricingGroups && (
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`pricing-group-${court.id}`}
                          className="text-xs font-medium text-neutral-400 shrink-0"
                        >
                          {t("bookings.pricingGroup", "Pricing group")}
                        </label>
                        <select
                          id={`pricing-group-${court.id}`}
                          value={court.pricingGroupId ?? ""}
                          onChange={(e) => assignGroup(court.id, e.target.value || null)}
                          disabled={assigningGroupId === court.id}
                          className={cn(
                            "min-w-0 flex-1 max-w-[58%] rounded-lg border px-2 py-1 text-xs focus:outline-none disabled:opacity-60",
                            groupColor
                              ? cn(groupColor.bg, groupColor.text, groupColor.border)
                              : "border-neutral-700 bg-neutral-800 text-white focus:border-purple-500",
                          )}
                        >
                          <option value="">{t("bookings.noGroupOption", "— no group —")}</option>
                          {pricingGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                              {g.isDefault ? t("bookings.defaultGroupSuffix", " (default)") : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative z-10 p-3 flex flex-col items-center gap-2 min-h-[100px]">
                  <div className="flex items-start justify-center gap-1.5 w-full px-1">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full shrink-0",
                        statusColor(court.status),
                      )}
                    />
                    <span className="text-sm font-bold text-white text-center break-words leading-tight">
                      {court.label}
                    </span>
                  </div>

                  {!readOnly && (
                    <div className="absolute top-1.5 right-1.5 hidden gap-0.5 group-hover:flex">
                      <button
                        onClick={() => startEdit(court)}
                        className="rounded-md p-1 bg-neutral-900/80 text-neutral-400 hover:text-white transition-colors"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deleteCourt(court.id, court.label)}
                        className="rounded-md p-1 bg-neutral-900/80 text-neutral-400 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!readOnly && (
          <div className="rounded-xl border-2 border-dashed border-neutral-700/40 bg-neutral-900/30 p-3 flex flex-col items-center justify-center gap-2 min-h-[100px]">
            <input
              type="text"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Court name"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white text-center placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && addCourt()}
            />
            <button
              onClick={addCourt}
              disabled={adding || !addLabel.trim()}
              className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Court
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
