"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import {
  Megaphone, X, Copy, Check, TrendingUp, Users, BarChart3,
  ExternalLink, ToggleLeft, ToggleRight, ArrowRight, CopyPlus, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import type { CampaignListItem, CampaignDetail } from "@/modules/marketing/types";

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "campaigns" | "create" | "analytics";

interface AnalyticsData {
  redemptionsByDay: { date: string; count: number }[];
  channelSplit: { channel: string; count: number; pct: number }[];
  totalClicks: number;
  totalRedemptions: number;
  totalRevenue: number;
  recentRedemptions: {
    id: string;
    promoName: string;
    promoCode: string;
    playerName: string;
    playerPhone: string;
    discountAmount: number;
    finalPrice: number;
    redeemedAt: string;
  }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(v: number, currency?: string) {
  const curr = currency ?? "VND";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Micro components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: "active" | "scheduled" | "ended" }) {
  const map = {
    active: { cls: "bg-emerald-500/12 text-emerald-400", dot: "bg-emerald-400" },
    scheduled: { cls: "bg-blue-500/12 text-blue-400", dot: "bg-blue-400" },
    ended: { cls: "bg-neutral-500/12 text-neutral-400", dot: "bg-neutral-500" },
  };
  const { cls, dot } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {status}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="inline-block rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300 capitalize">
      {channel}
    </span>
  );
}

