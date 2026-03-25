"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Plus, Pencil, Trash2 } from "lucide-react";

export interface Court {
  id: string;
  label: string;
  status: string;
  isBookable: boolean;
}

export function CourtsManager({
  venueId,
  courts,
  onRefresh,
  showBookable = false,
  readOnly = false,
}: {
  venueId: string;
  courts: Court[];
  onRefresh: () => void;
  showBookable?: boolean;
  readOnly?: boolean;
}) {
  const [addLabel, setAddLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

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
    if (!confirm(`Delete "${label}"? This will also remove its game history.`))
      return;
    try {
      await api.delete(`/api/courts/${courtId}`);
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const toggleBookable = async (court: Court) => {
    try {
      await api.patch(`/api/courts/${court.id}`, { isBookable: !court.isBookable });
      await onRefresh();
    } catch (err) { alert((err as Error).message); }
  };

  const startEdit = (court: Court) => {
    setEditingId(court.id);
    setEditLabel(court.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  const statusColor = (s: string) => {
    if (s === "active") return "bg-green-500";
    if (s === "maintenance") return "bg-neutral-500";
    return "bg-neutral-600";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Courts
        </h4>
        <span className="text-xs text-neutral-600">{courts.length} court{courts.length !== 1 ? "s" : ""}</span>
      </div>

      {courts.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-neutral-800 py-8 text-center">
          <p className="text-sm text-neutral-500">No courts yet.</p>
          <p className="text-xs text-neutral-600 mt-1">Add your first court below.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {courts.map((court) => (
          <div
            key={court.id}
            className="group relative min-h-[100px] rounded-xl border-2 border-neutral-700/60 bg-gradient-to-b from-neutral-800/80 to-neutral-900/80 overflow-hidden transition-all hover:border-purple-600/40"
          >
            {/* Court surface pattern */}
            <div className="absolute inset-2 rounded-lg border border-neutral-700/30 pointer-events-none" />
            <div className="absolute inset-[18px] border-t border-neutral-700/20 top-1/2 pointer-events-none" />

            {!readOnly && editingId === court.id ? (
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
            ) : (
              <div className="relative z-10 p-4 flex flex-col items-center justify-center gap-2 h-full">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", statusColor(court.status))} />
                  <span className="text-sm font-bold text-white truncate max-w-[80px]">{court.label}</span>
                </div>

                <span className="text-[10px] uppercase tracking-wider text-neutral-500 capitalize">{court.status}</span>

                {showBookable && (
                  <button
                    onClick={() => toggleBookable(court)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                      court.isBookable
                        ? "bg-purple-600/25 text-purple-300 hover:bg-purple-600/40"
                        : "bg-neutral-700/50 text-neutral-500 hover:bg-neutral-700"
                    )}
                  >
                    {court.isBookable ? "Bookable" : "Not Bookable"}
                  </button>
                )}

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
        ))}

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
