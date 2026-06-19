"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Plus, CheckCircle2, Trash2, Link as LinkIcon, X, AlertTriangle } from "lucide-react";

const COUNTRIES = [
  { code: "VN", name: "Vietnam",   flag: "🇻🇳" },
  { code: "TH", name: "Thailand",  flag: "🇹🇭" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia",  flag: "🇲🇾" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "FR", name: "France",    flag: "🇫🇷" },
  { code: "ES", name: "Spain",     flag: "🇪🇸" },
  { code: "DE", name: "Germany",   flag: "🇩🇪" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
];

const COUNTRY_CURRENCY: Record<string, string> = {
  VN: "VND", TH: "THB", SG: "SGD", MY: "MYR",
  PH: "PHP", FR: "EUR", ES: "EUR", DE: "EUR",
  AU: "AUD", NZ: "NZD",
};

const PAYMENT_REGION_MAP: Record<string, string> = {
  VN: "SEA", TH: "SEA", SG: "SEA", MY: "SEA", PH: "SEA",
  FR: "EU",  ES: "EU",  DE: "EU",
  AU: "ANZ", NZ: "ANZ",
};

function flagFor(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.flag ?? "";
}

function regionFor(country: string): string {
  return PAYMENT_REGION_MAP[country] ?? "OTHER";
}

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  paymentRegion: string;
  createdAt: string;
  _count: { venues: number };
}

interface OrgDetail extends OrgSummary {
  venues: { id: string; name: string; sportType: string; location: string | null }[];
  managers: { id: string; name: string; email: string | null }[];
}

interface VenueSummary {
  id: string;
  name: string;
  sportType: string;
  organizationId: string | null;
}

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";
const selectClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none";

export default function OrganizationsPage() {
  const router = useRouter();
  const { role } = useSessionStore();

  useEffect(() => {
    if (role && role !== "superadmin") router.replace("/admin");
  }, [role, router]);

  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [allVenues, setAllVenues] = useState<VenueSummary[]>([]);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newCurrency, setNewCurrency] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Detail panel edit
  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Link venue
  const [linkVenueId, setLinkVenueId] = useState("");
  const [linking, setLinking] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      const data = await api.get<OrgSummary[]>("/api/admin/organizations");
      setOrgs(data);
    } catch { /* ignore */ }
  }, []);

  const fetchAllVenues = useCallback(async () => {
    try {
      const data = await api.get<VenueSummary[]>("/api/admin/venues");
      setAllVenues(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchOrgs();
    void fetchAllVenues();
  }, [fetchOrgs, fetchAllVenues]);

  const fetchOrgDetail = useCallback(async (id: string) => {
    try {
      const data = await api.get<OrgDetail>(`/api/admin/organizations/${id}`);
      setOrgDetail(data);
      setEditName(data.name);
      setEditCountry(data.country);
      setEditCurrency(data.currency);
      setSaveMsg(null);
      setLinkVenueId("");
      setDeleteConfirm(false);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (selectedOrgId) void fetchOrgDetail(selectedOrgId);
    else setOrgDetail(null);
  }, [selectedOrgId, fetchOrgDetail]);

  const hasEditChanges = useMemo(() => {
    if (!orgDetail) return false;
    return (
      editName.trim() !== orgDetail.name ||
      editCountry !== orgDetail.country ||
      editCurrency !== orgDetail.currency
    );
  }, [orgDetail, editName, editCountry, editCurrency]);

  const handleCreate = async () => {
    if (!newName.trim() || !newCountry) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const org = await api.post<OrgSummary>("/api/admin/organizations", {
        name: newName.trim(),
        country: newCountry,
        currency: newCurrency.trim() || COUNTRY_CURRENCY[newCountry] || "VND",
      });
      setShowCreate(false);
      setNewName(""); setNewCountry(""); setNewCurrency("");
      await fetchOrgs();
      setSelectedOrgId(org.id);
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!orgDetail || !editName.trim() || !editCountry) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.patch(`/api/admin/organizations/${orgDetail.id}`, {
        name: editName.trim(),
        country: editCountry,
        currency: editCurrency.trim() || undefined,
      });
      setSaveMsg({ type: "ok", text: "Saved" });
      await fetchOrgs();
      await fetchOrgDetail(orgDetail.id);
    } catch (e) {
      setSaveMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (venueId: string) => {
    if (!orgDetail) return;
    try {
      await api.delete(`/api/admin/organizations/${orgDetail.id}/venues`, { venueId });
      await fetchOrgDetail(orgDetail.id);
      await fetchOrgs();
      await fetchAllVenues();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleLink = async () => {
    if (!orgDetail || !linkVenueId) return;
    setLinking(true);
    try {
      await api.post(`/api/admin/organizations/${orgDetail.id}/venues`, { venueId: linkVenueId });
      setLinkVenueId("");
      await fetchOrgDetail(orgDetail.id);
      await fetchOrgs();
      await fetchAllVenues();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLinking(false);
    }
  };

  const handleDelete = async () => {
    if (!orgDetail) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/organizations/${orgDetail.id}`);
      setSelectedOrgId(null);
      setDeleteConfirm(false);
      await fetchOrgs();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const unlinkedVenues = allVenues.filter((v) => !v.organizationId);

  if (role && role !== "superadmin") return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold md:text-2xl">Organizations</h2>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left panel — org list */}
        <div className="lg:w-80 shrink-0 space-y-3">
          <button
            onClick={() => { setShowCreate(!showCreate); setCreateErr(null); }}
            className="flex w-full items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            <Plus className="h-4 w-4" /> New Organization
          </button>

          {showCreate && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
              <input
                type="text"
                placeholder="Organization name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={inputClass}
                autoFocus
              />
              <select
                value={newCountry}
                onChange={(e) => {
                  const code = e.target.value;
                  setNewCountry(code);
                  setNewCurrency(COUNTRY_CURRENCY[code] ?? "");
                }}
                className={selectClass}
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className={selectClass}
              >
                <option value="">Select currency</option>
                {Object.entries(COUNTRY_CURRENCY)
                  .filter(([, v], i, arr) => arr.findIndex(([, v2]) => v2 === v) === i)
                  .map(([, currency]) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
              </select>
              {createErr && <p className="text-xs text-red-400">{createErr}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || !newCountry}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); setNewCountry(""); setNewCurrency(""); setCreateErr(null); }}
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedOrgId === org.id
                    ? "border-purple-500 bg-purple-600/10"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                )}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-white truncate">{org.name}</span>
                  <span className="rounded-full bg-neutral-700/50 px-2 py-0.5 text-xs text-neutral-300 shrink-0">
                    {org.paymentRegion}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400 flex-wrap">
                  <span>{flagFor(org.country)} {org.country}</span>
                  <span>{org.currency}</span>
                  <span className="text-neutral-500">{org._count.venues} venue{org._count.venues !== 1 ? "s" : ""}</span>
                </div>
              </button>
            ))}
            {orgs.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">No organizations yet.</p>
            )}
          </div>
        </div>

        {/* Right panel — org detail */}
        {orgDetail ? (
          <div className="flex-1 min-w-0 space-y-4">
            {/* Editable fields */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-white">Edit Organization</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  <span>
                    <span className="rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-neutral-300">
                      {regionFor(editCountry || orgDetail.country)}
                    </span>
                  </span>
                  <span className="font-mono text-neutral-400">{orgDetail.slug}</span>
                  <span>{new Date(orgDetail.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Country</label>
                  <select
                    value={editCountry}
                    onChange={(e) => {
                      const code = e.target.value;
                      setEditCountry(code);
                      setEditCurrency(COUNTRY_CURRENCY[code] ?? editCurrency);
                    }}
                    className={selectClass}
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Currency</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select currency</option>
                    {Object.entries(COUNTRY_CURRENCY)
                      .filter(([, v], i, arr) => arr.findIndex(([, v2]) => v2 === v) === i)
                      .map(([, currency]) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                  </select>
                </div>
                {(hasEditChanges || saveMsg) && (
                  <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                    {hasEditChanges && (
                      <button
                        onClick={handleSave}
                        disabled={saving || !editName.trim() || !editCountry}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    )}
                    {saveMsg && (
                      <span className={cn("flex items-center gap-1 text-xs", saveMsg.type === "ok" ? "text-emerald-400" : "text-red-400")}>
                        {saveMsg.type === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {saveMsg.text}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Linked venues */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-white">Linked Venues</h3>

              {orgDetail.venues.length > 0 ? (
                <ul className="space-y-1">
                  {orgDetail.venues.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-800/50 px-2.5 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-white truncate">{v.name}</span>
                        <span className="rounded-full bg-neutral-700/50 px-2 py-0.5 text-xs text-neutral-300 capitalize shrink-0">
                          {v.sportType}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnlink(v.id)}
                        className="text-xs text-neutral-500 hover:text-red-400 shrink-0 flex items-center gap-1"
                        title="Unlink venue"
                      >
                        <X className="h-3.5 w-3.5" /> Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-neutral-500">No venues linked to this organization.</p>
              )}

              {unlinkedVenues.length > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-neutral-800">
                  <select
                    value={linkVenueId}
                    onChange={(e) => setLinkVenueId(e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select venue to link…</option>
                    {unlinkedVenues.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleLink}
                    disabled={linking || !linkVenueId}
                    className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 shrink-0"
                  >
                    <LinkIcon className="h-3.5 w-3.5" /> Link
                  </button>
                </div>
              )}
            </div>

            {/* Linked managers */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-white">Linked Managers</h3>
              {orgDetail.managers.length > 0 ? (
                <ul className="space-y-1">
                  {orgDetail.managers.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/50 px-2.5 py-1.5">
                      <span className="text-sm text-white">{m.name}</span>
                      {m.email && <span className="text-xs text-neutral-500">{m.email}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-neutral-500">No managers linked via this org&apos;s venues.</p>
              )}
            </div>

            {/* Delete org */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Danger Zone</h3>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  disabled={orgDetail._count.venues > 0}
                  title={orgDetail._count.venues > 0 ? "Unlink all venues first" : undefined}
                  className="flex items-center gap-2 rounded-lg border border-red-900/50 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" /> Delete Organization
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    This cannot be undone. Delete "{orgDetail.name}"?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {orgDetail._count.venues > 0 && (
                <p className="mt-2 text-xs text-neutral-600">Unlink all {orgDetail._count.venues} venue{orgDetail._count.venues !== 1 ? "s" : ""} before deleting.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-20 text-neutral-600 text-sm">
            Select an organization to view details.
          </div>
        )}
      </div>
    </div>
  );
}