function ConvertBadge({ bucket }: { bucket: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    instant: { label: "Same session", cls: "bg-emerald-500/12 text-emerald-400" },
    same_day: { label: "Same day", cls: "bg-blue-500/12 text-blue-400" },
    deliberated: { label: "Deliberated", cls: "bg-amber-500/12 text-amber-400" },
    no_click: { label: "No click on record", cls: "bg-neutral-700 text-neutral-400" },
  };
  const { label, cls } = map[bucket] ?? { label: bucket, cls: "bg-neutral-700 text-neutral-400" };
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold", cls)}>{label}</span>
  );
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
        copied
          ? "border-emerald-500 text-emerald-400"
          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function CampaignDetailDrawer({
  campaign,
  venueId,
  currency,
  onClose,
  onToggle,
  onDuplicate,
}: {
  campaign: CampaignListItem;
  venueId: string;
  currency?: string;
  onClose: () => void;
  onToggle: (id: string, active: boolean) => void;
  onDuplicate: (c: CampaignListItem) => void;
}) {
  void venueId;
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [linksOpen, setLinksOpen] = useState(true);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<CampaignDetail>(`/api/admin/marketing-campaigns/${campaign.id}`)
      .then((d) => setDetail(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaign.id]);

  async function handleToggle() {
    setToggling(true);
    try {
      await api.patch(`/api/admin/marketing-campaigns/${campaign.id}`, {
        isActive: !campaign.isActive,
      });
      onToggle(campaign.id, !campaign.isActive);
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(false);
    }
  }

  const baseUrl =
    (typeof window !== "undefined" && process.env.NEXT_PUBLIC_COURTPASS_URL) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const link = `${baseUrl}/book?promo=${campaign.code}`;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/55 animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-[640px] max-w-[92vw] overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-neutral-800 bg-neutral-950 px-6 py-5">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <h3 className="text-base font-bold">{campaign.name}</h3>
              <StatusPill status={campaign.status} />
            </div>
            <p className="text-xs text-neutral-500">
              <code className="font-mono text-neutral-400">{campaign.code}</code>
              {campaign.topChannel && (
                <> · <span className="capitalize">{campaign.topChannel}</span></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                campaign.isActive
                  ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  : "bg-purple-600/20 text-purple-400 hover:bg-purple-600/30"
              )}
            >
              {campaign.isActive
                ? <ToggleRight className="w-3.5 h-3.5" />
                : <ToggleLeft className="w-3.5 h-3.5" />}
              {campaign.isActive ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={() => onDuplicate(campaign)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 px-2.5 py-1.5 text-xs font-semibold transition-colors"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              Duplicate
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Redemptions", value: String(campaign.redemptionCount) },
              { label: "Revenue", value: fmtPrice(campaign.totalRevenue, currency) },
              {
                label: "Median time to convert",
                value: detail?.medianTimeToConvertMs != null
                  ? detail.medianTimeToConvertMs < 3_600_000
                    ? `${Math.round(detail.medianTimeToConvertMs / 60_000)}m`
                    : `${Math.round(detail.medianTimeToConvertMs / 3_600_000)}h ${Math.round((detail.medianTimeToConvertMs % 3_600_000) / 60_000)}m`
                  : "—",
              },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5">
                <p className="text-[11px] text-neutral-500 font-medium mb-1.5">{k.label}</p>
                <p className="text-lg font-bold tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Campaign links — collapsible */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            {/* Section header / toggle */}
            <button
              type="button"
              onClick={() => setLinksOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-800/50 transition-colors"
            >
              <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                Ready-to-use links by channel
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-neutral-500 transition-transform duration-200",
                  linksOpen ? "rotate-180" : "rotate-0"
                )}
              />
            </button>

            {linksOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-neutral-800">
                {CHANNELS.map((ch) => {
                  const url = `${baseUrl}/book?promo=${encodeURIComponent(campaign.code)}&utm_source=${ch.key}`;
                  return (
                    <div
                      key={ch.key}
                      className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-800/60 px-3 py-2.5 mt-2"
                    >
                      <div
                        className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={{ background: ch.bg, color: ch.color }}
                      >
                        {ch.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-bold" style={{ color: ch.color }}>{ch.label}</p>
                        <p className="text-[10.5px] font-mono text-neutral-500 truncate" title={url}>
                          …?promo=<span className="text-neutral-400">{campaign.code}</span>
                          &amp;utm_source=<span style={{ color: ch.color }}>{ch.key}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(url).then(() => {
                            setCopiedChannel(ch.key);
                            setTimeout(() => setCopiedChannel(null), 1500);
                          });
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold flex-shrink-0 transition-colors",
                          copiedChannel === ch.key
                            ? "border-emerald-500 text-emerald-400"
                            : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                        )}
                      >
                        {copiedChannel === ch.key ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                        {copiedChannel === ch.key ? "Copied" : "Copy"}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-600 hover:text-white transition-colors flex-shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Details grid */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800 text-sm">
            {[
              {
                label: "Discount",
                value: campaign.discountType === "free"
                  ? "Free (100% off)"
                  : campaign.discountType === "percent"
                  ? `${campaign.discountValue}% off`
                  : fmtPrice(campaign.discountValue ?? 0, currency),
              },
              { label: "Applies to", value: campaign.appliesTo.replace(/_/g, " ") },
              {
                label: "Cap",
                value: campaign.maxRedemptions != null
                  ? `${campaign.redemptionCount} / ${campaign.maxRedemptions}`
                  : "Unlimited",
              },
              { label: "Top channel", value: campaign.topChannel ?? "—" },
              { label: "Starts", value: fmtDate(campaign.startsAt) },
              { label: "Ends", value: campaign.endsAt ? fmtDate(campaign.endsAt) : "No end date" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between px-4 py-2.5">
                <span className="text-neutral-500">{label}</span>
                <span className="font-medium capitalize">{value}</span>
              </div>
            ))}
          </div>

          {/* Redemptions table */}
          <div>
            <h4 className="font-bold text-sm mb-1">Redeemed by</h4>
            <p className="text-xs text-neutral-500 mb-3">
              First click to redemption. Instant = same session, Same day = returned within 24h, Deliberated = 24h+.
            </p>
            {loading ? (
              <p className="text-center py-8 text-neutral-500 text-sm">Loading…</p>
            ) : detail && detail.redemptions.length > 0 ? (
              <div className="rounded-xl border border-neutral-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-900/80 border-b border-neutral-800">
                      <th className="px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-widest text-neutral-500 font-semibold">Player</th>
                      <th className="px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-widest text-neutral-500 font-semibold">Redeemed</th>
                      <th className="px-3.5 py-2.5 text-right text-[10.5px] uppercase tracking-widest text-neutral-500 font-semibold">Amount</th>
                      <th className="px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-widest text-neutral-500 font-semibold">First click → order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {detail.redemptions.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="px-3.5 py-2.5">
                          <p className="font-semibold text-[12.5px]">{r.playerName}</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">{r.playerPhone}</p>
                        </td>
                        <td className="px-3.5 py-2.5 text-[12.5px] text-neutral-400">
                          {new Date(r.redeemedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-[12.5px] font-semibold tabular-nums">
                          {fmtPrice(r.discountAmount, currency)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <ConvertBadge bucket={r.convertBucket} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !loading ? (
              <p className="text-center py-6 text-neutral-500 text-sm">No redemptions yet</p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Campaigns Tab ─────────────────────────────────────────────────────────────

function CampaignsTab({
  campaigns,
  loading,
  currency,
  onSelect,
}: {
  campaigns: CampaignListItem[];
  loading: boolean;
  currency?: string;
  onSelect: (c: CampaignListItem) => void;
}) {
  if (loading) return <p className="text-center py-16 text-neutral-500">Loading…</p>;

  if (!campaigns.length) {
    return (
      <div className="text-center py-20 text-neutral-500">
        <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p>No campaigns yet. Create your first one →</p>
      </div>
    );
  }

  const totalRedemptions = campaigns.reduce((s, c) => s + c.redemptionCount, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.totalRevenue, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.totalClicks, 0);
  const active = campaigns.filter((c) => c.status === "active").length;
  const convRate = totalClicks > 0 ? ((totalRedemptions / totalClicks) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active links", value: String(active), sub: `${campaigns.filter(c => c.status === "scheduled").length} scheduled`, icon: <Megaphone className="w-4 h-4 text-purple-400" /> },
          { label: "Total redemptions", value: String(totalRedemptions), sub: "all time", icon: <Users className="w-4 h-4 text-blue-400" /> },
          { label: "Revenue generated", value: fmtPrice(totalRevenue, currency), sub: "all time", icon: <TrendingUp className="w-4 h-4 text-emerald-400" /> },
          { label: "Avg conversion", value: `${convRate}%`, sub: "click → booking", icon: <BarChart3 className="w-4 h-4 text-amber-400" /> },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              {k.icon}
              <p className="text-xs text-neutral-500 font-medium">{k.label}</p>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{k.value}</p>
            <p className="text-[11.5px] text-neutral-500 mt-1.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-sm font-bold">All campaigns</h2>
        </div>
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/40">
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Campaign</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest text-neutral-500 font-semibold hidden md:table-cell">Channel</th>
                <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Status</th>
                <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest text-neutral-500 font-semibold hidden sm:table-cell">Clicks</th>
                <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">Redeemed / Cap</th>
                <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest text-neutral-500 font-semibold hidden md:table-cell">Revenue</th>
                <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest text-neutral-500 font-semibold hidden lg:table-cell">Ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="cursor-pointer hover:bg-neutral-800/30 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{c.name}</p>
                    <code className="text-[11.5px] font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                      {c.code}
                    </code>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {c.topChannel ? <ChannelBadge channel={c.topChannel} /> : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-4 py-3.5"><StatusPill status={c.status} /></td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold hidden sm:table-cell text-neutral-300">
                    {c.totalClicks > 0 ? c.totalClicks.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-neutral-300">
                    {c.redemptionCount}
                    {c.maxRedemptions != null
                      ? <span className="text-neutral-600"> / {c.maxRedemptions}</span>
                      : <span className="text-neutral-600"> / ∞</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-neutral-300 hidden md:table-cell">
                    {c.totalRevenue > 0 ? fmtPrice(c.totalRevenue, currency) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right text-neutral-400 hidden lg:table-cell">
                    {c.endsAt ? fmtDate(c.endsAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Create Tab ────────────────────────────────────────────────────────────────

const CHANNELS = [
  { key: "facebook", label: "Facebook", color: "#3b82f6", bg: "rgba(59,130,246,0.14)", icon: "f" },
  { key: "instagram", label: "Instagram", color: "#a855f7", bg: "rgba(168,85,247,0.14)", icon: "ig" },
  { key: "whatsapp", label: "WhatsApp", color: "#10b981", bg: "rgba(16,185,129,0.14)", icon: "wa" },
  { key: "zalo", label: "Zalo", color: "#3b82f6", bg: "rgba(59,130,246,0.14)", icon: "z" },
  { key: "direct", label: "Direct / Other", color: "#a3a3a3", bg: "rgba(163,163,163,0.14)", icon: "→" },
] as const;

interface CreatePrefill {
  name: string;
  discountType: "percent" | "fixed" | "free";
  discountValue: string;
  appliesTo: string;
  maxRedemptions: string;
  maxRedemptionsPerPlayer: string;
  postText: string;
  headline: string;
}

function CreateTab({
  venueId,
  currency,
  prefill,
  onCreated,
}: {
  venueId: string;
  currency?: string;
  prefill?: CreatePrefill;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    code: "",
    discountType: (prefill?.discountType ?? "percent") as "percent" | "fixed" | "free",
    discountValue: prefill?.discountValue ?? "",
    appliesTo: prefill?.appliesTo ?? "all",
    maxRedemptions: prefill?.maxRedemptions ?? "",
    maxRedemptionsPerPlayer: prefill?.maxRedemptionsPerPlayer ?? "1",
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: "",
    postText: prefill?.postText ?? "",
    headline: prefill?.headline ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_COURTPASS_URL || window.location.origin
      : "";

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function channelLink(ch: string) {
    const code = form.code.trim().toUpperCase() || "CODE";
    return `${baseUrl}/book?promo=${encodeURIComponent(code)}&utm_source=${ch}`;
  }

  function discountDisplay() {
    if (form.discountType === "free") return "FREE";
    const val = form.discountValue || "?";
    if (form.discountType === "fixed") return `${val} ${currency ?? ""} OFF`.trim();
    return `${val}% OFF`;
  }

  function copyAll() {
    const links = CHANNELS.map((c) => `${c.label}: ${channelLink(c.key)}`).join("\n");
    navigator.clipboard.writeText(links).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await api.post("/api/admin/marketing-campaigns", {
        venueId,
        name: form.name,
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue:
          form.discountType !== "free" && form.discountValue ? Number(form.discountValue) : null,
        appliesTo: form.appliesTo,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        maxRedemptionsPerPlayer: Number(form.maxRedemptionsPerPlayer),
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        postText: form.postText || null,
        headline: form.headline || null,
      });
      onCreated();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-700 bg-neutral-800 text-white px-3 py-2 text-[13.5px] font-[inherit] placeholder-neutral-500 focus:border-purple-500 focus:outline-none transition-colors";
  const labelCls = "block text-[12.5px] font-semibold text-neutral-400 mb-1.5";
  const hintCls = "text-[11.5px] text-neutral-600 mt-1";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
      {/* Left — form */}
      <div className="space-y-4">
        {saveError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
            {saveError}
          </div>
        )}

        {/* Campaign details card */}
        <form id="create-form" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <h3 className="text-[13px] font-bold">Campaign details</h3>

            <div>
              <label className={labelCls}>Campaign name</label>
              <input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
                placeholder="Weekend Warmup 20%"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Promo code</label>
                <input
                  required
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                  className={cn(inputCls, "font-mono uppercase")}
                  placeholder="WARMUP20"
                  maxLength={32}
                />
                <p className={hintCls}>Players enter this or land via link</p>
              </div>
              <div>
                <label className={labelCls}>Discount type</label>
                <select
                  value={form.discountType}
                  onChange={(e) => set("discountType", e.target.value as typeof form.discountType)}
                  className={inputCls}
                >
                  <option value="percent">Percent off</option>
                  <option value="fixed">Fixed amount off</option>
                  <option value="free">Free (100% off)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  {form.discountType === "percent"
                    ? "Discount value"
                    : form.discountType === "fixed"
                    ? `Amount off (${currency ?? "venue currency"})`
                    : "Discount value"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={form.discountType === "percent" ? 100 : undefined}
                  required={form.discountType !== "free"}
                  disabled={form.discountType === "free"}
                  value={form.discountValue}
                  onChange={(e) => set("discountValue", e.target.value)}
                  className={cn(inputCls, form.discountType === "free" && "opacity-40 cursor-not-allowed")}
                  placeholder={form.discountType === "free" ? "Not applicable" : form.discountType === "percent" ? "20" : "50000"}
                />
                <p className={hintCls}>
                  {form.discountType === "free"
                    ? "Free applies 100% off, no value needed"
                    : form.discountType === "fixed"
                    ? `Fixed ${currency ?? ""} amount`.trim()
                    : "Percent, e.g. 20 for 20% off"}
                </p>
              </div>
              <div>
                <label className={labelCls}>Applies to</label>
                <select
                  value={form.appliesTo}
                  onChange={(e) => set("appliesTo", e.target.value)}
                  className={inputCls}
                >
                  <option value="all">All bookings</option>
                  <option value="court_booking">Court bookings</option>
                  <option value="coaching">Coaching sessions</option>
                  <option value="open_play">Open play</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start date</label>
                <input
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>End date</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Max redemptions</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => set("maxRedemptions", e.target.value)}
                  className={inputCls}
                  placeholder="Unlimited"
                />
                <p className={hintCls}>Total times this code can be used, across all players</p>
              </div>
              <div>
                <label className={labelCls}>Max per player</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptionsPerPlayer}
                  onChange={(e) => set("maxRedemptionsPerPlayer", e.target.value)}
                  className={inputCls}
                />
                <p className={hintCls}>How many times one player can redeem it</p>
              </div>
            </div>
          </div>

          {/* Ad copy card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4 mt-4">
            <h3 className="text-[13px] font-bold">Ad copy</h3>
            <div>
              <label className={labelCls}>Post text</label>
              <input
                value={form.postText}
                onChange={(e) => set("postText", e.target.value)}
                className={inputCls}
                placeholder="Courts are calling. Book this weekend and save 20% on your session."
              />
            </div>
            <div>
              <label className={labelCls}>Headline shown on link card</label>
              <input
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                className={inputCls}
                placeholder="20% off weekend court bookings"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Right — sticky preview */}
      <div className="sticky top-6 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Live preview</p>

        {/* Facebook card */}
        <div className="rounded-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" style={{ background: "#fff", color: "#050505" }}>
          {/* FB header */}
          <div className="flex items-center gap-2 px-3.5 py-3">
            <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg,#10b981,#3b82f6)" }} />
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "#050505" }}>002 Pickleball Club</p>
              <p style={{ fontSize: 11.5, color: "#65676b" }}>Sponsored · facebook</p>
            </div>
          </div>
          {/* Post body */}
          {form.postText && (
            <p style={{ fontSize: 13.5, color: "#050505", padding: "0 14px 10px", lineHeight: 1.4 }}>
              {form.postText}
            </p>
          )}
          {/* Image area */}
          <div
            style={{
              height: 160,
              background: "linear-gradient(135deg,#171717,#262626)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "repeating-linear-gradient(45deg,rgba(168,85,247,0.06) 0 2px,transparent 2px 40px)",
              }}
            />
            <div style={{ textAlign: "center", position: "relative", zIndex: 1, padding: "0 20px" }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.02em" }}>
                {discountDisplay()}
              </p>
              {form.code && (
                <p style={{ fontSize: 12, color: "#a855f7", fontWeight: 700, marginTop: 4, letterSpacing: "0.04em" }}>
                  CODE: {form.code.trim().toUpperCase()}
                </p>
              )}
            </div>
          </div>
          {/* Domain bar */}
          <div style={{ background: "#f0f2f5", padding: "9px 14px" }}>
            <p style={{ fontSize: 10.5, textTransform: "uppercase", color: "#65676b", letterSpacing: "0.03em" }}>
              courtpass.thecourtflow.com
            </p>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 2 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#050505" }}>
                {form.headline || "Book your court now"}
              </p>
              <span style={{ background: "#e4e6eb", color: "#050505", fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 5, flexShrink: 0, marginLeft: 8 }}>
                Book Now
              </span>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: "flex", borderTop: "1px solid #e4e6eb", padding: "4px 8px" }}>
            {["👍 Like", "💬 Comment", "↗ Share"].map((a) => (
              <div key={a} style={{ flex: 1, textAlign: "center", padding: 7, fontSize: 12.5, fontWeight: 600, color: "#65676b" }}>{a}</div>
            ))}
          </div>
        </div>

        {/* Channel links */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">Ready-to-use links by channel</p>
          <div className="space-y-2">
            {CHANNELS.map((ch) => {
              const url = channelLink(ch.key);
              return (
                <div key={ch.key} className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-800 px-3 py-2.5">
                  <div
                    className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: ch.bg, color: ch.color }}
                  >
                    {ch.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-bold" style={{ color: ch.color }}>{ch.label}</p>
                    <p className="text-[10.5px] font-mono text-neutral-500 truncate" title={url}>
                      …?promo=<span className="text-neutral-400">{form.code.trim().toUpperCase() || "CODE"}</span>
                      &amp;utm_source=<span style={{ color: ch.color }}>{ch.key}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(url).then(() => {
                        setCopiedChannel(ch.key);
                        setTimeout(() => setCopiedChannel(null), 1500);
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold flex-shrink-0 transition-colors",
                      copiedChannel === ch.key
                        ? "border-emerald-500 text-emerald-400"
                        : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                    )}
                  >
                    {copiedChannel === ch.key ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                    {copiedChannel === ch.key ? "Copied" : "Copy"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end mt-2.5">
            <button
              type="button"
              onClick={copyAll}
              className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {copiedAll ? "Copied all links" : "Copy all as list"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          form="create-form"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? "Launching…" : "Launch campaign"}
        </button>
      </div>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ venueId, currency }: { venueId: string; currency?: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<AnalyticsData>(`/api/admin/marketing-campaigns/analytics?venueId=${venueId}&range=${range}`)
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [venueId, range]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-center py-16 text-neutral-500">Loading…</p>;
  if (!data) return null;

  const CHANNEL_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#f59e0b", "#a3a3a3"];

  return (
    <div className="space-y-5">
      {/* Range */}
      <div className="flex items-center gap-1.5">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              range === d ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Top charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Redemptions by day */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-[13px] font-bold mb-5">Redemptions by day</h3>
          {data.redemptionsByDay.length > 0 ? (
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.redemptionsByDay} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: "#525252", fontSize: 10.5 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#525252", fontSize: 10.5 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#171717", border: "1px solid #2e2e2e", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="#a855f7" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center py-10 text-neutral-600 text-sm">No data yet</p>
          )}
        </div>

        {/* Channel split */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-[13px] font-bold mb-5">Channel split</h3>
          {data.channelSplit.length > 0 ? (
            <div className="space-y-3">
              {data.channelSplit.map((ch, i) => (
                <div key={ch.channel} className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
                  />
                  <span className="text-[12.5px] text-neutral-400 flex-1 capitalize">{ch.channel}</span>
                  <span className="text-[12.5px] font-bold tabular-nums">{ch.pct}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-10 text-neutral-600 text-sm">No click data yet</p>
          )}
        </div>
      </div>

      {/* Bottom charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Funnel */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-[13px] font-bold mb-5">Conversion funnel</h3>
          {(() => {
            const maxClicks = data.totalClicks;
            const funnelSteps = [
              { label: "Link clicks", value: data.totalClicks, color: "#a855f7", known: true },
              { label: "Reached booking", value: null, color: "#f59e0b", known: false },
              { label: "Started checkout", value: null, color: "#3b82f6", known: false },
              { label: "Redeemed", value: data.totalRedemptions, color: "#10b981", known: true },
            ];
            return (
          <div className="space-y-2.5">
            {funnelSteps.map((step) => {
              // Width: proportional to maxClicks; 0 when value is 0; null = unknown
              const pct = !step.known
                ? null
                : maxClicks === 0
                ? 0
                : step.value === 0
                ? 0
                : Math.max(4, Math.round(((step.value ?? 0) / maxClicks) * 100));
              return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="text-[12px] text-neutral-400 w-24 flex-shrink-0">{step.label}</span>
                <div className="flex-1 h-6 rounded-md bg-neutral-800 overflow-hidden">
                  {pct === null ? (
                    <div className="h-full flex items-center pl-2.5">
                      <span className="text-[11px] text-neutral-600 italic">Requires funnel tracking</span>
                    </div>
                  ) : pct === 0 ? (
                    <div className="h-full" />
                  ) : (
                    <div
                      className="h-full rounded-md flex items-center pl-2.5 text-[11.5px] font-bold text-white"
                      style={{ width: `${pct}%`, background: step.color }}
                    >
                      {step.value != null ? step.value.toLocaleString() : ""}
                    </div>
                  )}
                </div>
                <span className="text-[12.5px] font-bold w-10 text-right tabular-nums text-neutral-300">
                  {step.value != null ? step.value.toLocaleString() : "—"}
                </span>
              </div>
              );
            })}
          </div>
            );
          })()}
        </div>

        {/* Recent redemptions */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-[13px] font-bold mb-4">Recent redemptions</h3>
          {data.recentRedemptions.length > 0 ? (
            <div className="divide-y divide-neutral-800">
              {data.recentRedemptions.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-neutral-400 flex-shrink-0">
                      {initials(r.playerName)}
                    </div>
                    <div>
                      <p className="text-[12.5px] font-semibold">{r.playerName}</p>
                      <p className="text-[11px] text-neutral-500">
                        {new Date(r.redeemedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        <code className="font-mono text-[10.5px] text-neutral-500">{r.promoCode}</code>
                      </p>
                    </div>
                  </div>
                  <span className="text-[12.5px] font-bold text-emerald-400 tabular-nums flex-shrink-0">
                    −{fmtPrice(r.discountAmount, currency)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-10 text-neutral-600 text-sm">No redemptions yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketingCampaignsPage() {
  void adminI18n;
  const { t } = useTranslation();
  const { venueId: selectedVenueId, setVenueId, venues } = useAdminVenuePicker();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignListItem | null>(null);
  const [createPrefill, setCreatePrefill] = useState<CreatePrefill | undefined>(undefined);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId);
  const currency = selectedVenue?.currency;

  const loadCampaigns = useCallback(() => {
    if (!selectedVenueId) return;
    setLoadingCampaigns(true);
    api
      .get<CampaignListItem[]>(`/api/admin/marketing-campaigns?venueId=${selectedVenueId}`)
      .then((d) => setCampaigns(d))
      .catch(console.error)
      .finally(() => setLoadingCampaigns(false));
  }, [selectedVenueId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  function handleToggle(id: string, newActive: boolean) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, isActive: newActive, status: (newActive ? "active" : "ended") as "active" | "scheduled" | "ended" }
          : c
      )
    );
    if (selectedCampaign?.id === id) {
      setSelectedCampaign((prev) => (prev ? { ...prev, isActive: newActive } : null));
    }
  }

  function handleDuplicate(c: CampaignListItem) {
    setCreatePrefill({
      name: `${c.name} (copy)`,
      discountType: c.discountType,
      discountValue: c.discountValue != null ? String(c.discountValue) : "",
      appliesTo: c.appliesTo,
      maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : "",
      maxRedemptionsPerPlayer: "1",
      postText: "",
      headline: "",
    });
    setSelectedCampaign(null);
    setTab("create");
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "campaigns", label: "Campaigns" },
    { key: "create", label: "Create" },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6 min-h-full bg-neutral-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-8 py-[18px]">
        <div>
          <div className="flex items-center gap-2.5">
            <Megaphone className="w-4 h-4 text-purple-400" />
            <h1 className="text-[17px] font-bold tracking-tight">{t("nav.marketingCampaigns")}</h1>
          </div>
          <p className="text-[12.5px] text-neutral-500 mt-0.5">Promo links, redemptions, and acquisition performance</p>
        </div>
        <AdminVenuePicker venueId={selectedVenueId} venues={venues} onChange={setVenueId} />
      </div>

      <div className="px-8 py-6 max-w-[1180px] space-y-6">
        {!selectedVenueId ? (
          <div className="flex flex-col items-center justify-center py-32 text-neutral-500 gap-3">
            <Megaphone className="w-8 h-8 opacity-20" />
            <p>Select a venue to manage campaigns.</p>
          </div>
        ) : (
          <>
            {/* Tab pills + CTA on the same row */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
                {TABS.map((tb) => (
                  <button
                    key={tb.key}
                    onClick={() => { if (tb.key !== "create") setCreatePrefill(undefined); setTab(tb.key); }}
                    className={cn(
                      "rounded-lg px-4 py-2 text-[13px] font-semibold transition-all",
                      tab === tb.key
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-500 hover:text-neutral-300"
                    )}
                  >
                    {tb.label}
                    {tb.key === "campaigns" && campaigns.length > 0 && (
                      <span className="ml-1.5 text-[11px] text-neutral-500">({campaigns.length})</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setCreatePrefill(undefined); setTab("create"); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors flex-shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                New campaign
              </button>
            </div>

            {tab === "campaigns" && (
              <>
                <CampaignsTab
                  campaigns={campaigns}
                  loading={loadingCampaigns}
                  currency={currency}
                  onSelect={setSelectedCampaign}
                />
              </>
            )}

            {tab === "create" && (
              <CreateTab
                venueId={selectedVenueId}
                currency={currency}
                prefill={createPrefill}
                onCreated={() => {
                  setCreatePrefill(undefined);
                  loadCampaigns();
                  setTab("campaigns");
                }}
              />
            )}

            {tab === "analytics" && (
              <AnalyticsTab venueId={selectedVenueId} currency={currency} />
            )}
          </>
        )}
      </div>

      {/* Detail drawer */}
      {selectedCampaign && (
        <CampaignDetailDrawer
          campaign={selectedCampaign}
          venueId={selectedVenueId!}
          currency={currency}
          onClose={() => setSelectedCampaign(null)}
          onToggle={handleToggle}
          onDuplicate={handleDuplicate}
        />
      )}
    </div>
  );
}
