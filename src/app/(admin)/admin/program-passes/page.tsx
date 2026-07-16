"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { adminI18n } from "@/i18n/admin-i18n";
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
  ImageIcon,
  Upload,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  name: string;
}

interface Court {
  id: string;
  label: string;
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

const fmtPrice = (v: number) => new Intl.NumberFormat("vi-VN").format(v);

interface PassType {
  id: string;
  venueId: string;
  name: string;
  price: number;
  sessionsIncluded: number;
  passMode: PassMode;
  isOneTime: boolean;
  isActive: boolean;
  description: string | null;
  imageUrl: string | null;
  level: string | null;
  skillTags: string[];
  prerequisites: string | null;
  ageRange: string | null;
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

// ─── Program Run types ────────────────────────────────────────────────────────

interface RunCoach {
  runId: string;
  coachId: string;
  coach: { id: string; name: string };
}

interface RunInstance {
  id: string;
  startAt: string;
  endAt: string;
  topic: string | null;
  programRunId: string;
  courtBlockId: string | null;
  courtBlock: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    courtIds: string[];
    courtBlockCoaches: { coachId: string; coach: { id: string; name: string } }[];
  } | null;
  _count: { checkIns: number };
}

interface ProgramRunRecord {
  id: string;
  passTypeId: string;
  venueId: string;
  name: string;
  status: string;
  startDate: string;
  recurrenceStartHour: number;
  recurrenceDurationMin: number;
  recurrenceCount: number | null;
  recurrenceEndDate: string | null;
  maxCapacity: number;
  courtId: string | null;
  courtIds: string[];
  note: string | null;
  passType: { id: string; name: string };
  court: { id: string; label: string } | null;
  coaches: RunCoach[];
  _count: { programPasses: number; classInstances: number };
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProgramPassesPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues: venueOptions,
  } = useAdminVenuePicker({ autoSelect: true });

  const [activeTab, setActiveTab] = useState<"passes" | "passTypes" | "programRuns">("passes");

