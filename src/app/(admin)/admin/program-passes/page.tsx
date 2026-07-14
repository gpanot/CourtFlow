"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  Search,
  DollarSign,
  AlertTriangle,
  Clock,
  CalendarCheck,
  Pause,
  RotateCcw,
  XCircle,
  Lock,
  X,
  Check,
} from "lucide-react";

export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  name: string;
}

interface PassTypeCoach {
  id: string;
  coach: Coach;
}

// Allowed pass mode values
const PASS_MODE_OPTIONS = [
  { value: "monthly",  label: "Monthly (calendar month)" },
  { value: "days_30",  label: "30 days" },
  { value: "days_45",  label: "45 days" },
  { value: "days_60",  label: "60 days" },
  { value: "days_90",  label: "90 days" },
  { value: "custom",   label: "Custom dates" },
] as const;

type PassMode = typeof PASS_MODE_OPTIONS[number]["value"];

function passModeLabel(mode: string): string {
  return PASS_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

interface PassType {
  id: string;
  venueId: string;
  name: string;
  price: number;
  sessionsIncluded: number;
  passMode: PassMode;
  isOneTime: boolean;
  isActive: boolean;
  coaches: PassTypeCoach[];
  _count: { programPasses: number };
}

interface ProgramPassPayment {
  id: string;
  amountValue: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  paymentMethod: string | null;
}

interface ProgramPass {
  id: string;
  playerId: string;
  venueId: string;
  passTypeId: string;
  status: "active" | "paused" | "expired" | "cancelled";
  sessionsUsed: number;
  cycleStart: string;
  cycleEnd: string;
  deferredStartDate: string | null;
  player: { id: string; name: string; phone: string; avatar: string };
  passType: {
    id: string;
    name: string;
    price: number;
    sessionsIncluded: number;
    passMode: PassMode;
    isOneTime: boolean;
    coaches: PassTypeCoach[];
  };
  latestPayment: ProgramPassPayment | null;
  currentPaymentStatus: string | null;
}

interface Kpi {
  collected: number;
  unpaidCount: number;
  overdueCount: number;
}

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  avatarPhotoPath?: string | null;
  facePhotoPath?: string | null;
}

interface ClassInstance {
  id: string;
  startAt: string;
  endAt: string;
  maxPlayers: number;
  coach: { id: string; name: string };
  passType: { id: string; name: string };
  _count: { checkIns: number };
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProgramPassesPage() {
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues: venueOptions,
  } = useAdminVenuePicker({ autoSelect: true });

  const [activeTab, setActiveTab] = useState<"passes" | "passTypes">("passes");

  // Pass Types state
  const [passTypes, setPassTypes] = useState<PassType[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showPassTypeForm, setShowPassTypeForm] = useState(false);
  const [editingPassType, setEditingPassType] = useState<PassType | null>(null);

