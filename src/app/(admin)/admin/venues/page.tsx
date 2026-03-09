"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

interface Court {
  id: string;
  label: string;
  status: string;
}

interface Venue {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
  courts: Court[];
  sessions: { id: string; status: string }[];
  _count: { staff: number };
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [expandedVenueId, setExpandedVenueId] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setVenues(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const createVenue = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/api/admin/venues", {
        name: newName.trim(),
        location: newLocation.trim() || undefined,
      });
      setShowCreate(false);
      setNewName("");
      setNewLocation("");
      await fetchVenues();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Venues</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 md:px-4"
        >
          <Plus className="h-4 w-4" /> Add Venue
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <input
            type="text"
            placeholder="Venue name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && createVenue()}
          />
          <input
            type="text"
            placeholder="Location (optional)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && createVenue()}
          />
          <div className="flex gap-2">
            <button
              onClick={createVenue}
              disabled={!newName.trim()}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Create Venue
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setNewLocation("");
              }}
              className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {venues.map((venue) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            expanded={expandedVenueId === venue.id}
            onToggle={() =>
              setExpandedVenueId(expandedVenueId === venue.id ? null : venue.id)
            }
            onRefresh={fetchVenues}
          />
        ))}
        {venues.length === 0 && (
          <p className="py-12 text-center text-neutral-500">
            No venues yet. Create one to get started.
          </p>
        )}
      </div>
    </div>
  );
}

function VenueCard({
  venue,
  expanded,
  onToggle,
  onRefresh,
}: {
  venue: Venue;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(venue.name);
  const [editLocation, setEditLocation] = useState(venue.location || "");
  const [saving, setSaving] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);

  const saveVenue = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/api/venues/${venue.id}`, {
        name: editName.trim(),
        location: editLocation.trim() || null,
      });
      setEditing(false);
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditName(venue.name);
    setEditLocation(venue.location || "");
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/venues/${venue.id}`);
      setDeleteStep(0);
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveSession = venue.sessions.length > 0;

  return (
    <>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <div className="p-3 md:p-4">
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-white focus:border-purple-500 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveVenue();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Location"
                className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveVenue();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={saveVenue}
                  disabled={saving || !editName.trim()}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-lg bg-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <button
                onClick={onToggle}
                className="mt-0.5 text-neutral-400 hover:text-white shrink-0"
              >
                {expanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold md:text-lg">{venue.name}</h3>
                  {hasActiveSession && (
                    <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-xs font-medium text-green-400">
                      Live
                    </span>
                  )}
                </div>
                {venue.location && (
                  <p className="flex items-center gap-1 text-xs text-neutral-400 md:text-sm">
                    <MapPin className="h-3 w-3 shrink-0" /> {venue.location}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                  <span>{venue.courts.length} courts</span>
                  <span>{venue._count.staff} staff</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteStep(1)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-red-900/40 hover:text-red-400"
                  title="Delete venue"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {expanded && (
          <div className="border-t border-neutral-800 p-3 md:p-4">
            <CourtsManager
              venueId={venue.id}
              courts={venue.courts}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>

      {deleteStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setDeleteStep(0); }}>
          <div
            className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {deleteStep === 1 ? (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">Delete {venue.name}?</h3>
                  <p className="text-sm text-neutral-400">
                    This will permanently delete the venue, all its courts, sessions, and game history.
                    {hasActiveSession && (
                      <span className="mt-1 block font-medium text-amber-400">
                        This venue has an active session. Close it first.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteStep(2)}
                    disabled={hasActiveSession}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    Yes, delete it
                  </button>
                  <button
                    onClick={() => setDeleteStep(0)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">This cannot be undone</h3>
                  <p className="text-sm text-neutral-400">
                    All data for <span className="font-semibold text-neutral-200">{venue.name}</span> will be permanently deleted, including{" "}
                    <span className="text-neutral-200">{venue.courts.length} courts</span> and all session history.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Permanently Delete"}
                  </button>
                  <button
                    onClick={() => setDeleteStep(0)}
                    disabled={deleting}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CourtsManager({
  venueId,
  courts,
  onRefresh,
}: {
  venueId: string;
  courts: Court[];
  onRefresh: () => void;
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

  const startEdit = (court: Court) => {
    setEditingId(court.id);
    setEditLabel(court.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
        Courts
      </h4>

      {courts.length === 0 && (
        <p className="text-sm text-neutral-500">No courts yet. Add one below.</p>
      )}

      <div className="space-y-1.5">
        {courts.map((court) => (
          <div
            key={court.id}
            className="flex items-center gap-2 rounded-lg bg-neutral-800/60 px-3 py-2"
          >
            {editingId === court.id ? (
              <>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="flex-1 min-w-0 rounded border border-neutral-600 bg-neutral-700 px-2 py-1 text-sm text-white focus:border-purple-500 focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameCourt(court.id);
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <button
                  onClick={() => renameCourt(court.id)}
                  disabled={!editLabel.trim()}
                  className="rounded p-1.5 text-green-400 hover:bg-neutral-700 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{court.label}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs capitalize shrink-0",
                    court.status === "idle" && "bg-neutral-700 text-neutral-400",
                    court.status === "active" && "bg-green-700/30 text-green-400",
                    court.status === "maintenance" && "bg-red-700/30 text-red-400"
                  )}
                >
                  {court.status}
                </span>
                <button
                  onClick={() => startEdit(court)}
                  className="rounded p-1.5 text-neutral-500 hover:bg-neutral-700 hover:text-white shrink-0"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteCourt(court.id, court.label)}
                  className="rounded p-1.5 text-neutral-500 hover:bg-red-900/40 hover:text-red-400 shrink-0"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          placeholder="New court label (e.g. Court G)"
          className="flex-1 min-w-0 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && addCourt()}
        />
        <button
          onClick={addCourt}
          disabled={adding || !addLabel.trim()}
          className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 shrink-0"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}
