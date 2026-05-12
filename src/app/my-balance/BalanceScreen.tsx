"use client";

import { useState, useCallback, useEffect } from "react";
import { RefreshCw, Download, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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


const WHATSAPP_STEPS = [
  { en: "Download your sticker pack using the button above", vi: "Tải bộ sticker bằng nút phía trên" },
  { en: "Open WhatsApp and go to any chat", vi: "Mở WhatsApp và vào bất kỳ đoạn chat nào" },
  { en: "Tap the sticker icon (😊) next to the text field", vi: "Nhấn vào biểu tượng sticker (😊) cạnh ô nhập văn bản" },
  { en: "Tap the ✂️ create icon to create a sticker", vi: "Nhấn ✂️ để tạo sticker mới" },
  { en: "Select your downloaded sticker — it's ready to send immediately!", vi: "Chọn sticker vừa tải — gửi ngay!" },
];

function StickerShopSection({
  stickerData,
  paid,
}: {
  stickerData: StickerData;
  stickerToken?: string; // kept for API compat but download is now client-side
  paid?: boolean;
}) {
  const { i18n } = useTranslation();
  const [shopState] = useState<ShopState>(paid ? "success" : "idle");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // How-to starts expanded when paid (they just scanned and need the instructions right away)
  const [howToOpen, setHowToOpen] = useState(!!paid);
  const [downloading, setDownloading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }, []);

  // Use the app's active i18n language so flag toggle is respected
  const isVi = i18n.language.startsWith("vi");

  // Download each sticker individually via client-side blob — avoids all server-side ZIP issues
  const handleDownload = useCallback(async () => {
    if (downloading) return;
    const urls = stickerData.stickers.filter(Boolean);
    if (urls.length === 0) return;
    setDownloading(true);
    try {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i].split("?")[0]; // strip cache-buster
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `sticker_${i + 1}.webp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        // Small delay between downloads so browser doesn't block them
        if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setDownloading(false);
    }
  }, [stickerData.stickers, downloading]);

  return (
    <div style={{ marginTop: 28 }}>
      {/* Portrait tablet layout styles */}
      <style>{`
        @media (orientation: portrait) and (min-width: 768px) {
          .sticker-shop-portrait {
            display: flex !important;
            flex-direction: column !important;
            height: 100dvh !important;
            height: 100vh !important;
            overflow: hidden !important;
            padding: 2vh 24px !important;
            margin-top: 0 !important;
          }
          .sticker-shop-portrait .portrait-header {
            flex: 0 0 10% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }
          .sticker-shop-portrait .portrait-grid {
            flex: 0 0 55% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            overflow: hidden !important;
          }
          .sticker-shop-portrait .portrait-grid > div {
            height: 100% !important;
          }
          .sticker-shop-portrait .portrait-grid img {
            height: 100% !important;
            width: 100% !important;
            object-fit: contain !important;
          }
          .sticker-shop-portrait .portrait-qr {
            flex: 0 0 25% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .sticker-shop-portrait .portrait-qr img {
            height: 20vh !important;
            width: auto !important;
          }
          .sticker-shop-portrait .portrait-actions {
            flex: 0 0 20% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
          }
          .sticker-shop-portrait .portrait-actions button {
            min-height: 7vh !important;
          }
        }
      `}</style>

      {/* Section header */}
      <div className="portrait-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: "#ffffff" }}>
          {isVi ? "Bộ sticker của bạn" : "Your Sticker Pack"}
        </span>
        <span style={{ fontSize: 14, color: "#4ade80" }}>
          {shopState === "success"
            ? (isVi ? "Của bạn mãi mãi ✓" : "Yours forever ✓")
            : (isVi ? "4 sticker sẵn sàng" : "4 stickers ready")}
        </span>
      </div>

      {/* Stickers — horizontal row when paid, 2x2 grid otherwise */}
      {shopState === "success" ? (
        <div className="portrait-grid" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => {
            const url = stickerData.stickers[i];
            return (
              <div
                key={i}
                onClick={() => url && setPreviewIndex(i)}
                style={{ flex: "0 0 calc(25% - 6px)", minWidth: 72, aspectRatio: "1", borderRadius: 12, overflow: "hidden", cursor: url ? "pointer" : "default", position: "relative", background: "transparent" }}
              >
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`Sticker ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                )}
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
                  style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden", cursor: url ? "pointer" : "default", background: "transparent" }}
                >
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`Sticker ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, opacity: 0.45, transform: "rotate(-35deg)", userSelect: "none", whiteSpace: "nowrap" }}>
                      PREVIEW
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 8 }}>
            {isVi ? "Nhấn vào sticker để xem trước" : "Tap any sticker to preview"}
          </p>
        </div>
      )}

      {/* Download / action section — only in success state */}
      {shopState === "success" && (
        <div className="portrait-actions" style={{ marginTop: 16 }}>
          {isIOS ? (
            /* iOS: show individual stickers with long-press instructions */
            <div style={{ width: "100%" }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#ffffff", marginBottom: 12, textAlign: "center" }}>
                {isVi ? "Lưu sticker của bạn" : "Save your stickers"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                {stickerData.stickers.slice(0, 4).map((url, i) => (
                  <div
                    key={i}
                    style={{ minHeight: 160, borderRadius: 12, overflow: "hidden", background: "repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0 / 16px 16px" }}
                  >
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`Sticker ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    )}
                  </div>
                ))}
              </div>
              {/* Numbered steps */}
              {[
                {
                  en: "Long press each sticker → Save to Photos",
                  vi: "Giữ ngón tay trên từng sticker → Lưu vào Ảnh",
                },
                {
                  en: "Open Zalo or WhatsApp → send from your Photos",
                  vi: "Mở Zalo hoặc WhatsApp → gửi từ Ảnh của bạn",
                },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 16, color: "#d1d5db", lineHeight: 1.45, paddingTop: 4 }}>
                    {isVi ? step.vi : step.en}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            /* Android / desktop: download button + how-to accordion */
            <>
              <button
                onClick={() => { void handleDownload(); }}
                disabled={downloading}
                style={{ width: "100%", height: 56, borderRadius: 16, background: downloading ? "#6b7280" : "#4ade80", color: "#000", fontSize: 16, fontWeight: 600, border: "none", cursor: downloading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: downloading ? 0.8 : 1 }}
              >
                {downloading
                  ? <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                  : <Download size={20} />}
                {downloading
                  ? (isVi ? "Đang tải…" : "Downloading…")
                  : (isVi ? "Tải bộ sticker về máy" : "Download your sticker pack")}
              </button>

              {/* How to use on WhatsApp — expanded by default */}
              <div style={{ background: "#1a1a1a", borderRadius: 16, padding: 16, marginTop: 12, width: "100%" }}>
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
            </>
          )}
        </div>
      )}

      {/* Idle: kiosk prompt */}
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
            <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vw" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stickerData.stickers[previewIndex]} alt={`Sticker ${previewIndex + 1}`} style={{ maxWidth: "90vw", maxHeight: "90vw", objectFit: "contain", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ color: "#fff", fontSize: 28, fontWeight: 700, opacity: 0.50, transform: "rotate(-35deg)", userSelect: "none", whiteSpace: "nowrap", letterSpacing: 4 }}>
                  PREVIEW
                </span>
              </div>
            </div>
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
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