  // Program Passes state
  const [passes, setPasses] = useState<ProgramPass[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [filterPassType, setFilterPassType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modal state
  const [showActivate, setShowActivate] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedPass, setSelectedPass] = useState<ProgramPass | null>(null);

  const fmtPrice = (v: number) => new Intl.NumberFormat("vi-VN").format(v);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // ── Fetchers ──

  const fetchPassTypes = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<PassType[]>(`/api/admin/program-passes/types?venueId=${selectedVenueId}`);
      setPassTypes(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  const fetchCoaches = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<Coach[]>(`/api/admin/coaches?venueId=${selectedVenueId}`);
      setCoaches(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  const fetchPasses = useCallback(async () => {
    if (!selectedVenueId) return;
    const params = new URLSearchParams({ venueId: selectedVenueId });
    if (filterPassType !== "all") params.set("passTypeId", filterPassType);
    if (filterStatus !== "all") params.set("status", filterStatus);
    try {
      const data = await api.get<{ passes: ProgramPass[]; kpi: Kpi }>(
        `/api/admin/program-passes?${params}`
      );
      setPasses(data.passes);
      setKpi(data.kpi);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, filterPassType, filterStatus]);

  useEffect(() => {
    fetchPassTypes();
    fetchCoaches();
    fetchPasses();
  }, [fetchPassTypes, fetchCoaches, fetchPasses]);

  // ── Pass Type handlers ──

  const deletePassType = async (id: string) => {
    if (!confirm("Deactivate this pass type?")) return;
    try {
      await api.delete(`/api/admin/program-passes/types/${id}`);
      await fetchPassTypes();
    } catch (e) { alert((e as Error).message); }
  };

  // ── Pass handlers ──

  const resumePass = async (pass: ProgramPass) => {
    try {
      await api.patch(`/api/admin/program-passes/${pass.id}`, { status: "active", clearDeferred: true });
      await fetchPasses();
    } catch (e) { alert((e as Error).message); }
  };

  const cancelPass = async (pass: ProgramPass) => {
    if (!confirm("Cancel this program pass?")) return;
    try {
      await api.patch(`/api/admin/program-passes/${pass.id}`, { status: "cancelled" });
      await fetchPasses();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Program Passes</h2>
        <AdminVenuePicker
          venueId={selectedVenueId}
          venues={venueOptions}
          onChange={setSelectedVenueId}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        {([
          { key: "passes" as const, label: "Program Passes" },
          { key: "passTypes" as const, label: "Pass Types" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PASS TYPES TAB ── */}
      {activeTab === "passTypes" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
              Pass Types ({passTypes.length})
            </h3>
            <button
              onClick={() => { setEditingPassType(null); setShowPassTypeForm(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-3.5 w-3.5" /> Add Pass Type
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {passTypes.map((pt) => (
              <div key={pt.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">{pt.name}</h4>
                    <p className="text-lg font-bold text-purple-400">
                      {fmtPrice(pt.price)}
                      <span className="ml-1 text-xs font-normal text-neutral-500">
                        {pt.passMode === "monthly" ? "/mo" : pt.passMode === "custom" ? "" : `/${passModeLabel(pt.passMode)}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingPassType(pt); setShowPassTypeForm(true); }}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                    ><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => deletePassType(pt.id)}
                      className="rounded p-1.5 text-neutral-500 hover:bg-red-900/40 hover:text-red-400"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                    {pt.sessionsIncluded} sessions
                  </span>
                  <span className="rounded-full bg-purple-900/40 px-2 py-0.5 text-[11px] text-purple-300">
                    {passModeLabel(pt.passMode)}
                  </span>
                  {pt.isOneTime && (
                    <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] text-amber-300">
                      One-time
                    </span>
                  )}
                </div>
                {pt.coaches.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pt.coaches.map((c) => (
                      <span key={c.id} className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
                        {c.coach.name}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-neutral-500">{pt._count.programPasses} active passes</p>
              </div>
            ))}
            {passTypes.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-neutral-500">
                No pass types yet. Add one to get started.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── PROGRAM PASSES TAB ── */}
      {activeTab === "passes" && (
        <>
          {/* KPI cards */}
          {kpi && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <DollarSign className="h-4 w-4 text-green-400 mb-1" />
                <p className="text-lg font-bold text-green-400">{fmtPrice(kpi.collected)}</p>
                <p className="text-[11px] text-neutral-500">Collected this month</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <Clock className="h-4 w-4 text-amber-400 mb-1" />
                <p className="text-lg font-bold text-amber-400">{kpi.unpaidCount}</p>
                <p className="text-[11px] text-neutral-500">Unpaid</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <AlertTriangle className="h-4 w-4 text-red-400 mb-1" />
                <p className="text-lg font-bold text-red-400">{kpi.overdueCount}</p>
                <p className="text-[11px] text-neutral-500">Overdue</p>
              </div>
            </div>
          )}

          {/* Filters + Activate */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={filterPassType}
              onChange={(e) => setFilterPassType(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="all">All Pass Types</option>
              {passTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="ml-auto">
              <button
                onClick={() => setShowActivate(true)}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
              >
                <UserPlus className="h-3.5 w-3.5" /> Activate
              </button>
            </div>
          </div>

          {/* Passes table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/50 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Pass Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Usage</th>
                  <th className="px-4 py-3 font-medium">Cycle ends</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => {
                  const atCap = p.sessionsUsed >= p.passType.sessionsIncluded;
                  return (
                    <tr key={p.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/30">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium">{p.player.name}</span>
                          <p className="text-xs text-neutral-500">{p.player.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-300">{p.passType.name}</td>
                      <td className="px-4 py-3"><PassStatusBadge status={p.status} /></td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-xs font-mono",
                          atCap && p.status === "active" ? "text-amber-400" : "text-neutral-400"
                        )}>
                          {p.sessionsUsed}/{p.passType.sessionsIncluded}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400">{fmtDate(p.cycleEnd)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {p.status === "active" && atCap && (
                            <span title="Session cap reached">
                              <Lock className="h-3.5 w-3.5 text-neutral-600" />
                            </span>
                          )}
                          {p.status === "active" && !atCap && (
                            <>
                              <button
                                onClick={() => { setSelectedPass(p); setShowCheckIn(true); }}
                                className="rounded p-1.5 text-neutral-500 hover:bg-green-900/30 hover:text-green-400"
                                title="Check in"
                              ><CalendarCheck className="h-3.5 w-3.5" /></button>
                              <button
                                onClick={() => { setSelectedPass(p); setShowPause(true); }}
                                className="rounded p-1.5 text-neutral-500 hover:bg-amber-900/30 hover:text-amber-400"
                                title="Pause"
                              ><Pause className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                          {p.status === "active" && (
                            <button
                              onClick={() => { setSelectedPass(p); setShowDelete(true); }}
                              className="rounded p-1.5 text-neutral-500 hover:bg-red-900/30 hover:text-red-400"
                              title="Delete pass"
                            ><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                          {p.status === "paused" && (
                            <>
                              <button
                                onClick={() => resumePass(p)}
                                className="rounded p-1.5 text-neutral-500 hover:bg-green-900/30 hover:text-green-400"
                                title="Resume"
                              ><RotateCcw className="h-3.5 w-3.5" /></button>
                              <button
                                onClick={() => cancelPass(p)}
                                className="rounded p-1.5 text-neutral-500 hover:bg-red-900/30 hover:text-red-400"
                                title="Cancel"
                              ><XCircle className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {passes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                      No program passes found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── MODALS ── */}

      {showPassTypeForm && (
        <PassTypeFormModal
          passType={editingPassType}
          venueId={selectedVenueId}
          coaches={coaches}
          onClose={() => setShowPassTypeForm(false)}
          onSaved={async () => { setShowPassTypeForm(false); await fetchPassTypes(); }}
        />
      )}

      {showActivate && (
        <ActivateModal
          venueId={selectedVenueId}
          passTypes={passTypes}
          onClose={() => setShowActivate(false)}
          onActivated={async () => { setShowActivate(false); await fetchPasses(); }}
        />
      )}

      {showCheckIn && selectedPass && (
        <CheckInModal
          pass={selectedPass}
          venueId={selectedVenueId}
          onClose={() => { setShowCheckIn(false); setSelectedPass(null); }}
          onCheckedIn={async () => { setShowCheckIn(false); setSelectedPass(null); await fetchPasses(); }}
        />
      )}

      {showPause && selectedPass && (
        <PauseModal
          pass={selectedPass}
          onClose={() => { setShowPause(false); setSelectedPass(null); }}
          onPaused={async () => { setShowPause(false); setSelectedPass(null); await fetchPasses(); }}
        />
      )}

      {showDelete && selectedPass && (
        <DeletePassModal
          pass={selectedPass}
          onClose={() => { setShowDelete(false); setSelectedPass(null); }}
          onDeleted={async () => { setShowDelete(false); setSelectedPass(null); await fetchPasses(); }}
        />
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function PassStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      status === "active" && "bg-green-600/20 text-green-400",
      status === "paused" && "bg-amber-600/20 text-amber-400",
      status === "expired" && "bg-neutral-600/20 text-neutral-400",
      status === "cancelled" && "bg-neutral-600/20 text-neutral-400",
    )}>
      {status}
    </span>
  );
}

function AmountInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const displayValue = raw !== null ? raw : value === 0 ? "" : new Intl.NumberFormat("vi-VN").format(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder={placeholder ?? "0"}
      className={className}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, "");
        setRaw(digits ? parseInt(digits, 10).toLocaleString("vi-VN") : "");
        onChange(digits ? parseInt(digits, 10) : 0);
      }}
      onBlur={() => setRaw(null)}
    />
  );
}

// ─── Pass Type Form Modal ──────────────────────────────────────────────────────

function PassTypeFormModal({
  passType,
  venueId,
  coaches,
  onClose,
  onSaved,
}: {
  passType: PassType | null;
  venueId: string;
  coaches: Coach[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(passType?.name ?? "");
  const [price, setPrice] = useState(passType?.price ?? 0);
  const [sessions, setSessions] = useState(passType?.sessionsIncluded ?? 12);
  const [passMode, setPassMode] = useState<PassMode>(passType?.passMode ?? "monthly");
  const [isOneTime, setIsOneTime] = useState(passType?.isOneTime ?? false);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>(
    passType?.coaches.map((c) => c.coach.id) ?? []
  );
  const [saving, setSaving] = useState(false);

  const toggleCoach = (id: string) => {
    setSelectedCoachIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (passType) {
        await api.patch(`/api/admin/program-passes/types/${passType.id}`, {
          name: name.trim(),
          price,
          sessionsIncluded: sessions,
          passMode,
          isOneTime,
          coachIds: selectedCoachIds,
        });
      } else {
        await api.post("/api/admin/program-passes/types", {
          venueId,
          name: name.trim(),
          price,
          sessionsIncluded: sessions,
          passMode,
          isOneTime,
          coachIds: selectedCoachIds,
        });
      }
      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{passType ? "Edit Pass Type" : "New Pass Type"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Monthly" className={inputCls} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Duration / mode</label>
            <select
              value={passMode}
              onChange={(e) => setPassMode(e.target.value as PassMode)}
              className={inputCls}
            >
              {PASS_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {passMode === "custom" && (
            <p className="rounded-lg bg-purple-950/30 border border-purple-800/40 px-3 py-2 text-[11px] text-purple-300">
              Custom-date passes: staff will pick the exact start and end dates at activation time.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">
                Price{passMode === "monthly" ? " / month" : passMode === "custom" ? "" : ` / ${passModeLabel(passMode)}`} (VND)
              </label>
              <AmountInput value={price} onChange={setPrice} placeholder="e.g. 1,200,000" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Sessions included</label>
              <input
                type="number"
                min={1}
                value={sessions}
                onChange={(e) => setSessions(Math.max(1, parseInt(e.target.value) || 1))}
                className={inputCls}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isOneTime}
              onChange={(e) => setIsOneTime(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-600 accent-amber-500"
            />
            <span className="text-xs text-neutral-400">One-time pass (not recurring)</span>
          </label>
          {coaches.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Coaches (optional)</label>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-2 space-y-1 max-h-40 overflow-y-auto">
                {coaches.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer select-none px-1 py-0.5 rounded hover:bg-neutral-700">
                    <input
                      type="checkbox"
                      checked={selectedCoachIds.includes(c.id)}
                      onChange={() => toggleCoach(c.id)}
                      className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-purple-500"
                    />
                    <span className="text-xs text-neutral-300">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activate Modal (2-step) ──────────────────────────────────────────────────

function ActivateModal({
  venueId,
  passTypes,
  onClose,
  onActivated,
}: {
  venueId: string;
  passTypes: PassType[];
  onClose: () => void;
  onActivated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [passTypeId, setPassTypeId] = useState(passTypes[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [isFree, setIsFree] = useState(false);
  const [freeNote, setFreeNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedPassType = passTypes.find((pt) => pt.id === passTypeId);

  const passMode: PassMode = (selectedPassType?.passMode ?? "monthly") as PassMode;
  const isMonthly = passMode === "monthly";
  const isCustom = passMode === "custom";

  // Cycle start options: first of the current month through 6 months later (7 options),
  // so staff can pre-sell a future program start (e.g. the August cycle).
  const today = new Date();
  const monthOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return {
      value: d.toLocaleDateString("sv-SE"), // YYYY-MM-01
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
  // Default for monthly: current month if on/before the 15th, else next month.
  const defaultMonthStr = (() => {
    const t = new Date();
    const idx = t.getDate() <= 15 ? 0 : 1;
    return new Date(t.getFullYear(), t.getMonth() + idx, 1).toLocaleDateString("sv-SE");
  })();
  const defaultDateStr = today.toLocaleDateString("sv-SE"); // today for days_N

  // Initialise the cycle start picker based on the first pass type's mode.
  const [cycleStartStr, setCycleStartStr] = useState(() => {
    const firstMode = passTypes[0]?.passMode ?? "monthly";
    return firstMode === "monthly" ? defaultMonthStr : defaultDateStr;
  });
  const [cycleEndStr, setCycleEndStr] = useState(defaultDateStr);

  useEffect(() => {
    if (playerSearch.length < 2) { setPlayerResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<{ players: PlayerResult[] }>(`/api/admin/players?search=${encodeURIComponent(playerSearch)}&limit=10`);
        setPlayerResults(data.players || []);
      } catch { setPlayerResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [playerSearch]);

  const activate = async () => {
    if (!selectedPlayer || !passTypeId) return;
    if (isCustom && cycleEndStr <= cycleStartStr) {
      alert("End date must be after the start date.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/admin/program-passes/activate", {
        playerId: selectedPlayer.id,
        venueId,
        passTypeId,
        paymentMethod: isFree ? undefined : paymentMethod,
        amountValue: selectedPassType?.price ?? 0,
        note: isFree ? freeNote : undefined,
        cycleStart: cycleStartStr,
        cycleEnd: isCustom ? cycleEndStr : undefined,
        isFree,
      });
      onActivated();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Activate Program Pass</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 text-xs text-neutral-500">
          <span className={cn("font-medium", step === 1 && "text-purple-400")}>1. Player</span>
          <span>→</span>
          <span className={cn("font-medium", step === 2 && "text-purple-400")}>2. Pass details</span>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={playerSearch}
                onChange={(e) => { setPlayerSearch(e.target.value); setSelectedPlayer(null); }}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                autoFocus
              />
            </div>
            {searching && <p className="text-xs text-neutral-500">Searching…</p>}
            {playerResults.length > 0 && !selectedPlayer && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
                {playerResults.map((p) => {
                  const photo = p.avatarPhotoPath ?? p.facePhotoPath;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlayer(p); setPlayerSearch(p.name); setPlayerResults([]); }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-neutral-700 text-left"
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-8 w-8 rounded-full object-cover bg-neutral-700 shrink-0" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-base shrink-0">
                          {p.avatar || "🏓"}
                        </span>
                      )}
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <p className="text-xs text-neutral-500">{p.phone}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedPlayer && (
              <div className="flex items-center gap-2 rounded-lg bg-green-950/30 border border-green-800/40 px-3 py-2">
                <Check className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-sm text-green-300 font-medium">{selectedPlayer.name}</span>
                <span className="text-xs text-neutral-500">{selectedPlayer.phone}</span>
              </div>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={!selectedPlayer}
              className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

        {step === 2 && selectedPlayer && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400">Player: <span className="text-white font-medium">{selectedPlayer.name}</span></p>

            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Pass Type</label>
              <select
                value={passTypeId}
                onChange={(e) => {
                  setPassTypeId(e.target.value);
                  const pt = passTypes.find((p) => p.id === e.target.value);
                  const newMode = pt?.passMode ?? "monthly";
                  setCycleStartStr(newMode === "monthly" ? defaultMonthStr : defaultDateStr);
                  setCycleEndStr(defaultDateStr);
                }}
                className={inputCls}
              >
                {passTypes.map((pt) => {
                  const modeLabel = pt.passMode === "monthly" ? "/mo" : pt.passMode === "custom" ? " · custom dates" : `/${passModeLabel(pt.passMode)}`;
                  return (
                    <option key={pt.id} value={pt.id}>
                      {pt.name} — {new Intl.NumberFormat("vi-VN").format(pt.price)}{modeLabel}
                      {pt.isOneTime ? " · one-time" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {isCustom ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Start</label>
                  <input
                    type="date"
                    value={cycleStartStr}
                    onChange={(e) => setCycleStartStr(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">End by</label>
                  <input
                    type="date"
                    value={cycleEndStr}
                    min={cycleStartStr}
                    onChange={(e) => setCycleEndStr(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">
                  {isMonthly ? "Cycle start month" : "Start date"}
                </label>
                {isMonthly ? (
                  <select value={cycleStartStr} onChange={(e) => setCycleStartStr(e.target.value)} className={inputCls}>
                    {monthOptions.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    value={cycleStartStr}
                    onChange={(e) => setCycleStartStr(e.target.value)}
                    className={inputCls}
                  />
                )}
                {!isMonthly && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Pass will run for {passModeLabel(passMode)} from this date.
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="h-4 w-4 rounded border-neutral-600 accent-purple-500" />
              <span className="text-xs text-neutral-400">Free / complimentary pass</span>
            </label>

            {!isFree && (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Payment method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}

            {isFree && (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Reason (optional)</label>
                <input type="text" value={freeNote} onChange={(e) => setFreeNote(e.target.value)} placeholder="e.g. Promotional, Staff benefit…" className={inputCls} />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep(1)} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
                ← Back
              </button>
              <button
                onClick={activate}
                disabled={saving || !passTypeId || (isCustom && (!cycleStartStr || !cycleEndStr))}
                className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Check-In Modal ───────────────────────────────────────────────────────────

function CheckInModal({
  pass,
  venueId,
  onClose,
  onCheckedIn,
}: {
  pass: ProgramPass;
  venueId: string;
  onClose: () => void;
  onCheckedIn: () => void;
}) {
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [saving, setSaving] = useState(false);

  const todayStr = new Date().toLocaleDateString("sv-SE");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<ClassInstance[]>(
          `/api/admin/program-passes/class-instances?venueId=${venueId}&date=${todayStr}`
        );
        setInstances(data);
      } catch { setInstances([]); }
      finally { setLoading(false); }
    })();
  }, [venueId, todayStr]);

  const checkIn = async () => {
    if (!selectedInstanceId) return;
    setSaving(true);
    try {
      await api.post("/api/admin/program-passes/check-in", {
        programPassId: pass.id,
        classInstanceId: selectedInstanceId,
      });
      onCheckedIn();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold">Check In</h3>
            <p className="text-xs text-neutral-500">{pass.player.name} — {pass.passType.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Today&apos;s classes</p>

        {loading ? (
          <p className="text-center py-6 text-sm text-neutral-500">Loading…</p>
        ) : instances.length === 0 ? (
          <p className="text-center py-6 text-sm text-neutral-500">No classes scheduled today.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {instances.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setSelectedInstanceId(inst.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selectedInstanceId === inst.id
                    ? "border-purple-500 bg-purple-600/10"
                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                )}
              >
                <p className="text-sm font-medium">{inst.passType.name}</p>
                <p className="text-xs text-neutral-400">
                  {fmtTime(inst.startAt)} – {fmtTime(inst.endAt)} · {inst.coach.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {inst._count.checkIns}/{inst.maxPlayers} checked in
                </p>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={checkIn}
            disabled={saving || !selectedInstanceId}
            className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40"
          >
            {saving ? "Checking in…" : "Confirm Check-In"}
          </button>
          <button onClick={onClose} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Pass Modal (double-confirmation) ──────────────────────────────────

function DeletePassModal({
  pass,
  onClose,
  onDeleted,
}: {
  pass: ProgramPass;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/admin/program-passes/${pass.id}`);
      onDeleted();
    } catch (e) { alert((e as Error).message); }
    finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border border-red-900/60 bg-neutral-900 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-900/40">
              <Trash2 className="h-4 w-4 text-red-400" />
            </div>
            <h3 className="font-bold text-white">Delete Pass</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 && (
          <>
            <div className="rounded-lg bg-red-950/30 border border-red-900/40 p-3 space-y-1">
              <p className="text-sm text-white font-medium">{pass.player.name}</p>
              <p className="text-xs text-neutral-400">{pass.passType.name}</p>
              <p className="text-xs text-neutral-500">
                {pass.sessionsUsed}/{pass.passType.sessionsIncluded} sessions used · cycle ends{" "}
                {new Date(pass.cycleEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
            <p className="text-sm text-neutral-300">
              This will permanently delete this program pass and all its associated check-ins and payment records. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 rounded-xl bg-red-700 py-3 font-semibold text-white hover:bg-red-600"
              >
                Delete Pass
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="rounded-lg bg-red-950/40 border border-red-800/60 p-4 text-center space-y-1">
              <AlertTriangle className="mx-auto h-6 w-6 text-red-400" />
              <p className="text-sm font-semibold text-red-300">Are you absolutely sure?</p>
              <p className="text-xs text-neutral-400">
                Deleting <span className="font-medium text-white">{pass.player.name}&apos;s</span> pass cannot be reversed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Yes, delete permanently"}
              </button>
              <button
                onClick={() => setStep(1)}
                className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Pause Modal ──────────────────────────────────────────────────────────────

function PauseModal({
  pass,
  onClose,
  onPaused,
}: {
  pass: ProgramPass;
  onClose: () => void;
  onPaused: () => void;
}) {
  // Default deferred resume: first of next month
  const now = new Date();
  const defaultResume = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const defaultResumeStr = defaultResume.toLocaleDateString("sv-SE");

  const [deferredDate, setDeferredDate] = useState(defaultResumeStr);
  const [saving, setSaving] = useState(false);

  const pause = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/admin/program-passes/${pass.id}`, {
        status: "paused",
        deferredStartDate: deferredDate,
      });
      onPaused();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold">Pause Pass</h3>
            <p className="text-xs text-neutral-500">{pass.player.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className="text-xs text-neutral-400 mb-1 block">Resume date</label>
          <input
            type="date"
            value={deferredDate}
            onChange={(e) => setDeferredDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-neutral-500">Pass will automatically resume on this date.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={pause}
            disabled={saving || !deferredDate}
            className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {saving ? "Pausing…" : "Pause Pass"}
          </button>
          <button onClick={onClose} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
