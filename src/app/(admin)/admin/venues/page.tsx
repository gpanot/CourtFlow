"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
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
  Monitor,
  Upload,
  ImageIcon,
} from "lucide-react";
import { CourtsManager, type Court } from "@/components/admin/CourtsManager";
import { resolveTvLocale, tvI18n, type TvLocale } from "@/i18n/tv-i18n";
import {
  WARMUP_MINUTES_OPTIONS,
  normalizeWarmupMinutes,
  type WarmupMinutesOption,
} from "@/lib/warmup-settings";

interface VenueSettings {
  logoSpin?: boolean;
  tvLocale?: string;
  warmupMinutes?: number;
  [key: string]: unknown;
}

interface Venue {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
  logoUrl: string | null;
  tvText: string | null;
  settings: VenueSettings;
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
          <div className="border-t border-neutral-800 p-3 md:p-4 space-y-6">
            <CourtsManager
              venueId={venue.id}
              courts={venue.courts}
              onRefresh={onRefresh}
            />
            <TVDisplaySettings
              venueId={venue.id}
              venueName={venue.name}
              logoUrl={venue.logoUrl}
              tvText={venue.tvText}
              settings={venue.settings}
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

function TVDisplaySettings({
  venueId,
  venueName,
  logoUrl,
  tvText,
  settings,
  onRefresh,
}: {
  venueId: string;
  venueName: string;
  logoUrl: string | null;
  tvText: string | null;
  settings: VenueSettings;
  onRefresh: () => void;
}) {
  const [text, setText] = useState(tvText || "");
  const [spin, setSpin] = useState(!!settings.logoSpin);
  const [savingText, setSavingText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textDirty = text !== (tvText || "");

  useEffect(() => { setSpin(!!settings.logoSpin); }, [settings.logoSpin]);
  useEffect(() => { setText(tvText || ""); }, [tvText]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const token = useSessionStore.getState().token;
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/venues/${venueId}/logo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setRemovingLogo(true);
    try {
      const token = useSessionStore.getState().token;
      const res = await fetch(`/api/venues/${venueId}/logo`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRemovingLogo(false);
    }
  };

  const saveText = async () => {
    setSavingText(true);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        tvText: text.trim() || null,
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingText(false);
    }
  };

  const toggleSpin = async (checked: boolean) => {
    setSpin(checked);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        settings: { ...settings, logoSpin: checked },
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
      setSpin(!checked);
    }
  };

  const tvLocale = resolveTvLocale(settings.tvLocale);
  const previewT = tvI18n.getFixedT(tvLocale);

  const setDisplayLanguage = async (loc: TvLocale) => {
    try {
      await api.patch(`/api/venues/${venueId}`, {
        settings: { ...settings, tvLocale: loc },
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const warmupMinutes = normalizeWarmupMinutes(settings.warmupMinutes);

  const setWarmupMinutes = async (minutes: WarmupMinutesOption) => {
    try {
      await api.patch(`/api/venues/${venueId}`, {
        settings: { ...settings, warmupMinutes: minutes },
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const previewText = text || tvText || "";
  const previewLines = previewText ? previewText.split("\n").slice(0, 4) : [];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
          <Monitor className="h-4 w-4" /> TV Display
        </h4>
        <p className="text-xs text-neutral-600 mt-0.5 ml-6">Waiting Screen</p>
      </div>

      <div className="flex gap-4">
        {/* Left: Controls */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Logo upload */}
          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Venue Logo</label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="relative h-14 w-14 shrink-0 rounded-full border border-neutral-700 bg-neutral-800 flex items-center justify-center overflow-hidden">
                  <img src={logoUrl} alt="Venue logo" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-full border border-dashed border-neutral-700 bg-neutral-800/50 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-neutral-600" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading..." : logoUrl ? "Replace Logo" : "Upload Logo"}
                </button>
                {logoUrl && (
                  <button
                    onClick={removeLogo}
                    disabled={removingLogo}
                    className="text-xs text-neutral-500 hover:text-red-400 text-left disabled:opacity-40"
                  >
                    {removingLogo ? "Removing..." : "Remove logo"}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-neutral-600">PNG, JPEG, WebP, or SVG. Max 5 MB.</p>
          </div>

          {/* Spin toggle */}
          {logoUrl && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spin}
                onChange={(e) => toggleSpin(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
              />
              <span className="text-xs text-neutral-400">Rotate logo 360° on TV</span>
            </label>
          )}

          <div className="space-y-2">
            <label className="text-xs text-neutral-500">TV display language</label>
            <div className="inline-flex rounded-lg border border-neutral-700 p-0.5 bg-neutral-900/80">
              <button
                type="button"
                onClick={() => setDisplayLanguage("en")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tvLocale === "en"
                    ? "bg-purple-600 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                )}
                title="English"
              >
                <span className="text-base leading-none" aria-hidden>
                  🇬🇧
                </span>
                English
              </button>
              <button
                type="button"
                onClick={() => setDisplayLanguage("vi")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tvLocale === "vi"
                    ? "bg-purple-600 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                )}
                title="Tiếng Việt"
              >
                <span className="text-base leading-none" aria-hidden>
                  🇻🇳
                </span>
                Tiếng Việt
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              On-screen text on <code className="text-neutral-500">/tv</code> uses this language. Custom lines above stay as you type them.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Warmup length (when a session is in warmup)</label>
            <div className="inline-flex rounded-lg border border-neutral-700 p-0.5 bg-neutral-900/80">
              {WARMUP_MINUTES_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setWarmupMinutes(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors min-w-[2.75rem]",
                    warmupMinutes === m
                      ? "bg-purple-600 text-white"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-600">
              Countdown on the TV display and when games auto-start after four players are on a warmup court.
            </p>
          </div>

          {/* TV Text */}
          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Custom Text (1–4 lines)</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={"e.g.\nWelcome to ACE SQUAD\nThe Granary\nSessions every Wednesday 7pm"}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none"
            />
            {textDirty && (
              <button
                onClick={saveText}
                disabled={savingText}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40"
              >
                {savingText ? "Saving..." : "Save Text"}
              </button>
            )}
          </div>
        </div>

        {/* Right: Live preview */}
        <div className="shrink-0 w-56 md:w-64">
          <p className="text-xs text-neutral-600 mb-1.5 text-center">Preview</p>
          <div className="rounded-xl border border-neutral-800 bg-black aspect-video flex flex-col items-center justify-center gap-2.5 p-3 overflow-hidden">
            {logoUrl ? (
              <div className={cn(
                "h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full overflow-hidden border border-neutral-700 bg-neutral-900",
                spin && "animate-flip-y"
              )}>
                <img src={logoUrl} alt="Preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full border border-dashed border-neutral-700 bg-neutral-900 flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-neutral-700" />
              </div>
            )}
            {previewLines.length > 0 && (
              <div className="text-center space-y-0.5 max-w-full">
                {previewLines.map((line, i) => (
                  <p key={i} className={cn(
                    "truncate text-neutral-500",
                    i === 0 ? "text-[10px] font-semibold text-neutral-400" : "text-[8px]"
                  )}>{line}</p>
                ))}
              </div>
            )}
            <p className="text-[8px] text-neutral-700 mt-0.5">{previewT("waitingSessionStart")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
