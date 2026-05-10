"use client";

import { useState } from "react";
import { RefreshCw, Download, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SubscriptionCard } from "@/components/balance/SubscriptionCard";
import { BalanceTopBar } from "./BalanceTopBar";
import type { BalanceData, StickerData } from "./types";

interface BalanceScreenProps {
  data: BalanceData;
  onRefresh: () => void;
  onBack: () => void;
  refreshing: boolean;
  showBackToVenues: boolean;
  stickerData?: StickerData | null;
  stickerToken?: string;
  stickerPaid?: boolean;
}

type ShopState = "idle" | "payment" | "success";

function formatRelativeTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const isVi = locale.startsWith("vi");

  if (mins < 1) return isVi ? "Vừa xong" : "Just now";
  if (mins < 60) {
    return isVi
      ? `${mins} phút trước`
      : `${mins} min${mins !== 1 ? "s" : ""} ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    if (isToday) {
      return (
        (isVi ? "Hôm nay, " : "Today, ") +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      );
    }
    return isVi
      ? `${hours} giờ trước`
      : `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return isVi ? "Hôm qua" : "Yesterday";
  return isVi ? `${days} ngày trước` : `${days} days ago`;
}

const CHECKERED: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%)
  `,
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

const WHATSAPP_STEPS = [
  { en: "Tap the Download button below", vi: "Nhấn nút Tải xuống bên dưới" },
  { en: "Open WhatsApp, go to any chat", vi: "Mở WhatsApp, vào bất kỳ cuộc trò chuyện nào" },
  { en: "Tap the attachment (📎) icon", vi: "Nhấn biểu tượng đính kèm (📎)" },
  { en: "Choose 'Photos & Videos' and select your stickers", vi: "Chọn 'Ảnh & Video' rồi chọn sticker của bạn" },
  { en: "Send and enjoy! 🎉", vi: "Gửi và tận hưởng! 🎉" },
];

function StickerShopSection({
  stickerData,
  stickerToken,
  paid,
}: {
  stickerData: StickerData;
  stickerToken?: string;
  paid?: boolean;
}) {
  const [shopState, setShopState] = useState<ShopState>(paid ? "success" : "idle");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  // Detect browser language for instructions
  const isVi = typeof navigator !== "undefined" && navigator.language.startsWith("vi");

  const handleDownload = () => {
    if (!stickerToken) return;
    window.location.href = `/api/player/download-pack?token=${encodeURIComponent(stickerToken)}`;
  };

  return (
    <div style={{ marginTop: 28 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: "#ffffff" }}>
          Your Sticker Pack
        </span>
        <span style={{ fontSize: 14, color: "#4ade80" }}>
          {shopState === "success" ? "Yours forever ✓" : "4 stickers ready"}
        </span>
      </div>

      {/* Stickers — horizontal row when paid, 2x2 grid otherwise */}
      {shopState === "success" ? (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => {
            const url = stickerData.stickers[i];
            return (
              <div
                key={i}
                onClick={() => url && setPreviewIndex(i)}
                style={{
                  flex: "0 0 calc(25% - 6px)",
                  minWidth: 72,
                  aspectRatio: "1",
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: url ? "pointer" : "default",
                  position: "relative",
                  ...CHECKERED,
                }}
              >
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`Sticker ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                )}
                <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={12} color="#000" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#1a1a1a", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => {
              const url = stickerData.stickers[i];
              return (
                <div
                  key={i}
                  onClick={() => url && setPreviewIndex(i)}
                  style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden", cursor: url ? "pointer" : "default", ...CHECKERED }}
                >
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`Sticker ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, opacity: 0.25, transform: "rotate(-35deg)", userSelect: "none", whiteSpace: "nowrap" }}>
                      PREVIEW
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 8 }}>
            Tap any sticker to preview
          </p>
        </div>
      )}

      {/* Download button + instructions — only in success state */}
      {shopState === "success" && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleDownload}
            style={{ width: "100%", height: 56, borderRadius: 16, background: "#4ade80", color: "#000", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Download size={20} />
            {isVi ? "Tải bộ sticker về máy" : "Download your sticker pack"}
          </button>

          {/* How to use on WhatsApp */}
          <div style={{ background: "#1a1a1a", borderRadius: 16, padding: 16, marginTop: 12 }}>
            <button
              onClick={() => setHowToOpen((o) => !o)}
              style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}
            >
              <span style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
                {isVi ? "📲 Cách dùng trên WhatsApp?" : "📲 How to use on WhatsApp?"}
              </span>
              {howToOpen ? <ChevronUp size={18} color="#9ca3af" /> : <ChevronDown size={18} color="#9ca3af" />}
            </button>

            {howToOpen && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {WHATSAPP_STEPS.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: 15, color: "#9ca3af", paddingTop: 3, lineHeight: 1.4 }}>
                      {isVi ? step.vi : step.en}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idle: show buy button (fallback for non-kiosk flow) */}
      {shopState === "idle" && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, color: "#9ca3af", textAlign: "center" }}>
            {isVi ? "Thanh toán tại quầy kiosk để tải về." : "Pay at the kiosk to download your pack."}
          </p>
        </div>
      )}

      {/* Full-screen sticker preview modal */}
      {previewIndex !== null && (
        <div
          onClick={() => setPreviewIndex(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {stickerData.stickers[previewIndex] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stickerData.stickers[previewIndex]} alt={`Sticker ${previewIndex + 1}`} style={{ maxWidth: "90vw", maxHeight: "90vw", objectFit: "contain" }} />
          )}
        </div>
      )}
    </div>
  );
}

export function BalanceScreen({
  data,
  onRefresh,
  onBack,
  refreshing,
  showBackToVenues,
  stickerData,
  stickerToken,
  stickerPaid,
}: BalanceScreenProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "var(--bal-bg)" }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
      <BalanceTopBar label={data.venueName || undefined} onBack={onBack} />

      <div className="flex flex-1 flex-col px-6 py-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--bal-text)" }}>
          {t("home.hi", { name: data.playerName })}
        </h1>

        {data.subscription !== undefined && (
          <div className="mt-6">
            {data.subscription ? (
              <SubscriptionCard
                packageName={data.subscription.packageName}
                sessionsTotal={data.subscription.sessionsTotal}
                sessionsRemaining={data.subscription.sessionsRemaining}
                sessionsUsed={data.subscription.sessionsUsed}
                expiresAt={data.subscription.expiresAt}
                daysRemaining={data.subscription.daysRemaining}
                isUnlimited={data.subscription.isUnlimited}
              />
            ) : !stickerData ? (
              <div
                className="rounded-2xl border px-6 py-8 text-center"
                style={{
                  borderColor: "var(--bal-border)",
                  background: "var(--bal-card)",
                }}
              >
                <p className="text-lg font-semibold" style={{ color: "var(--bal-text)" }}>
                  {t("balance.noPackage")}
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--bal-muted)" }}>
                  {t("balance.noPackageSub")}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {data.lastCheckIn && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--bal-card-surface)" }}
            >
              <span className="text-sm" style={{ color: "var(--bal-subtle)" }}>
                {t("balance.lastCheckIn")}
              </span>
              <span className="text-sm" style={{ color: "var(--bal-text-secondary)" }}>
                {formatRelativeTime(data.lastCheckIn, i18n.language)}
              </span>
            </div>
          )}

          {data.subscription && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--bal-card-surface)" }}
            >
              <span className="text-sm" style={{ color: "var(--bal-subtle)" }}>
                {t("balance.sessionsUsed")}
              </span>
              <span className="text-sm" style={{ color: "var(--bal-text-secondary)" }}>
                {data.subscription.sessionsUsed}
              </span>
            </div>
          )}
        </div>

        {/* Sticker shop section */}
        {stickerData && (
          <StickerShopSection
            stickerData={stickerData}
            stickerToken={stickerToken}
            paid={stickerPaid}
          />
        )}

        <div className="mt-auto flex flex-col items-center gap-4 pt-10">
          {!stickerData && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                borderColor: "var(--bal-border)",
                background: "var(--bal-card)",
                color: "var(--bal-text-secondary)",
              }}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {t("balance.refresh")}
            </button>
          )}

          <button
            onClick={onBack}
            className="text-sm transition-colors"
            style={{ color: "var(--bal-subtle)" }}
          >
            {showBackToVenues ? t("balance.switchVenue") : t("balance.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
