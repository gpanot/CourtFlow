"use client";

import { useState } from "react";
import { RefreshCw, Download, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
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

const ZALO_STEPS = [
  "Download the sticker pack",
  "Open Zalo, go to a chat",
  "Tap the sticker icon, then plus",
  "Select Import from Gallery",
  "Pick your downloaded stickers",
];

function StickerShopSection({
  stickerData,
  stickerToken,
}: {
  stickerData: StickerData;
  stickerToken?: string;
}) {
  const [shopState, setShopState] = useState<ShopState>("idle");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [zaloOpen, setZaloOpen] = useState(false);

  const handleBuy = () => {
    setShopState("payment");
    setTimeout(() => setShopState("success"), 5000);
  };

  const handleDownload = () => {
    if (!stickerToken) return;
    window.location.href = `/api/player/download-pack?token=${encodeURIComponent(stickerToken)}`;
  };

  return (
    <div style={{ marginTop: 32 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 600, color: "#ffffff" }}>
          Your Sticker Pack
        </span>
        <span style={{ fontSize: 14, color: shopState === "success" ? "#4ade80" : "#4ade80" }}>
          {shopState === "success" ? "Yours forever ✓" : "4 stickers ready"}
        </span>
      </div>

      {/* Sticker 2x2 grid */}
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const url = stickerData.stickers[i];
            return (
              <div
                key={i}
                onClick={() => url && setPreviewIndex(i)}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: url ? "pointer" : "default",
                  ...CHECKERED,
                }}
              >
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Sticker ${i + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                )}

                {/* PREVIEW watermark — hidden after success */}
                {shopState !== "success" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: 700,
                        opacity: 0.25,
                        transform: "rotate(-35deg)",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      PREVIEW
                    </span>
                  </div>
                )}

                {/* Green checkmark badge on success */}
                {shopState === "success" && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#4ade80",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckCircle2 size={14} color="#000" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p
          style={{
            fontSize: 12,
            color: "#6b7280",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Tap any sticker to preview
        </p>
      </div>

      {/* Shop state: idle */}
      {shopState === "idle" && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleBuy}
            style={{
              width: "100%",
              height: 56,
              borderRadius: 16,
              background: "#4ade80",
              color: "#000",
              fontSize: 16,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Buy for 30,000 VND
          </button>
          <p
            style={{
              fontSize: 14,
              color: "#9ca3af",
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Pay once, keep forever
          </p>
        </div>
      )}

      {/* Shop state: payment */}
      {shopState === "payment" && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              background: "#1a1a1a",
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "#ffffff",
                textAlign: "center",
                margin: 0,
              }}
            >
              Pay 30,000 VND
            </p>

            <div
              style={{
                background: "#ffffff",
                padding: 16,
                borderRadius: 12,
              }}
            >
              <QRCodeSVG
                value="https://payment.placeholder"
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            <p style={{ fontSize: 14, color: "#9ca3af", margin: 0, textAlign: "center" }}>
              MB Bank · 0123456789
            </p>

            <p
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#4ade80",
                margin: 0,
              }}
            >
              30,000 VND
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#4ade80",
                  display: "inline-block",
                  animation: "pulse-dot 1.2s ease-in-out infinite",
                }}
              />
              <span style={{ fontSize: 16, color: "#ffffff" }}>
                Waiting for payment...
              </span>
            </div>

            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              We will detect it automatically
            </p>
          </div>

          <button
            onClick={() => setShopState("idle")}
            style={{
              width: "100%",
              height: 56,
              borderRadius: 16,
              background: "transparent",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 500,
              border: "1px solid #2a2a2a",
              cursor: "pointer",
              marginTop: 12,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Shop state: success */}
      {shopState === "success" && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleDownload}
            style={{
              width: "100%",
              height: 56,
              borderRadius: 16,
              background: "#4ade80",
              color: "#000",
              fontSize: 16,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Download size={20} />
            Download sticker pack
          </button>

          {/* How to add to Zalo */}
          <div
            style={{
              background: "#1a1a1a",
              borderRadius: 16,
              padding: 16,
              marginTop: 12,
            }}
          >
            <button
              onClick={() => setZaloOpen((o) => !o)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 0,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
                How to add to Zalo
              </span>
              {zaloOpen ? (
                <ChevronUp size={18} color="#9ca3af" />
              ) : (
                <ChevronDown size={18} color="#9ca3af" />
              )}
            </button>

            {zaloOpen && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {ZALO_STEPS.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#4ade80",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>
                        {i + 1}
                      </span>
                    </div>
                    <span style={{ fontSize: 16, color: "#9ca3af", paddingTop: 2 }}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-screen sticker preview modal */}
      {previewIndex !== null && (
        <div
          onClick={() => setPreviewIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {stickerData.stickers[previewIndex] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stickerData.stickers[previewIndex]}
              alt={`Sticker ${previewIndex + 1}`}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vw",
                objectFit: "contain",
              }}
            />
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
