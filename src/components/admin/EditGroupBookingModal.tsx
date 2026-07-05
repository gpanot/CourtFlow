"use client";

/**
 * EditGroupBookingModal — modal for editing a multi-court group booking.
 *
 * Supports:
 *  - Changing date, start time, and duration (applied to all courts in the group)
 *  - Adding or removing courts from the group
 *  - Changing the assigned player
 *  - Saving via PATCH /api/staff/bookings/batch/:groupId
 *  - Cancelling the whole group via DELETE /api/staff/bookings/batch/:groupId
 */

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { X, Save, Trash2, PlusCircle, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";

interface GroupBooking {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPriceValue: number;
  status: string;
  playerId: string;
  player: { id: string; name: string; phone: string };
  bookings: {
    id: string;
    courtId: string;
    courtLabel: string;
    priceValue: number;
    status: string;
  }[];
}

interface Court {
  id: string;
  label: string;
}

export interface EditGroupBookingModalProps {
  groupId: string;
  venueId: string;
  /** All bookable courts for the venue (to show add-court picker) */
  courts: Court[];
  onClose: () => void;
  onSaved: () => void;
}

function fmtPrice(v: number) {
  return new Intl.NumberFormat("vi-VN").format(v);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function EditGroupBookingModal({
  groupId,
  venueId,
  courts,
  onClose,
  onSaved,
}: EditGroupBookingModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });

  const [group, setGroup] = useState<GroupBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Editable fields
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [slotCount, setSlotCount] = useState(6); // default 3h
  const [courtIds, setCourtIds] = useState<string[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/api/staff/bookings/groups/${groupId}`) as GroupBooking;
        setGroup(data);
        setDate(data.date.split("T")[0]);
        // datetime-local input needs local-time "YYYY-MM-DDTHH:MM", not UTC ISO
        const dt = new Date(data.startTime);
        const pad = (n: number) => String(n).padStart(2, "0");
        const localDT = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
        setStartTime(localDT);
        const ms = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
        setSlotCount(Math.round(ms / (30 * 60 * 1000)));
        setCourtIds(data.bookings.map((b) => b.courtId));
        setPlayerId(data.playerId);
        setSelectedPlayer(data.player);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  const searchPlayers = async (q: string) => {
    if (q.length < 2) { setPlayerResults([]); return; }
    try {
      const res = await api.get(`/api/staff/players?q=${encodeURIComponent(q)}&venueId=${venueId}`) as { players: { id: string; name: string; phone: string }[] };
      setPlayerResults(res.players ?? []);
    } catch { /* ignore */ }
  };

  const removeCourt = (cid: string) => {
    if (courtIds.length <= 2) { setErr("A group booking requires at least 2 courts"); return; }
    setCourtIds(courtIds.filter((c) => c !== cid));
  };

  const addCourt = (cid: string) => {
    if (courtIds.includes(cid)) return;
    setCourtIds([...courtIds, cid]);
  };

  const save = async () => {
    if (!group) return;
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/staff/bookings/batch/${groupId}`, {
        date,
        startTime: new Date(startTime).toISOString(),
        slotCount,
        courtIds,
        playerId: selectedPlayer?.id ?? playerId,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelGroup = async () => {
    if (!confirm("Cancel this entire group booking? This cannot be undone.")) return;
    setSaving(true);
    try {
      await api.delete(`/api/staff/bookings/batch/${groupId}`);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const availableCourtsToAdd = courts.filter((c) => !courtIds.includes(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-white">Edit Group Booking</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {err && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {err}
              </div>
            )}

            {/* Date + Time + Duration */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Start time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Duration</label>
                <select
                  value={slotCount}
                  onChange={(e) => setSlotCount(Number(e.target.value))}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                >
                  {[2, 3, 4, 6, 8, 12, 16].map((n) => (
                    <option key={n} value={n}>{n * 30} min ({n * 30 / 60}h)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Courts in group */}
            <div>
              <label className="text-[10px] text-neutral-500 block mb-1.5">Courts in group</label>
              <div className="space-y-1.5">
                {courtIds.map((cid) => {
                  const courtLabel = group?.bookings.find((b) => b.courtId === cid)?.courtLabel
                    ?? courts.find((c) => c.id === cid)?.label
                    ?? cid;
                  const priceValue = group?.bookings.find((b) => b.courtId === cid)?.priceValue;
                  return (
                    <div key={cid} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-800/50 px-3 py-2">
                      <div>
                        <span className="text-xs text-white font-medium">{courtLabel}</span>
                        {priceValue !== undefined && (
                          <span className="ml-2 text-[10px] text-neutral-400">{fmtPrice(priceValue)} VND</span>
                        )}
                      </div>
                      <button
                        onClick={() => removeCourt(cid)}
                        className="text-neutral-500 hover:text-red-400 transition-colors"
                        title="Remove court from group"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add court picker */}
              {availableCourtsToAdd.length > 0 && (
                <div className="mt-2">
                  <label className="text-[10px] text-neutral-500 block mb-1">Add court</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {availableCourtsToAdd.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addCourt(c.id)}
                        className="flex items-center gap-1 rounded-full border border-purple-600/50 bg-purple-600/10 px-2 py-1 text-[11px] text-purple-300 hover:bg-purple-600/20 transition-colors"
                      >
                        <PlusCircle className="h-3 w-3" />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Player */}
            <div>
              <label className="text-[10px] text-neutral-500 block mb-1">Player</label>
              {selectedPlayer ? (
                <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
                  <span className="text-xs text-white">{selectedPlayer.name}</span>
                  <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }} className="text-neutral-500 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => { setPlayerSearch(e.target.value); searchPlayers(e.target.value); }}
                    placeholder="Search player by name or phone…"
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-purple-500 focus:outline-none"
                  />
                  {playerResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl max-h-40 overflow-y-auto">
                      {playerResults.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 text-white"
                          onClick={() => { setSelectedPlayer(p); setPlayerResults([]); setPlayerSearch(""); }}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-neutral-500">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Total */}
            {group && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs text-neutral-400">Total ({courtIds.length} courts)</span>
                  {courtIds.length !== group.bookings.length && (
                    <span className="ml-2 text-[10px] text-amber-400">recalculated on save</span>
                  )}
                </div>
                <span className="text-sm font-semibold text-white">{fmtPrice(group.totalPriceValue)} VND</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={cancelGroup}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancel entire booking
              </button>
              <button
                onClick={save}
                disabled={saving || courtIds.length < 2}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-40",
                  saving ? "bg-neutral-700" : "bg-purple-600 hover:bg-purple-500"
                )}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
