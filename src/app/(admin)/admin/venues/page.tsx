"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
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
import { CourtsManager, type Court } from "@/components/admin/CourtsManager";

export const dynamic = "force-dynamic";
interface VenueSettings {
  logoSpin?: boolean;
  tvLocale?: string;
  [key: string]: unknown;
}

interface Venue {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
  portalEnabled: boolean;
  contactPhone: string | null;
  logoUrl: string | null;
  tvText: string | null;
  settings: VenueSettings;
  courts: Court[];
  sessions: { id: string; status: string }[];
  owner: { id: string; name: string } | null;
  _count: { staff: number };
}

export default function VenuesPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const { role } = useSessionStore();
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
        <h2 className="text-xl font-bold md:text-2xl">{t("venues.title")}</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 md:px-4"
        >
          <Plus className="h-4 w-4" /> {t("venues.addVenue")}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <input
            type="text"
            placeholder={t("venues.venueName")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && createVenue()}
          />
          <input
            type="text"
            placeholder={t("venues.location")}
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
              {t("venues.createVenue")}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setNewLocation("");
              }}
              className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white"
            >
              {t("venues.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {venues.map((venue) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            role={role}
            expanded={expandedVenueId === venue.id}
            onToggle={() =>
              setExpandedVenueId(expandedVenueId === venue.id ? null : venue.id)
            }
            onRefresh={fetchVenues}
          />
        ))}
        {venues.length === 0 && (
          <p className="py-12 text-center text-neutral-500">
            {t("venues.noVenuesYet")}
          </p>
        )}
      </div>
    </div>
  );
}

function VenueCard({
  venue,
  role,
  expanded,
  onToggle,
  onRefresh,
}: {
  venue: Venue;
  role: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(venue.name);
  const [editLocation, setEditLocation] = useState(venue.location || "");
  const [editContactPhone, setEditContactPhone] = useState(venue.contactPhone || "");
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
        contactPhone: editContactPhone.trim() || null,
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
    setEditContactPhone(venue.contactPhone || "");
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
              <input
                type="tel"
                value={editContactPhone}
                onChange={(e) => setEditContactPhone(e.target.value)}
                placeholder="Contact Phone (e.g. +84 123 456 789)"
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
                  {saving ? t("venues.saving") : t("venues.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-lg bg-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-600"
                >
                  {t("venues.cancel")}
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
                      {t("venues.live")}
                    </span>
                  )}
                  {venue.portalEnabled && (
                    <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                      Player Portal
                    </span>
                  )}
                </div>
                {venue.location && (
                  <p className="flex items-center gap-1 text-xs text-neutral-400 md:text-sm">
                    <MapPin className="h-3 w-3 shrink-0" /> {venue.location}
                  </p>
                )}
                {venue.contactPhone && (
                  <p className="flex items-center gap-1 text-xs text-neutral-400 md:text-sm">
                    📞 {venue.contactPhone}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                  <span>{venue.courts.length} {t("venues.courts")}</span>
                  <span>{venue._count.staff} {t("venues.staff")}</span>
                  {venue.owner && (
                    <span className="text-purple-400">{t("venues.owner")}: {venue.owner.name}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  title={t("venues.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteStep(1)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-red-900/40 hover:text-red-400"
                  title={t("venues.deleteVenue")}
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
            <PortalToggle
              venueId={venue.id}
              enabled={venue.portalEnabled}
              onRefresh={onRefresh}
            />
            {role === "superadmin" && (
              <VenueOwnerSelect
                venueId={venue.id}
                currentOwner={venue.owner}
                onRefresh={onRefresh}
              />
            )}
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
                  <h3 className="text-lg font-bold">{t("venues.deleteConfirmTitle", { name: venue.name })}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("venues.deleteConfirmBody")}
                    {hasActiveSession && (
                      <span className="mt-1 block font-medium text-amber-400">
                        {t("venues.deleteActiveSession")}
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
                    {t("venues.yesDelete")}
                  </button>
                  <button
                    onClick={() => setDeleteStep(0)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("venues.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">{t("venues.cannotBeUndone")}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("venues.cannotBeUndoneBody", { name: venue.name, courts: venue.courts.length })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? t("venues.deleting") : t("venues.permanentlyDelete")}
                  </button>
                  <button
                    onClick={() => setDeleteStep(0)}
                    disabled={deleting}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {t("venues.cancel")}
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


function PortalToggle({
  venueId,
  enabled,
  onRefresh,
}: {
  venueId: string;
  enabled: boolean;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/venues/${venueId}`, { portalEnabled: !enabled });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
        Player Booking Portal
      </h4>
      <label className="flex items-center gap-3 cursor-pointer">
        <button
          onClick={toggle}
          disabled={saving}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-green-600" : "bg-neutral-700"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white transition-transform",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
        <span className="text-sm text-neutral-300">
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </label>
      <p className="text-xs text-neutral-600">
        When enabled, players can book courts and coaches at this venue via the web portal.
      </p>
    </div>
  );
}

interface ManagerOption {
  id: string;
  name: string;
  phone: string;
}

function VenueOwnerSelect({
  venueId,
  currentOwner,
  onRefresh,
}: {
  venueId: string;
  currentOwner: { id: string; name: string } | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedId, setSelectedId] = useState(currentOwner?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ id: string; name: string; phone: string; role: string }[]>("/api/admin/staff")
      .then((staff) => {
        setManagers(staff.filter((s) => s.role === "manager" || s.role === "superadmin"));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedId(currentOwner?.id ?? "");
  }, [currentOwner]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        ownerId: selectedId || null,
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dirty = selectedId !== (currentOwner?.id ?? "");

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
        {t("venues.venueOwner")}
      </h4>
      <div className="flex items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="">{t("venues.noOwner")}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.phone})
            </option>
          ))}
        </select>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? t("venues.saving") : t("venues.saveOwner")}
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-600">
        {t("venues.ownerHint")}
      </p>
    </div>
  );
}
