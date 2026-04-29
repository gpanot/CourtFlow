"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Tag,
} from "lucide-react";

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
}

interface DiscountRecord {
  id: string;
  playerId: string;
  discountType: "fixed" | "percent";
  customFee: number | null;
  discountPct: number | null;
  note: string | null;
  player: PlayerResult;
}

type StaffPlayerDiscountsProps = {
  venueId: string;
};

export function StaffPlayerDiscounts({ venueId }: StaffPlayerDiscountsProps) {
  const [discounts, setDiscounts] = useState<DiscountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountRecord | null>(null);
  const [venueSessionFee, setVenueSessionFee] = useState(0);

  const fetchDiscounts = useCallback(async () => {
    try {
      const [discData, feeData] = await Promise.all([
        api.get<{ discounts: DiscountRecord[] }>("/api/staff/player-discounts"),
        api.get<{ sessionFee: number }>(`/api/staff/venue-payment-settings?venueId=${venueId}`),
      ]);
      setDiscounts(discData.discounts);
      setVenueSessionFee(feeData.sessionFee || 0);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { void fetchDiscounts(); }, [fetchDiscounts]);

  const handleDelete = async (playerId: string) => {
    if (!confirm("Xoá giảm giá cho người chơi này?")) return;
    try {
      await api.delete("/api/staff/player-discounts", { playerId });
      setDiscounts((prev) => prev.filter((d) => d.playerId !== playerId));
    } catch { /* silent */ }
  };

  const handleEdit = (discount: DiscountRecord) => {
    setEditingDiscount(discount);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingDiscount(null);
    setModalOpen(true);
  };

  const handleSaved = (updated: DiscountRecord) => {
    setDiscounts((prev) => {
      const existing = prev.findIndex((d) => d.playerId === updated.playerId);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = updated;
        return copy;
      }
      return [updated, ...prev];
    });
    setModalOpen(false);
    setEditingDiscount(null);
  };

  const calcFinalPrice = (d: DiscountRecord) => {
    if (d.discountType === "fixed" && d.customFee != null) return d.customFee;
    if (d.discountType === "percent" && d.discountPct != null) {
      return Math.round(venueSessionFee * (1 - d.discountPct / 100));
    }
    return venueSessionFee;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-amber-400" aria-hidden />
        <p className="text-sm font-medium text-neutral-200">Giảm giá người chơi</p>
      </div>

      {discounts.length === 0 ? (
        <p className="text-xs text-neutral-500">Chưa có giảm giá nào</p>
      ) : (
        <div className="space-y-2">
          {discounts.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
            >
              <PlayerAvatar player={d.player} size={40} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{d.player.name}</p>
                <p className="text-xs text-neutral-400">
                  {d.discountType === "fixed"
                    ? `${(d.customFee ?? 0).toLocaleString("vi-VN")} VND`
                    : `${d.discountPct}% off (${calcFinalPrice(d).toLocaleString("vi-VN")} VND)`}
                  {d.note && <span className="ml-1.5 text-neutral-500">· {d.note}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleEdit(d)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(d.playerId)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-red-900/30 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-700 py-2.5 text-sm text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Thêm giảm giá
      </button>

      {modalOpen && (
        <DiscountModal
          editing={editingDiscount}
          venueSessionFee={venueSessionFee}
          onClose={() => { setModalOpen(false); setEditingDiscount(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function PlayerAvatar({ player, size }: { player: PlayerResult; size: number }) {
  const src = player.avatarPhotoPath || player.facePhotoPath;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];
  const bg = colors[player.name.charCodeAt(0) % colors.length];
  return (
    <div
      className="flex items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}

interface DiscountModalProps {
  editing: DiscountRecord | null;
  venueSessionFee: number;
  onClose: () => void;
  onSaved: (d: DiscountRecord) => void;
}

function DiscountModal({ editing, venueSessionFee, onClose, onSaved }: DiscountModalProps) {
  const [step, setStep] = useState<"player" | "discount">(editing ? "discount" : "player");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(editing?.player ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [discountType, setDiscountType] = useState<"fixed" | "percent">(editing?.discountType ?? "fixed");
  const [customFee, setCustomFee] = useState(editing?.customFee ? String(editing.customFee) : "");
  const [discountPct, setDiscountPct] = useState(editing?.discountPct ? String(editing.discountPct) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<{ players: PlayerResult[] }>(
          `/api/staff/players-search?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(data.players);
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const calculatedPrice = useMemo(() => {
    if (discountType === "fixed") return Number(customFee) || 0;
    const pct = Number(discountPct) || 0;
    return Math.round(venueSessionFee * (1 - pct / 100));
  }, [discountType, customFee, discountPct, venueSessionFee]);

  const handleSelectPlayer = (p: PlayerResult) => {
    setSelectedPlayer(p);
    setStep("discount");
  };

  const handleSave = async () => {
    if (!selectedPlayer) return;
    setSaving(true);
    setSaveError("");
    try {
      const data = await api.put<{ discount: DiscountRecord }>("/api/staff/player-discounts", {
        playerId: selectedPlayer.id,
        discountType,
        ...(discountType === "fixed" ? { customFee: Number(customFee) } : {}),
        ...(discountType === "percent" ? { discountPct: Number(discountPct) } : {}),
        note: note.trim() || undefined,
      });
      onSaved(data.discount);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Lỗi lưu giảm giá");
    } finally {
      setSaving(false);
    }
  };

  const isValid = discountType === "fixed"
    ? Number(customFee) > 0
    : Number(discountPct) >= 1 && Number(discountPct) <= 99;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <p className="text-base font-bold text-white">
            {editing ? "Sửa giảm giá" : "Tạo giảm giá"}
          </p>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {step === "player" && (
          <div className="px-5 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm người chơi theo tên hoặc SĐT..."
                autoFocus
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-neutral-500 focus:border-client-primary focus:outline-none"
              />
            </div>
            <div className="mt-3 max-h-[40dvh] overflow-y-auto">
              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-500" aria-hidden />
                </div>
              )}
              {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="py-4 text-center text-sm text-neutral-500">Không tìm thấy</p>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPlayer(p)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-800"
                >
                  <PlayerAvatar player={p} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">{p.name}</p>
                    <p className="text-xs text-neutral-500">{p.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "discount" && selectedPlayer && (
          <div className="px-5 pt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <PlayerAvatar player={selectedPlayer} size={36} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{selectedPlayer.name}</p>
                <p className="text-xs text-neutral-500">{selectedPlayer.phone}</p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => { setStep("player"); setSelectedPlayer(null); }}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Đổi
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType("fixed")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountType === "fixed"
                    ? "bg-client-primary text-neutral-950"
                    : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                Giá cố định
              </button>
              <button
                type="button"
                onClick={() => setDiscountType("percent")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountType === "percent"
                    ? "bg-client-primary text-neutral-950"
                    : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                Phần trăm
              </button>
            </div>

            {discountType === "fixed" ? (
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Giá tuỳ chỉnh (VND)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customFee ? Number(customFee).toLocaleString("en") : ""}
                  onChange={(e) => setCustomFee(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="100,000"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-client-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Giá mặc định: {venueSessionFee.toLocaleString("vi-VN")} VND
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Giảm giá %</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discountPct}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    if (Number(v) <= 99) setDiscountPct(v);
                  }}
                  placeholder="20"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-client-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Người chơi trả: {calculatedPrice.toLocaleString("vi-VN")} VND
                  <span className="ml-2 text-neutral-600">(mặc định {venueSessionFee.toLocaleString("vi-VN")})</span>
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-neutral-400">Ghi chú (tuỳ chọn)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Huấn luyện viên, Thường xuyên, Bạn bè..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-client-primary focus:outline-none"
              />
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            <button
              type="button"
              disabled={saving || !isValid}
              onClick={() => void handleSave()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-client-primary py-2.5 text-sm font-semibold text-neutral-950 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Lưu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
