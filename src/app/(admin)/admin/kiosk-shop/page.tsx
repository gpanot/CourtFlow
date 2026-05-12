"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { VIETQR_BANKS, buildVietQRUrl } from "@/lib/vietqr";
import {
  Check,
  CreditCard,
  Loader2,
  Plus,
  Trash2,
  Save,
  Sticker,
  ShoppingBag,
  Layers,
  X,
  ExternalLink,
  BarChart2,
  Receipt,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PlayerDetailStickersTab } from "@/components/admin/player-detail-stickers-tab";
import dynamic from "next/dynamic";

// Recharts — client-only (SSR off to avoid window errors)
const BarChartComponent = dynamic(() => import("recharts").then((m) => {
  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = m;
  function StickerBarChart({ data }: { data: { date: string; scans: number; purchases: number }[] }) {
    const fmt = (d: string) => { const [,mm,dd] = d.split("-"); return `${dd}/${mm}`; };
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.map(d => ({ ...d, label: fmt(d.date) }))} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
          <Tooltip
            contentStyle={{ background: "#171717", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e5e5e5", marginBottom: 4 }}
            itemStyle={{ color: "#a3a3a3" }}
          />
          <Bar dataKey="scans" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Scans" />
          <Bar dataKey="purchases" fill="#4ade80" radius={[3, 3, 0, 0]} name="Purchases" />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return { default: StickerBarChart };
}), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-neutral-600" /></div> });

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KioskSettingsData {
  stickerPrice: number;
  bankBin: string;
  bankAccount: string;
  bankOwnerName: string;
}

interface StickerTemplateRow {
  id: string;
  name: string;
  malePrompt: string;
  femalePrompt: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftTemplate {
  draftId: string;
  name: string;
  malePrompt: string;
  femalePrompt: string;
}

type ActiveTab = "stickers" | "explorer" | "stats" | "purchases";

// ---------------------------------------------------------------------------
// Stats types
// ---------------------------------------------------------------------------
interface StickerStats {
  scansTotal: number;
  scansToday: number;
  scansThisWeek: number;
  packsGenerated: number;
  purchasesTotal: number;
  purchasesToday: number;
  revenueTotal: number;
  revenueToday: number;
  conversionRate: number;
  last7Days: { date: string; scans: number; purchases: number; revenue: number }[];
}

// ---------------------------------------------------------------------------
// Purchase types
// ---------------------------------------------------------------------------
interface Purchase {
  id: string;
  sepayId: number;
  paymentCode: string;
  transferAmount: number;
  content: string;
  processedAt: string;
  playerName: string | null;
  playerPhone: string | null;
  playerId: string | null;
}

// ---------------------------------------------------------------------------
// Explorer types
// ---------------------------------------------------------------------------

interface ExplorerPack {
  packId: string;
  playerId: string;
  playerName: string;
  playerGender: string;
  playerFacePhotoPath: string | null;
  playerAvatarPhotoPath: string | null;
  playerPhone: string;
  checkInCount: number;
  sticker1Url: string | null;
  sticker2Url: string | null;
  sticker3Url: string | null;
  sticker4Url: string | null;
  isPaid: boolean;
  createdAt: string;
}

interface ExplorerPlayer {
  id: string;
  name: string;
  gender: string;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
}

// ---------------------------------------------------------------------------
// Player Stickers Slide-over
// ---------------------------------------------------------------------------

function PlayerStickerSlideOver({
  player,
  onClose,
}: {
  player: ExplorerPlayer;
  onClose: () => void;
}) {
  const photoPath = player.avatarPhotoPath ?? player.facePhotoPath ?? null;
  const initial = player.name.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl animate-in slide-in-from-right overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center">
              {photoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPath} alt={player.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-neutral-400">{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{player.name}</p>
              <p className="text-[11px] text-neutral-500 capitalize">{player.gender}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stickers tab content */}
        <PlayerDetailStickersTab
          playerId={player.id}
          facePhotoPath={player.facePhotoPath}
          playerFirstName={player.name.split(" ")[0]}
          playerGender={player.gender}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticker Explorer Tab
// ---------------------------------------------------------------------------

type GenderFilter = "all" | "male" | "female";

function StickerExplorerTab({ token }: { token: string }) {
  const [packs, setPacks] = useState<ExplorerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [detailPlayer, setDetailPlayer] = useState<ExplorerPlayer | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/sticker-explorer", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: ExplorerPack[]) => setPacks(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    if (genderFilter === "all") return packs;
    return packs.filter((p) => p.playerGender === genderFilter);
  }, [packs, genderFilter]);

  const counts = useMemo(() => ({
    all: packs.length,
    male: packs.filter((p) => p.playerGender === "male").length,
    female: packs.filter((p) => p.playerGender === "female").length,
  }), [packs]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const filterBtnCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium transition-colors ${
      active
        ? "bg-purple-600 text-white"
        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
    }`;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 pb-4 flex-wrap">
        <button type="button" className={filterBtnCls(genderFilter === "all")} onClick={() => setGenderFilter("all")}>
          All ({counts.all})
        </button>
        <button type="button" className={filterBtnCls(genderFilter === "male")} onClick={() => setGenderFilter("male")}>
          Male ({counts.male})
        </button>
        <button type="button" className={filterBtnCls(genderFilter === "female")} onClick={() => setGenderFilter("female")}>
          Female ({counts.female})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-neutral-600">
          <Layers className="h-10 w-10 opacity-40" />
          <p className="text-sm">No sticker packs found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((pack) => {
            const photoSrc = pack.playerAvatarPhotoPath ?? pack.playerFacePhotoPath ?? null;
            const stickers = [pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url];
            const allMissing = stickers.every((s) => !s);

            return (
              <div
                key={pack.packId}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-3"
              >
                {/* Player row */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDetailPlayer({
                        id: pack.playerId,
                        name: pack.playerName,
                        gender: pack.playerGender,
                        facePhotoPath: pack.playerFacePhotoPath,
                        avatarPhotoPath: pack.playerAvatarPhotoPath,
                      })
                    }
                    className="flex items-center gap-2 min-w-0 group"
                  >
                    {/* Avatar */}
                    <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center">
                      {photoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoSrc} alt={pack.playerName} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-neutral-400">
                          {pack.playerName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Name + gender */}
                    <div className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium text-neutral-200 group-hover:text-purple-300 transition-colors">
                        {pack.playerName}
                      </span>
                      <span className={`text-[10px] capitalize ${pack.playerGender === "female" ? "text-pink-400" : pack.playerGender === "male" ? "text-blue-400" : "text-neutral-500"}`}>
                        {pack.playerGender}
                      </span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600 group-hover:text-purple-400 transition-colors" />
                  </button>

                  {/* Paid badge */}
                  {pack.isPaid && (
                    <span className="shrink-0 rounded-full bg-green-900/50 px-2 py-0.5 text-[10px] font-medium text-green-400">
                      Paid
                    </span>
                  )}
                </div>

                {/* Sticker grid */}
                {allMissing ? (
                  <div className="h-16 rounded-lg border border-dashed border-neutral-700 flex items-center justify-center">
                    <span className="text-[11px] text-neutral-600">No stickers yet</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {stickers.map((url, i) => (
                      <div
                        key={i}
                        className="relative aspect-square rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center"
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={`Sticker ${i + 1}`}
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-neutral-700">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Date + check-in count */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-neutral-600">{fmtDate(pack.createdAt)}</p>
                  <span className="text-[10px] text-neutral-500 tabular-nums">
                    {pack.checkInCount} session{pack.checkInCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Player detail slide-over */}
      {detailPlayer && (
        <PlayerStickerSlideOver
          player={detailPlayer}
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Payment Settings Section
// ---------------------------------------------------------------------------

function PaymentSettingsSection({
  token,
}: {
  token: string;
}) {
  const [price, setPrice] = useState("");
  const [bankBin, setBankBin] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankOwnerName, setBankOwnerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/kiosk-settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as KioskSettingsData;
        setPrice(data.stickerPrice ? String(data.stickerPrice) : "");
        setBankBin(data.bankBin || "");
        setBankAccount(data.bankAccount || "");
        setBankOwnerName(data.bankOwnerName || "");
      } catch {
        // silent
      } finally {
        setLoaded(true);
      }
    })();
  }, [token]);

  const qrPreviewUrl = useMemo(() => {
    if (!bankBin || !bankAccount) return null;
    return buildVietQRUrl({
      bankBin,
      accountNumber: bankAccount,
      accountName: bankOwnerName,
      amount: Number(price) || 30000,
      description: "Sticker Pack",
    });
  }, [bankBin, bankAccount, bankOwnerName, price]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/kiosk-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stickerPrice: price ? parseInt(price, 10) : 30000,
          bankBin,
          bankAccount,
          bankOwnerName,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-green-400" />
        <p className="text-sm font-medium text-neutral-200">Payment Settings</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">Sticker Price (VND)</label>
          <input
            type="text"
            inputMode="numeric"
            value={price ? Number(price).toLocaleString("en") : ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setPrice(raw);
            }}
            placeholder="30,000"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">Bank</label>
          <select
            value={bankBin}
            onChange={(e) => setBankBin(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="">— select —</option>
            {VIETQR_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name} — {b.bin}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">Account Number</label>
          <input
            type="text"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            placeholder="Account #"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">Account Owner Name</label>
          <input
            type="text"
            value={bankOwnerName}
            onChange={(e) => setBankOwnerName(e.target.value)}
            placeholder="Account name"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>

      {/* QR Preview */}
      {qrPreviewUrl ? (
        <button
          type="button"
          onClick={() => setQrExpanded((v) => !v)}
          className={
            qrExpanded
              ? "flex w-full flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-black/40 p-3 transition-all"
              : "flex w-full items-start gap-3 rounded-lg border border-neutral-800 bg-black/40 p-2 text-left transition-all"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrPreviewUrl}
            alt="VietQR preview"
            className={
              qrExpanded
                ? "w-full max-w-xs rounded-md bg-white object-contain transition-all"
                : "h-24 w-24 shrink-0 rounded-md bg-white object-contain transition-all"
            }
          />
          <div className={qrExpanded ? "w-full space-y-0.5 text-center" : "min-w-0 flex-1 space-y-0.5 pt-1"}>
            <p className="text-[11px] font-medium text-purple-400">
              {qrExpanded ? "Tap to collapse" : "QR Preview"}
            </p>
            <p className="truncate text-xs text-neutral-300">
              {VIETQR_BANKS.find((b) => b.bin === bankBin)?.name}
            </p>
            <p className="truncate text-xs text-neutral-500">{bankAccount}</p>
            <p className="truncate text-xs text-neutral-500">{bankOwnerName}</p>
            <p className="text-xs text-neutral-400">
              {Number(price || 30000).toLocaleString("vi-VN")} VND
            </p>
          </div>
        </button>
      ) : bankBin || bankAccount ? (
        <p className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-400">
          Fill bank, account # and price to see QR preview
        </p>
      ) : null}

      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saved && <Check className="h-3.5 w-3.5" />}
        {saved ? "Saved!" : "Save Payment Settings"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Row (existing saved template)
// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  token,
  onDeleted,
}: {
  template: StickerTemplateRow;
  token: string;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(template.name);
  const [malePrompt, setMalePrompt] = useState(template.malePrompt);
  const [femalePrompt, setFemalePrompt] = useState(template.femalePrompt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDirty =
    name !== template.name ||
    malePrompt !== template.malePrompt ||
    femalePrompt !== template.femalePrompt;

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/sticker-templates/${template.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, malePrompt, femalePrompt }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete template "${name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/sticker-templates/${template.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDeleted(template.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 space-y-3">
      {/* Name row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm font-medium text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-red-700 hover:bg-red-950/40 hover:text-red-400 transition-colors disabled:opacity-50"
          title="Delete template"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Prompts grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-blue-400">Male Prompt</label>
          <textarea
            value={malePrompt}
            onChange={(e) => setMalePrompt(e.target.value)}
            rows={5}
            placeholder="Prompt for male players..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-pink-400">Female Prompt</label>
          <textarea
            value={femalePrompt}
            onChange={(e) => setFemalePrompt(e.target.value)}
            rows={5}
            placeholder="Prompt for female players..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-pink-500 focus:outline-none resize-y"
          />
        </div>
      </div>

      {/* Save button — only visible when dirty */}
      {isDirty && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="flex items-center gap-1.5 rounded-md bg-purple-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saved ? (
            <Check className="h-3 w-3" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saved ? "Saved!" : "Save"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Template Row (unsaved, newly added)
// ---------------------------------------------------------------------------

function DraftTemplateRow({
  draft,
  token,
  onCreated,
  onCancel,
}: {
  draft: DraftTemplate;
  token: string;
  onCreated: (template: StickerTemplateRow) => void;
  onCancel: (draftId: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [malePrompt, setMalePrompt] = useState(draft.malePrompt);
  const [femalePrompt, setFemalePrompt] = useState(draft.femalePrompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) { setError("Template name is required"); return; }
    if (!malePrompt.trim()) { setError("Male prompt is required"); return; }
    if (!femalePrompt.trim()) { setError("Female prompt is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sticker-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), malePrompt: malePrompt.trim(), femalePrompt: femalePrompt.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create template");
      const created = (await res.json()) as StickerTemplateRow;
      onCreated(created);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-purple-700/50 bg-purple-950/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g. Fun1)"
          autoFocus
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm font-medium text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onCancel(draft.draftId)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white transition-colors text-xs"
          title="Cancel"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-blue-400">Male Prompt</label>
          <textarea
            value={malePrompt}
            onChange={(e) => setMalePrompt(e.target.value)}
            rows={5}
            placeholder="Prompt for male players..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-pink-400">Female Prompt</label>
          <textarea
            value={femalePrompt}
            onChange={(e) => setFemalePrompt(e.target.value)}
            rows={5}
            placeholder="Prompt for female players..."
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-pink-500 focus:outline-none resize-y"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleCreate()}
        className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add Template
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates Section
// ---------------------------------------------------------------------------

function TemplatesSection({ token }: { token: string }) {
  const [templates, setTemplates] = useState<StickerTemplateRow[]>([]);
  const [drafts, setDrafts] = useState<DraftTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/sticker-templates", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as StickerTemplateRow[];
        setTemplates(data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const addDraft = useCallback(() => {
    setDrafts((prev) => [
      ...prev,
      { draftId: String(Date.now()), name: "", malePrompt: "", femalePrompt: "" },
    ]);
  }, []);

  const handleCreated = useCallback((template: StickerTemplateRow) => {
    setTemplates((prev) => [...prev, template]);
    setDrafts((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelDraft = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sticker className="h-4 w-4 text-purple-400" />
          <p className="text-sm font-medium text-neutral-200">Sticker Templates</p>
        </div>
        <button
          type="button"
          onClick={addDraft}
          className="flex items-center gap-1.5 rounded-md border border-purple-700/60 bg-purple-900/30 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-900/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Template
        </button>
      </div>

      {/* Column headers */}
      {(templates.length > 0 || drafts.length > 0) && (
        <div className="grid grid-cols-2 gap-3 px-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-400">
            <span>Male</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-pink-400">
            <span>Female</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        </div>
      ) : templates.length === 0 && drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 p-8 text-center">
          <p className="text-sm text-neutral-500">No templates yet.</p>
          <p className="mt-1 text-xs text-neutral-600">Add a template to customize sticker generation per gender.</p>
        </div>
      ) : null}

      {/* Existing templates */}
      <div className="space-y-3">
        {templates.map((t) => (
          <TemplateRow
            key={t.id}
            template={t}
            token={token}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      {/* Draft templates (unsaved) */}
      <div className="space-y-3">
        {drafts.map((d) => (
          <DraftTemplateRow
            key={d.draftId}
            draft={d}
            token={token}
            onCreated={handleCreated}
            onCancel={handleCancelDraft}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Tab
// ---------------------------------------------------------------------------

function fmtVND(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-1">
      <p className="text-xs text-neutral-500">{title}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-neutral-600">{subtitle}</p>
    </div>
  );
}

function StickerStatsTab({ token }: { token: string }) {
  const [stats, setStats] = useState<StickerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/sticker-stats", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: StickerStats) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>;
  }
  if (!stats) {
    return <p className="text-sm text-neutral-500 py-8 text-center">Failed to load stats.</p>;
  }

  const insight =
    stats.conversionRate > 15
      ? "🔥 Strong conversion — keep it up"
      : stats.conversionRate > 5
      ? `📈 Good start — ${stats.purchasesTotal} sales so far`
      : `👀 ${stats.scansTotal} players scanned — ${stats.purchasesTotal} purchased`;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          title="Face Scans Today"
          value={String(stats.scansToday)}
          subtitle={`All time: ${stats.scansTotal}`}
        />
        <StatCard
          title="Purchases Today"
          value={String(stats.purchasesToday)}
          subtitle={`All time: ${stats.purchasesTotal}`}
        />
        <StatCard
          title="Revenue Today"
          value={fmtVND(stats.revenueToday)}
          subtitle={`Total: ${fmtVND(stats.revenueTotal)}`}
        />
        <StatCard
          title="Conversion Rate"
          value={`${stats.conversionRate}%`}
          subtitle="Scans → Purchases"
        />
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs font-medium text-neutral-400 mb-4">Last 7 days — Scans vs Purchases</p>
        <div className="flex items-center gap-4 mb-3">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="inline-block w-3 h-2 rounded-sm bg-blue-500" /> Scans
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="inline-block w-3 h-2 rounded-sm bg-green-400" /> Purchases
          </span>
        </div>
        <BarChartComponent data={stats.last7Days} />
      </div>

      {/* Insight */}
      <p className="text-sm text-neutral-400 text-center">{insight}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purchases Tab
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function StickerPurchasesTab({ token }: { token: string }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sticker-purchases?page=${p}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { purchases: Purchase[]; total: number; page: number; totalPages: number };
      setPurchases(data.purchases ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(1); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/sticker-purchases/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      setPurchases((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
      setConfirmDeleteId(null);
      showToast("Payment deleted and pack marked as unpaid.");
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      {purchases.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-neutral-600">
          <Receipt className="h-10 w-10 opacity-40" />
          <p className="text-sm">No purchases yet.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-neutral-500">Showing {purchases.length} of {total} purchases</p>

          {/* Table */}
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500">Date &amp; Time</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500">Player</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500">Amount</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500 hidden sm:table-cell">Payment Code</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500 hidden md:table-cell">SePay ID</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium text-neutral-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {purchases.map((p) => (
                  <tr key={p.id} className="bg-neutral-900/30 hover:bg-neutral-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-neutral-400 tabular-nums whitespace-nowrap">
                      {fmtDateTime(p.processedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium text-neutral-200">{p.playerName ?? "Unknown"}</p>
                      {p.playerPhone && <p className="text-[10px] text-neutral-600">{p.playerPhone}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-semibold text-green-400 tabular-nums">
                        {fmtVND(p.transferAmount)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <code className="text-[10px] text-neutral-600 font-mono">{p.paymentCode}</code>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <code className="text-[10px] text-neutral-600 font-mono">{p.sepayId}</code>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {confirmDeleteId === p.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-neutral-400 whitespace-nowrap">Mark unpaid?</span>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void handleDelete(p.id)}
                            className="rounded px-2 py-0.5 text-[11px] font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 whitespace-nowrap"
                          >
                            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="h-7 w-7 ml-auto rounded-lg flex items-center justify-center text-neutral-600 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                          title="Delete payment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { const p = page - 1; setPage(p); void load(p); }}
                disabled={page === 1}
                className="h-7 w-7 rounded flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-neutral-500 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => { const p = page + 1; setPage(p); void load(p); }}
                disabled={page === totalPages}
                className="h-7 w-7 rounded flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function KioskShopPage() {
  const token = useSessionStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<ActiveTab>("stickers");

  const tabCls = (tab: ActiveTab) =>
    activeTab === tab
      ? "border-b-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-400"
      : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-300";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-purple-400" />
        <h1 className="text-xl font-bold text-white">Kiosk Shop</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-800">
        <button type="button" className={tabCls("stickers")} onClick={() => setActiveTab("stickers")}>
          Stickers
        </button>
        <button type="button" className={tabCls("explorer")} onClick={() => setActiveTab("explorer")}>
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Explorer
          </span>
        </button>
        <button type="button" className={tabCls("stats")} onClick={() => setActiveTab("stats")}>
          <span className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            Stats
          </span>
        </button>
        <button type="button" className={tabCls("purchases")} onClick={() => setActiveTab("purchases")}>
          <span className="flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Purchases
          </span>
        </button>
      </div>

      {activeTab === "stickers" && token && (
        <div className="space-y-8 max-w-3xl">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <PaymentSettingsSection token={token} />
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <TemplatesSection token={token} />
          </div>
        </div>
      )}

      {activeTab === "explorer" && token && (
        <StickerExplorerTab token={token} />
      )}

      {activeTab === "stats" && token && (
        <StickerStatsTab token={token} />
      )}

      {activeTab === "purchases" && token && (
        <StickerPurchasesTab token={token} />
      )}
    </div>
  );
}