  // Pass Types state
  const [passTypes, setPassTypes] = useState<PassType[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [showPassTypeForm, setShowPassTypeForm] = useState(false);
  const [editingPassType, setEditingPassType] = useState<PassType | null>(null);

  // Program Passes state
  const [passes, setPasses] = useState<ProgramPass[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [filterPassType, setFilterPassType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Program Runs state
  const [programRuns, setProgramRuns] = useState<ProgramRunRecord[]>([]);
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [editingRun, setEditingRun] = useState<ProgramRunRecord | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runInstances, setRunInstances] = useState<Record<string, RunInstance[]>>({});
  const [rescheduleInstance, setRescheduleInstance] = useState<{ runId: string; instance: RunInstance } | null>(null);

  // Modal state
  const [showActivate, setShowActivate] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedPass, setSelectedPass] = useState<ProgramPass | null>(null);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // ── Fetchers ──

  const fetchPassTypes = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<PassType[]>(`/api/admin/program-passes/types?venueId=${selectedVenueId}&includeUnpublished=1`);
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

  const fetchCourts = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<Court[]>(`/api/courts?venueId=${selectedVenueId}`);
      setCourts(data);
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

  const fetchRuns = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<ProgramRunRecord[]>(
        `/api/admin/program-runs?venueId=${selectedVenueId}`
      );
      setProgramRuns(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  const fetchRunInstances = useCallback(async (runId: string) => {
    try {
      const data = await api.get<RunInstance[]>(
        `/api/admin/program-runs/${runId}/instances`
      );
      setRunInstances((prev) => ({ ...prev, [runId]: data }));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchPassTypes();
    fetchCoaches();
    fetchCourts();
    fetchPasses();
    fetchRuns();
  }, [fetchPassTypes, fetchCoaches, fetchCourts, fetchPasses, fetchRuns]);

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
        <h2 className="text-xl font-bold md:text-2xl">{t("programPasses.title")}</h2>
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
          { key: "passes" as const, label: t("programPasses.tabPasses") },
          { key: "passTypes" as const, label: t("programPasses.tabPassTypes") },
          { key: "programRuns" as const, label: t("programPasses.tabRuns") },
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
              {t("programPasses.tabPassTypes")} ({passTypes.length})
            </h3>
            <button
              onClick={() => { setEditingPassType(null); setShowPassTypeForm(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-3.5 w-3.5" /> {t("programPasses.addPassType")}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {passTypes.map((pt) => (
              <PassTypeCard
                key={pt.id}
                pt={pt}
                onEdit={() => { setEditingPassType(pt); setShowPassTypeForm(true); }}
                onDelete={() => deletePassType(pt.id)}
              />
            ))}
            {passTypes.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-neutral-500">
                {t("programPasses.noPassTypes")}
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
                <p className="text-[11px] text-neutral-500">{t("programPasses.collectedThisMonth")}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <Clock className="h-4 w-4 text-amber-400 mb-1" />
                <p className="text-lg font-bold text-amber-400">{kpi.unpaidCount}</p>
                <p className="text-[11px] text-neutral-500">{t("programPasses.unpaid")}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <AlertTriangle className="h-4 w-4 text-red-400 mb-1" />
                <p className="text-lg font-bold text-red-400">{kpi.overdueCount}</p>
                <p className="text-[11px] text-neutral-500">{t("programPasses.overdue")}</p>
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
              <option value="all">{t("programPasses.allPassTypes")}</option>
              {passTypes.filter((pt) => pt.isActive).map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="all">{t("programPasses.allStatuses")}</option>
              <option value="active">{t("programPasses.statusActive")}</option>
              <option value="paused">{t("programPasses.statusPaused")}</option>
              <option value="expired">{t("programPasses.statusExpired")}</option>
              <option value="cancelled">{t("programPasses.statusCancelled")}</option>
            </select>
            <div className="ml-auto">
              <button
                onClick={() => setShowActivate(true)}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
              >
                <UserPlus className="h-3.5 w-3.5" /> {t("programPasses.activateBtn")}
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
                      {t("programPasses.noPassesFound")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── PROGRAM RUNS TAB ── */}
      {activeTab === "programRuns" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
              {t("programPasses.tabRuns")} ({programRuns.length})
            </h3>
            <button
              onClick={() => setShowCreateRun(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-3.5 w-3.5" /> {t("programPasses.createRun")}
            </button>
          </div>

          <div className="space-y-3">
            {programRuns.map((run) => {
              const statusColors: Record<string, string> = {
                upcoming: "bg-purple-900/40 text-purple-300",
                in_progress: "bg-green-900/40 text-green-300",
                completed: "bg-neutral-800 text-neutral-400",
                cancelled: "bg-red-900/30 text-red-400",
              };
              const isExpanded = expandedRunId === run.id;
              const instances = runInstances[run.id] ?? [];
              const toggleRunExpand = async () => {
                if (isExpanded) {
                  setExpandedRunId(null);
                } else {
                  setExpandedRunId(run.id);
                  if (!runInstances[run.id]) {
                    await fetchRunInstances(run.id);
                  }
                }
              };

              return (
                <div key={run.id} className="rounded-xl border border-neutral-800 bg-neutral-900">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { void toggleRunExpand(); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void toggleRunExpand();
                      }
                    }}
                    className="p-4 space-y-2 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold truncate">{run.name}</h4>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px]", statusColors[run.status] ?? "bg-neutral-800 text-neutral-400")}>
                            {run.status === "upcoming" ? t("programPasses.statusUpcoming") : run.status === "in_progress" ? t("programPasses.statusInProgress") : run.status === "completed" ? t("programPasses.statusCompleted") : t("programPasses.statusCancelled")}
                          </span>
                          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                            {run.passType.name}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1">
                          <span className="text-xs text-neutral-500">
                            {run._count.programPasses} / {run.maxCapacity} enrolled
                          </span>
                          {run.courtIds.length > 0 && (
                            <span className="text-xs text-neutral-500">
                              {run.courtIds
                                .map((id) => courts.find((c) => c.id === id)?.label ?? id)
                                .join(", ")}
                            </span>
                          )}
                          <span className="text-xs text-neutral-500">
                            {run.recurrenceDurationMin} min · {run.recurrenceCount ? `${run.recurrenceCount} ${t("programPasses.sessions")}` : "until " + run.recurrenceEndDate?.split("T")[0]}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingRun(run); }}
                          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                        ><Pencil className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Generate schedule for this run? This will create all class instances and court blocks.")) return;
                            try {
                              await api.post(`/api/admin/program-runs/${run.id}/generate`, {});
                              await fetchRuns();
                            } catch (e) { alert((e as Error).message); }
                          }}
                          disabled={run._count.classInstances > 0}
                          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={run._count.classInstances > 0 ? "Schedule already generated" : "Generate schedule"}
                        ><CalendarCheck className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void toggleRunExpand(); }}
                          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                          title={isExpanded ? "Collapse" : "View instances"}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {run.coaches.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {run.coaches.map((rc) => (
                          <span key={rc.coachId} className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
                            {rc.coach.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                    {isExpanded && (
                    <div className="border-t border-neutral-800 divide-y divide-neutral-800">
                      {instances.length === 0 ? (
                        <p className="px-4 py-4 text-xs text-neutral-500">No instances yet. Generate the schedule first.</p>
                      ) : (
                        instances.map((inst, idx) => (
                          <div key={inst.id} className="px-4 py-2.5 flex items-center gap-3">
                            {/* Session number */}
                            <span className="shrink-0 w-5 text-center text-[11px] font-mono text-neutral-600">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">
                                {inst.courtBlock?.date
                                  ? new Date(inst.courtBlock.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                                  : new Date(inst.startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              </p>
                              <p className="text-[11px] text-neutral-500">
                                {new Date(inst.startAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–
                                {new Date(inst.endAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                {" · "}{inst._count.checkIns} {t("programPasses.checkedIn")}
                              </p>
                              {inst.topic && (
                                <p className="text-[11px] text-sky-400/80 italic truncate">{inst.topic}</p>
                              )}
                              {inst.courtBlock?.courtBlockCoaches && inst.courtBlock.courtBlockCoaches.length > 0 && (
                                <p className="text-[11px] text-neutral-500">
                                  {inst.courtBlock.courtBlockCoaches.map((c) => c.coach.name).join(", ")}
                                </p>
                              )}
                            </div>
                            {/* Reschedule */}
                            <button
                              onClick={() => setRescheduleInstance({ runId: run.id, instance: inst })}
                              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white shrink-0"
                              title="Reschedule this session"
                            ><Pencil className="h-3 w-3" /></button>
                            {/* Delete + replace at end */}
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete session ${idx + 1} and add a replacement at the end of the run?`)) return;
                                try {
                                  await api.delete(`/api/admin/program-runs/${run.id}/instances/${inst.id}`);
                                  await fetchRunInstances(run.id);
                                  await fetchRuns();
                                } catch (e) { alert((e as Error).message); }
                              }}
                              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400 shrink-0"
                              title={inst._count.checkIns > 0 ? "Cannot delete — players checked in" : "Delete and add replacement at end"}
                              disabled={inst._count.checkIns > 0}
                            ><RefreshCcw className="h-3 w-3" /></button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {programRuns.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">
                {t("programPasses.noRunsFound")}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── MODALS ── */}

      {showPassTypeForm && (
        <PassTypeFormModal
          passType={editingPassType}
          venueId={selectedVenueId}
          coaches={coaches}
          courts={courts}
          onClose={() => setShowPassTypeForm(false)}
          onSaved={async () => { setShowPassTypeForm(false); await fetchPassTypes(); await fetchRuns(); }}
        />
      )}

      {showActivate && (
        <ActivateModal
          venueId={selectedVenueId}
          passTypes={passTypes.filter((pt) => pt.isActive)}
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

      {showCreateRun && (
        <CreateRunModal
          venueId={selectedVenueId}
          passTypes={passTypes.filter((pt) => pt.isActive)}
          coaches={coaches}
          courts={courts}
          onClose={() => setShowCreateRun(false)}
          onSaved={async () => { setShowCreateRun(false); await fetchRuns(); }}
        />
      )}

      {editingRun && (
        <EditRunModal
          run={editingRun}
          coaches={coaches}
          courts={courts}
          onClose={() => setEditingRun(null)}
          onSaved={async () => { setEditingRun(null); await fetchRuns(); }}
        />
      )}

      {rescheduleInstance && (
        <EditInstanceModal
          instance={rescheduleInstance.instance}
          runId={rescheduleInstance.runId}
          allCoaches={coaches}
          onClose={() => setRescheduleInstance(null)}
          onSaved={async () => {
            const runId = rescheduleInstance.runId;
            setRescheduleInstance(null);
            await fetchRunInstances(runId);
          }}
        />
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function PassTypeCard({
  pt,
  onEdit,
  onDelete,
}: {
  pt: PassType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [descExpanded, setDescExpanded] = useState(false);
  const DESCRIPTION_THRESHOLD = 160;
  const isLong = (pt.description?.length ?? 0) > DESCRIPTION_THRESHOLD;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden flex flex-col">
      {/* Hero image */}
      {pt.imageUrl ? (
        <div className="relative h-40 w-full bg-neutral-800">
          <img
            src={pt.imageUrl}
            alt={pt.name}
            className="h-full w-full object-cover"
          />
          {/* subtle gradient so text above is readable if needed */}
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/60 to-transparent" />
        </div>
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-neutral-800/60 border-b border-neutral-800">
          <ImageIcon className="h-8 w-8 text-neutral-700" />
        </div>
      )}

      {/* Card body */}
      <div className="flex flex-col flex-1 p-4 space-y-3">
        {/* Name + actions */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-base leading-snug">{pt.name}</h4>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              title="Edit"
            ><Pencil className="h-3.5 w-3.5" /></button>
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-neutral-500 hover:bg-red-900/40 hover:text-red-400"
              title="Delete"
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Price */}
        <p className="text-xl font-bold text-purple-400 leading-none">
          {fmtPrice(pt.price)}
          <span className="ml-1.5 text-xs font-normal text-neutral-500">
            {pt.passMode === "monthly" ? "/mo" : pt.passMode === "custom" ? "" : `/${passModeLabel(pt.passMode)}`}
          </span>
        </p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {!pt.isActive && (
            <span className="rounded-full bg-neutral-700/60 border border-neutral-600/40 px-2.5 py-0.5 text-[11px] text-neutral-400 font-medium">
              {t("programPasses.draft")}
            </span>
          )}
          <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-400">
            {pt.sessionsIncluded} {t("programPasses.sessions")}
          </span>
          <span className="rounded-full bg-purple-900/40 px-2.5 py-0.5 text-[11px] text-purple-300">
            {passModeLabel(pt.passMode)}
          </span>
          {pt.isOneTime && (
            <span className="rounded-full bg-amber-900/40 px-2.5 py-0.5 text-[11px] text-amber-300">
              One-time
            </span>
          )}
          {pt.level && (
            <span className="rounded-full bg-teal-900/40 px-2.5 py-0.5 text-[11px] text-teal-300 capitalize">
              {pt.level}
            </span>
          )}
          {pt.ageRange && (
            <span className="rounded-full bg-sky-900/40 px-2.5 py-0.5 text-[11px] text-sky-300">
              {pt.ageRange}
            </span>
          )}
        </div>

        {/* Skill tags */}
        {pt.skillTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pt.skillTags.map((tag) => (
              <span key={tag} className="rounded-full bg-blue-900/30 border border-blue-800/40 px-2 py-0.5 text-[10px] text-blue-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Coaches */}
        {pt.coaches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pt.coaches.map((c) => (
              <span key={c.id} className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-300">
                {c.coach.name}
              </span>
            ))}
          </div>
        )}

        {/* Description — expandable */}
        {pt.description && (
          <div className="border-t border-neutral-800 pt-2">
            <p className={cn("text-xs text-neutral-400 leading-relaxed whitespace-pre-line", !descExpanded && isLong && "line-clamp-3")}>
              {pt.description}
            </p>
            {isLong && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {descExpanded ? (
                  <><ChevronUp className="h-3 w-3" /> Show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3" /> Show more</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="mt-auto pt-1 text-xs text-neutral-600">{pt._count.programPasses} active passes</p>
      </div>
    </div>
  );
}

function PassStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const label = status === "active" ? t("programPasses.statusActive")
    : status === "paused" ? t("programPasses.statusPaused")
    : status === "expired" ? t("programPasses.statusExpired")
    : status === "cancelled" ? t("programPasses.statusCancelled")
    : status;
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
      status === "active" && "bg-green-600/20 text-green-400",
      status === "paused" && "bg-amber-600/20 text-amber-400",
      status === "expired" && "bg-neutral-600/20 text-neutral-400",
      status === "cancelled" && "bg-neutral-600/20 text-neutral-400",
    )}>
      {label}
    </span>
  );
}

const PRESET_LEVELS = ["beginner", "intermediate", "advanced", "pro"];

function LevelField({
  value,
  onChange,
  inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const isCustom = value !== "" && !PRESET_LEVELS.includes(value);
  // show the text input when: currently editing a custom value, OR user just picked "custom"
  const [customMode, setCustomMode] = useState(isCustom);

  const selectValue = customMode ? "__custom__" : value;

  return (
    <div>
      <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.level")}</label>
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setCustomMode(true);
            // keep current value so they can edit it; if it was a preset, clear it
            if (!isCustom) onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        className={inputCls}
      >
        <option value="">— Not specified —</option>
        <option value="beginner">{t("programPasses.levelBeginner")}</option>
        <option value="intermediate">{t("programPasses.levelIntermediate")}</option>
        <option value="advanced">{t("programPasses.levelAdvanced")}</option>
        <option value="pro">{t("programPasses.levelPro")}</option>
        <option value="__custom__">{t("programPasses.levelCustom")}</option>
      </select>
      {customMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("programPasses.levelCustomPlaceholder")}
          className={`${inputCls} mt-2`}
          autoFocus
        />
      )}
    </div>
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
  courts,
  onClose,
  onSaved,
}: {
  passType: PassType | null;
  venueId: string;
  coaches: Coach[];
  courts: Court[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const isEdit = passType !== null;

  // ── Program fields ──
  const [name, setName] = useState(passType?.name ?? "");
  const [price, setPrice] = useState(passType?.price ?? 0);
  const [sessions, setSessions] = useState(passType?.sessionsIncluded ?? 12);
  const [passMode, setPassMode] = useState<PassMode>(passType?.passMode ?? "monthly");
  const [isOneTime, setIsOneTime] = useState(passType?.isOneTime ?? false);
  const [isPublished, setIsPublished] = useState(passType?.isActive ?? true);

  // ── Description fields ──
  const [description, setDescription] = useState(passType?.description ?? "");
  const [level, setLevel] = useState<string>(passType?.level ?? "");
  const [ageRange, setAgeRange] = useState(passType?.ageRange ?? "");
  const [skillTagsRaw, setSkillTagsRaw] = useState((passType?.skillTags ?? []).join(", "));
  const [prerequisites, setPrerequisites] = useState(passType?.prerequisites ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(passType?.imageUrl ?? "");

  // ── Coaches ──
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>(
    passType?.coaches.map((c) => c.coach.id) ?? []
  );

  // ── First Run fields (create-only) ──
  const [runName, setRunName] = useState("");
  const [runStartDate, setRunStartDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [runStartHour, setRunStartHour] = useState(8);
  const [runDurationMin, setRunDurationMin] = useState(60);
  const [runCount, setRunCount] = useState(sessions); // mirrors sessions field
  const [runMaxCapacity, setRunMaxCapacity] = useState(15);
  const [runCourtIds, setRunCourtIds] = useState<string[]>([]);
  const [skipFirstRun, setSkipFirstRun] = useState(false);

  // keep runCount in sync with sessions when on program tab
  useEffect(() => { if (!isEdit) setRunCount(sessions); }, [sessions, isEdit]);

  const [saving, setSaving] = useState(false);

  const toggleCoach = (id: string) =>
    setSelectedCoachIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Steps: create = 4 tabs, edit = 3 tabs
  type TabId = "program" | "description" | "coaches" | "first-run";
  const ALL_TABS: { id: TabId; label: string }[] = [
    { id: "program", label: t("programPasses.tabProgram") },
    { id: "description", label: t("programPasses.tabDescription") },
    { id: "coaches", label: t("programPasses.tabCoaches") },
    ...(!isEdit ? [{ id: "first-run" as const, label: t("programPasses.tabFirstRun") }] : []),
  ];
  const [modalTab, setModalTab] = useState<TabId>("program");
  const tabIndex = ALL_TABS.findIndex((t) => t.id === modalTab);
  const canGoNext = tabIndex < ALL_TABS.length - 1;
  const canGoBack = tabIndex > 0;

  const curriculumPayload = () => ({
    level: level || null,
    skillTags: skillTagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
    prerequisites: prerequisites.trim() || null,
    ageRange: ageRange.trim() || null,
  });

  // preview dates for First Run tab
  const previewDates = (() => {
    if (!runStartDate || runCount < 1) return [];
    const dates: string[] = [];
    let cur = new Date(`${runStartDate}T00:00:00`);
    for (let i = 0; i < runCount; i++) {
      dates.push(cur.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return dates;
  })();

  const save = async () => {
    if (!name.trim()) { setModalTab("program"); return; }
    setSaving(true);
    try {
      let savedId: string;
      if (isEdit) {
        await api.patch(`/api/admin/program-passes/types/${passType.id}`, {
          name: name.trim(), price, sessionsIncluded: sessions, passMode,
          isOneTime, isActive: isPublished,
          description: description.trim() || null,
          coachIds: selectedCoachIds,
          ...curriculumPayload(),
        });
        savedId = passType.id;
      } else {
        const res = await api.post<{ id: string }>("/api/admin/program-passes/types", {
          venueId, name: name.trim(), price, sessionsIncluded: sessions, passMode,
          isOneTime, isActive: isPublished,
          description: description.trim() || null,
          coachIds: selectedCoachIds,
          ...curriculumPayload(),
        });
        savedId = res.id;
      }

      if (imageFile && savedId) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await api.upload<{ imageUrl: string }>(`/api/admin/program-passes/types/${savedId}/image`, fd);
      }

      // Create first run if on create mode, run tab filled, not skipped
      if (!isEdit && !skipFirstRun && runName.trim()) {
        await api.post("/api/admin/program-runs", {
          venueId,
          passTypeId: savedId,
          name: runName.trim(),
          startDate: runStartDate,
          recurrenceStartHour: runStartHour,
          recurrenceDurationMin: runDurationMin,
          recurrenceCount: runCount,
          courtIds: runCourtIds,
          maxCapacity: runMaxCapacity,
          coachIds: selectedCoachIds,
        });
      }

      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";
  const isLastStep = tabIndex === ALL_TABS.length - 1;
  const saveLabel = saving ? t("programPasses.saving")
    : isEdit ? t("programPasses.save")
    : isLastStep ? (skipFirstRun || !runName.trim() ? t("programPasses.createProgram") : t("programPasses.createProgramAndRun"))
    : t("programPasses.next");

  const confirmClose = () => {
    if (window.confirm(t("programPasses.closeConfirm"))) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={confirmClose}>
      <div
        className="w-full max-w-lg h-[82vh] max-h-[820px] min-h-[620px] rounded-2xl border border-neutral-700 bg-neutral-900 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div>
            <h3 className="text-lg font-bold">{isEdit ? t("programPasses.editProgram") : t("programPasses.newProgram")}</h3>
            {!isEdit && (
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {t("programPasses.stepOf", { step: tabIndex + 1, total: ALL_TABS.length })}
              </p>
            )}
          </div>
          <button onClick={confirmClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar — freely navigable */}
        <div className="flex border-b border-neutral-800 px-6 shrink-0 overflow-x-auto">
          {ALL_TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setModalTab(tab.id)}
              className={cn(
                "pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                modalTab === tab.id
                  ? "border-purple-500 text-white"
                  : i <= tabIndex
                  ? "border-transparent text-neutral-400 hover:text-neutral-200"
                  : "border-transparent text-neutral-600 hover:text-neutral-400"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── PROGRAM TAB ── */}
          {modalTab === "program" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.programName")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("programPasses.programNamePlaceholder")}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.durationMode")}</label>
                <select value={passMode} onChange={(e) => setPassMode(e.target.value as PassMode)} className={inputCls}>
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
                    {passMode === "monthly" ? t("programPasses.pricePerMonth") : passMode === "custom" ? t("programPasses.priceCustom") : t("programPasses.price", { mode: passModeLabel(passMode) })}
                  </label>
                  <AmountInput value={price} onChange={setPrice} placeholder="e.g. 1,200,000" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.sessionsIncluded")}</label>
                  <input
                    type="number" min={1} value={sessions}
                    onChange={(e) => setSessions(Math.max(1, parseInt(e.target.value) || 1))}
                    className={inputCls}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox" checked={isOneTime}
                  onChange={(e) => setIsOneTime(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-600 accent-amber-500"
                />
                <span className="text-sm text-neutral-400">{t("programPasses.oneTimePass")}</span>
              </label>

              {/* Published toggle — always visible */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-800/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-200">
                    {isPublished ? t("programPasses.published") : t("programPasses.draft")}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {isPublished ? t("programPasses.publishedDesc") : t("programPasses.draftDesc")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublished((v) => !v)}
                  className={cn(
                    "w-11 h-6 rounded-full transition-colors relative shrink-0",
                    isPublished ? "bg-purple-600" : "bg-neutral-700"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow",
                    isPublished && "translate-x-5"
                  )} />
                </button>
              </div>
            </div>
          )}

          {/* ── DESCRIPTION TAB ── */}
          {modalTab === "description" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-400 mb-2 block">{t("programPasses.programImage")}</label>
                {imagePreview ? (
                  <div className="relative mb-3 rounded-xl overflow-hidden border border-neutral-700">
                    <img src={imagePreview} alt="Program" className="w-full h-44 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </div>
                ) : (
                  <div className="mb-3 h-32 rounded-xl border border-dashed border-neutral-700 bg-neutral-800/60 flex flex-col items-center justify-center gap-2 text-neutral-600">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs">{t("programPasses.noImageYet")}</span>
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {imagePreview ? t("programPasses.changeImage") : t("programPasses.uploadImage")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.description")}</label>
                <p className="text-[11px] text-neutral-600 mb-2">
                  {t("programPasses.descriptionHint")}
                </p>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder={"What to Expect\nDescribe the program overview…\n\nWhat you will learn\nList the key skills and topics…"}
                  rows={8}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none leading-relaxed"
                />
                <p className="text-[11px] text-neutral-600 mt-1 text-right">{description.length} chars</p>
              </div>
              <LevelField value={level} onChange={setLevel} inputCls={inputCls} />
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.ageRange")}</label>
                <input type="text" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder={t("programPasses.ageRangePlaceholder")} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.skillTags")}</label>
                <input type="text" value={skillTagsRaw} onChange={(e) => setSkillTagsRaw(e.target.value)} placeholder={t("programPasses.skillTagsPlaceholder")} className={inputCls} />
                {skillTagsRaw.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {skillTagsRaw.split(",").map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 border border-blue-700/40 px-2.5 py-0.5 text-[11px] text-blue-300">
                        {tag}
                        <button type="button" onClick={() => {
                          const tags = skillTagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
                          tags.splice(i, 1);
                          setSkillTagsRaw(tags.join(", "));
                        }} className="ml-0.5 text-blue-400 hover:text-white leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-neutral-600 mt-1">{t("programPasses.skillTagsHint")}</p>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.prerequisites")}</label>
                <textarea
                  value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)}
                  placeholder={t("programPasses.prerequisitesPlaceholder")}
                  rows={3}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* ── COACHES TAB ── */}
          {modalTab === "coaches" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                {!isEdit ? t("programPasses.defaultCoachesFirstRun") : t("programPasses.defaultCoaches")}
              </p>
              {coaches.length === 0 ? (
                <p className="rounded-lg border border-neutral-800 bg-neutral-800/40 px-4 py-6 text-center text-sm text-neutral-500">
                  {t("programPasses.noCoachesFound")}
                </p>
              ) : (
                <div className="space-y-1">
                  {coaches.map((c) => (
                    <label key={c.id} className={cn(
                      "flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-lg border transition-colors",
                      selectedCoachIds.includes(c.id)
                        ? "border-purple-500/40 bg-purple-600/10"
                        : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
                    )}>
                      <input
                        type="checkbox" checked={selectedCoachIds.includes(c.id)}
                        onChange={() => toggleCoach(c.id)}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-purple-500"
                      />
                      <span className="text-sm text-neutral-200">{c.name}</span>
                      {selectedCoachIds.includes(c.id) && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                    </label>
                  ))}
                </div>
              )}
              {selectedCoachIds.length > 0 && (
                <p className="text-[11px] text-neutral-500 pt-1">
                  {t("programPasses.coachesSelected", { count: selectedCoachIds.length })}
                </p>
              )}
            </div>
          )}

          {/* ── FIRST RUN TAB (create only) ── */}
          {modalTab === "first-run" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 px-4 py-3">
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {t("programPasses.firstRunIntro", { name: name || "this program" })}
                </p>
              </div>

              {/* Skip toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox" checked={skipFirstRun}
                  onChange={(e) => setSkipFirstRun(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-600 accent-neutral-500"
                />
                <span className="text-sm text-neutral-400">{t("programPasses.firstRunSkip")}</span>
              </label>

              {!skipFirstRun && (
                <>
                  <div>
                    <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runName")}</label>
                    <input
                      type="text" value={runName} onChange={(e) => setRunName(e.target.value)}
                      placeholder={t("programPasses.runNamePlaceholder", { name: name || "Program" })}
                      className={inputCls} autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.firstSessionDate")}</label>
                    <input type="date" value={runStartDate} onChange={(e) => setRunStartDate(e.target.value)} className={inputCls} />
                    <p className="text-[11px] text-neutral-500 mt-0.5">{t("programPasses.sessionRepeatHint")}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.startHour")}</label>
                      <select value={runStartHour} onChange={(e) => setRunStartHour(Number(e.target.value))} className={inputCls}>
                        {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                          <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.durationMin")}</label>
                      <input type="number" min={15} step={15} value={runDurationMin} onChange={(e) => setRunDurationMin(Number(e.target.value))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.numberOfSessions")}</label>
                      <input type="number" min={1} max={52} value={runCount} onChange={(e) => setRunCount(Number(e.target.value))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.maxCapacity")}</label>
                    <input type="number" min={1} value={runMaxCapacity} onChange={(e) => setRunMaxCapacity(Number(e.target.value))} className={inputCls} />
                  </div>
                  {courts.length > 0 && (
                    <div>
                      <label className="text-xs text-neutral-400 mb-1 block">
                        {t("programPasses.courts")} <span className="text-neutral-600 font-normal">({t("programPasses.courtsHint")})</span>
                      </label>
                      <div className="space-y-1">
                        {courts.map((c) => (
                          <label key={c.id} className={cn(
                            "flex items-center gap-3 cursor-pointer select-none px-3 py-2 rounded-lg border transition-colors",
                            runCourtIds.includes(c.id)
                              ? "border-purple-500/40 bg-purple-600/10"
                              : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
                          )}>
                            <input
                              type="checkbox"
                              checked={runCourtIds.includes(c.id)}
                              onChange={() => setRunCourtIds((prev) =>
                                prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              )}
                              className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-purple-500"
                            />
                            <span className="text-sm text-neutral-200">{c.label}</span>
                            {runCourtIds.includes(c.id) && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                          </label>
                        ))}
                      </div>
                      {runCourtIds.length === 0 && (
                        <p className="text-[11px] text-neutral-600 mt-1">{t("programPasses.noCourtSelected")}</p>
                      )}
                    </div>
                  )}
                  {previewDates.length > 0 && (
                    <div>
                      <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.sessionPreview", { count: previewDates.length })}</label>
                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 max-h-36 overflow-y-auto space-y-0.5">
                        {previewDates.map((d, i) => (
                          <p key={i} className="text-[11px] text-neutral-400">{i + 1}. {d}</p>
                        ))}
                      </div>
                      <p className="text-[11px] text-neutral-600 mt-1">
                        {t("programPasses.sessionPreviewNote")}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 shrink-0 space-y-3">
          <div className="flex gap-3">
            {canGoBack && !isEdit && (
              <button
                onClick={() => setModalTab(ALL_TABS[tabIndex - 1].id)}
                className="rounded-xl bg-neutral-800 px-5 py-3 font-medium text-neutral-300 hover:bg-neutral-700 shrink-0"
              >
                {t("programPasses.back")}
              </button>
            )}
            <button
              onClick={() => {
                if (!isEdit && canGoNext) {
                  setModalTab(ALL_TABS[tabIndex + 1].id);
                } else {
                  save();
                }
              }}
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
            >
              {saveLabel}
            </button>
          </div>
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
          <h3 className="text-lg font-bold">{t("programPasses.activateTitle")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 text-xs text-neutral-500">
          <span className={cn("font-medium", step === 1 && "text-purple-400")}>1. {t("programPasses.activateSelectPlayer")}</span>
          <span>→</span>
          <span className={cn("font-medium", step === 2 && "text-purple-400")}>2. {t("programPasses.activateSelectPass")}</span>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder={t("programPasses.activateSearchPlayer")}
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
                  <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.activateCustomStart")}</label>
                  <input
                    type="date"
                    value={cycleStartStr}
                    onChange={(e) => setCycleStartStr(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.activateCustomEnd")}</label>
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
                  {isMonthly ? t("programPasses.activateStartDate") : t("programPasses.activateCustomStart")}
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
              <span className="text-xs text-neutral-400">{t("programPasses.activateFree")}</span>
            </label>

            {!isFree && (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.activatePaymentMethod")}</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}

            {isFree && (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.activateFreeNote")}</label>
                <input type="text" value={freeNote} onChange={(e) => setFreeNote(e.target.value)} placeholder="e.g. Promotional, Staff benefit…" className={inputCls} />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep(1)} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
                {t("programPasses.back")}
              </button>
              <button
                onClick={activate}
                disabled={saving || !passTypeId || (isCustom && (!cycleStartStr || !cycleEndStr))}
                className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving ? t("programPasses.activating") : t("programPasses.activateCreate")}
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
            <h3 className="font-bold">{t("programPasses.checkInTitle")}</h3>
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
                  {inst._count.checkIns}/{inst.maxPlayers} {t("programPasses.checkedIn")}
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
            {saving ? t("programPasses.checkingIn") : t("programPasses.checkIn")}
          </button>
          <button onClick={onClose} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
            {t("programPasses.back")}
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
            <h3 className="font-bold text-white">{t("programPasses.deleteTitle")}</h3>
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
                {t("programPasses.deleteTitle")}
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("programPasses.back")}
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
                {deleting ? t("programPasses.deleting") : t("programPasses.deleteConfirm")}
              </button>
              <button
                onClick={() => setStep(1)}
                className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("programPasses.back")}
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
            <h3 className="font-bold">{t("programPasses.pauseTitle")}</h3>
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
            {saving ? t("programPasses.pausing") : t("programPasses.pause")}
          </button>
          <button onClick={onClose} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700">
            {t("programPasses.back")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Run Modal ─────────────────────────────────────────────────────────

function CreateRunModal({
  venueId,
  passTypes,
  coaches,
  courts,
  onClose,
  onSaved,
}: {
  venueId: string;
  passTypes: PassType[];
  coaches: Coach[];
  courts: Court[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [passTypeId, setPassTypeId] = useState(passTypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [startHour, setStartHour] = useState(8);
  const [durationMin, setDurationMin] = useState(60);
  const [occurrenceMode, setOccurrenceMode] = useState<"count" | "endDate">("count");
  const [recurrenceCount, setRecurrenceCount] = useState(8);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(15);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleCoach = (id: string) =>
    setSelectedCoachIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const previewDates = (() => {
    if (!startDate) return [];
    const dates: string[] = [];
    let cur = new Date(`${startDate}T00:00:00`);
    const maxIter = occurrenceMode === "count" ? recurrenceCount : 52;
    const end = occurrenceMode === "endDate" && recurrenceEndDate ? new Date(`${recurrenceEndDate}T23:59:59`) : null;
    for (let i = 0; i < maxIter; i++) {
      if (end && cur > end) break;
      dates.push(cur.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return dates;
  })();

  const save = async () => {
    if (!name.trim() || !passTypeId || !startDate) return;
    setSaving(true);
    try {
      await api.post("/api/admin/program-runs", {
        venueId,
        passTypeId,
        name: name.trim(),
        startDate,
        recurrenceStartHour: startHour,
        recurrenceDurationMin: durationMin,
        ...(occurrenceMode === "count" ? { recurrenceCount } : { recurrenceEndDate }),
        courtIds: selectedCourtIds,
        maxCapacity,
        coachIds: selectedCoachIds,
      });
      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <h3 className="text-lg font-bold">{t("programPasses.createRun")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runPassType")}</label>
            <select value={passTypeId} onChange={(e) => setPassTypeId(e.target.value)} className={inputCls}>
              {passTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runName")}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beginner Bootcamp — Q3 2026" className={inputCls} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.firstSessionDate")}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            <p className="text-[11px] text-neutral-500 mt-0.5">{t("programPasses.sessionRepeatHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.startHour")}</label>
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className={inputCls}>
                {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.durationMin")}</label>
              <input type="number" min={15} step={15} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.numberOfSessions")}</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setOccurrenceMode("count")} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", occurrenceMode === "count" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400")}>By # sessions</button>
              <button onClick={() => setOccurrenceMode("endDate")} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", occurrenceMode === "endDate" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400")}>By end date</button>
            </div>
            {occurrenceMode === "count" ? (
              <input type="number" min={1} max={52} value={recurrenceCount} onChange={(e) => setRecurrenceCount(Number(e.target.value))} className={inputCls} />
            ) : (
              <input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} className={inputCls} />
            )}
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Max capacity (number of players)</label>
            <input type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(Number(e.target.value))} className={inputCls} />
          </div>
          {courts.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">
                {t("programPasses.courts")} <span className="text-neutral-600 font-normal">({t("programPasses.courtsHint")})</span>
              </label>
              <div className="space-y-1">
                {courts.map((c) => (
                  <label key={c.id} className={cn(
                    "flex items-center gap-3 cursor-pointer select-none px-3 py-2 rounded-lg border transition-colors",
                    selectedCourtIds.includes(c.id)
                      ? "border-purple-500/40 bg-purple-600/10"
                      : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedCourtIds.includes(c.id)}
                      onChange={() => setSelectedCourtIds((prev) =>
                        prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      )}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-purple-500"
                    />
                    <span className="text-sm text-neutral-200">{c.label}</span>
                    {selectedCourtIds.includes(c.id) && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                  </label>
                ))}
              </div>
              {selectedCourtIds.length === 0 && (
                <p className="text-[11px] text-neutral-600 mt-1">{t("programPasses.noCourtSelected")}</p>
              )}
            </div>
          )}
          {coaches.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runCoaches")}</label>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-2 space-y-1 max-h-32 overflow-y-auto">
                {coaches.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer select-none px-1 py-0.5 rounded hover:bg-neutral-700">
                    <input type="checkbox" checked={selectedCoachIds.includes(c.id)} onChange={() => toggleCoach(c.id)} className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-purple-500" />
                    <span className="text-xs text-neutral-300">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {previewDates.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.sessionPreview", { count: previewDates.length })}</label>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 max-h-32 overflow-y-auto space-y-0.5">
                {previewDates.map((d, i) => (
                  <p key={i} className="text-[11px] text-neutral-400">{i + 1}. {d}</p>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-neutral-800">
          <button onClick={save} disabled={saving || !name.trim() || !passTypeId} className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40">
            {saving ? t("programPasses.saving") : t("programPasses.createRun")}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">{t("programPasses.back")}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Run Modal ───────────────────────────────────────────────────────────

function EditRunModal({
  run,
  coaches,
  courts,
  onClose,
  onSaved,
}: {
  run: ProgramRunRecord;
  coaches: Coach[];
  courts: Court[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [name, setName] = useState(run.name);
  const [status, setStatus] = useState(run.status);
  const [maxCapacity, setMaxCapacity] = useState(run.maxCapacity);
  const [note, setNote] = useState(run.note ?? "");
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>(run.coaches.map((rc) => rc.coachId));
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(run.courtIds ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggleCoach = (id: string) =>
    setSelectedCoachIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const toggleCourt = (id: string) =>
    setSelectedCourtIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      await api.patch(`/api/admin/program-runs/${run.id}`, {
        name: name.trim(),
        status,
        maxCapacity,
        courtIds: selectedCourtIds,
        note: note.trim() || null,
        coachIds: selectedCoachIds,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{t("programPasses.editRun")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          {err && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400">{err}</p>}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runStatus")}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="upcoming">{t("programPasses.statusUpcoming")}</option>
              <option value="in_progress">{t("programPasses.statusInProgress")}</option>
              <option value="completed">{t("programPasses.statusCompleted")}</option>
              <option value="cancelled">{t("programPasses.statusCancelled")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.maxCapacity")}</label>
            <input type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(Number(e.target.value))} className={inputCls} />
          </div>
          {courts.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">
                {t("programPasses.courts")} <span className="text-neutral-600 font-normal">({t("programPasses.courtsHint")})</span>
              </label>
              <div className="space-y-1">
                {courts.map((c) => (
                  <label key={c.id} className={cn(
                    "flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border transition-colors",
                    selectedCourtIds.includes(c.id)
                      ? "border-purple-500/40 bg-purple-600/10"
                      : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedCourtIds.includes(c.id)}
                      onChange={() => toggleCourt(c.id)}
                      className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-purple-500"
                    />
                    <span className="text-sm text-neutral-200">{c.label}</span>
                    {selectedCourtIds.includes(c.id) && <Check className="h-3.5 w-3.5 text-purple-400 ml-auto" />}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runNote")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none" />
          </div>
          {coaches.length > 0 && (
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{t("programPasses.runCoaches")}</label>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-2 space-y-1 max-h-32 overflow-y-auto">
                {coaches.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer select-none px-1 py-0.5 rounded hover:bg-neutral-700">
                    <input type="checkbox" checked={selectedCoachIds.includes(c.id)} onChange={() => toggleCoach(c.id)} className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-purple-500" />
                    <span className="text-xs text-neutral-300">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={save} disabled={saving || !name.trim()} className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40">
            {saving ? t("programPasses.saving") : t("programPasses.save")}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">{t("programPasses.back")}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Reschedule Instance Modal ────────────────────────────────────────────────

function EditInstanceModal({
  instance,
  runId,
  allCoaches,
  onClose,
  onSaved,
}: {
  instance: RunInstance;
  runId: string;
  allCoaches: Coach[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const originalDate = instance.courtBlock?.date
    ? new Date(instance.courtBlock.date).toLocaleDateString("sv-SE")
    : new Date(instance.startAt).toLocaleDateString("sv-SE");

  // ── Topic state ──
  const [topic, setTopic] = useState(instance.topic ?? "");

  // ── Schedule state ──
  const [newDate, setNewDate] = useState(originalDate);
  const [newStartTime, setNewStartTime] = useState(
    new Date(instance.startAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
  );
  const [newEndTime, setNewEndTime] = useState(
    new Date(instance.endAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
  );

  // ── Coach state ──
  const currentCoachIds = (instance.courtBlock?.courtBlockCoaches ?? []).map((c) => c.coachId);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>(currentCoachIds);
  const [applyToFuture, setApplyToFuture] = useState(false);

  const [saving, setSaving] = useState(false);

  const toggleCoach = (id: string) => {
    setSelectedCoachIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const coachesChanged =
    selectedCoachIds.length !== currentCoachIds.length ||
    selectedCoachIds.some((id) => !currentCoachIds.includes(id));

  const scheduleChanged =
    newDate !== originalDate ||
    newStartTime !== new Date(instance.startAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) ||
    newEndTime !== new Date(instance.endAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const topicChanged = topic !== (instance.topic ?? "");

  const save = async () => {
    if (!scheduleChanged && !coachesChanged && !topicChanged) { onClose(); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (topicChanged) {
        payload.topic = topic.trim() || null;
      }
      if (scheduleChanged) {
        payload.newDate = newDate;
        payload.newStartTime = new Date(`${newDate}T${newStartTime}:00`).toISOString();
        payload.newEndTime = new Date(`${newDate}T${newEndTime}:00`).toISOString();
      }
      if (coachesChanged) {
        payload.coachIds = selectedCoachIds;
        payload.applyToFuture = applyToFuture;
      }
      await api.patch(`/api/admin/program-runs/${runId}/instances/${instance.id}`, payload);
      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{t("programPasses.editInstance")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"><X className="h-4 w-4" /></button>
        </div>

        {/* ── Topic ── */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">{t("programPasses.instanceTopic")}</p>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("programPasses.instanceTopicPlaceholder")}
            className={inputCls}
          />
        </div>

        {/* ── Schedule ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Reschedule</p>
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Date</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Start</label>
              <input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">End</label>
              <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* ── Coaches ── */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{t("programPasses.instanceCoaches")}</p>
          {allCoaches.length === 0 ? (
            <p className="text-xs text-neutral-500">No coaches available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allCoaches.map((c) => {
                const selected = selectedCoachIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCoach(c.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                      selected
                        ? "border-purple-500 bg-purple-600/20 text-purple-300"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500"
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Apply to future toggle — only show when coaches have changed */}
          {coachesChanged && (
            <label className="flex items-center gap-2 cursor-pointer mt-2 select-none">
              <div
                onClick={() => setApplyToFuture((v) => !v)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex-shrink-0",
                  applyToFuture ? "bg-purple-600" : "bg-neutral-700"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                  applyToFuture && "translate-x-4"
                )} />
              </div>
              <span className="text-xs text-neutral-400">
                {t("programPasses.applyToFuture")}
              </span>
            </label>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? t("programPasses.saving") : t("programPasses.save")}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">
            {t("programPasses.back")}
          </button>
        </div>
      </div>
    </div>
  );
}
