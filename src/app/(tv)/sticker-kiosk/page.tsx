"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
} from "react";

// ── Responsive hook — SSR-safe, no hydration mismatch ────────────────────────
function subscribeToResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function useIsTablet() {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerWidth >= 768,
    () => false, // server snapshot — default to mobile
  );
}
import { useFaceScanner } from "@/hooks/useFaceScanner";
import { QRCodeSVG } from "qrcode.react";
import { Camera, X, Moon, Sun } from "lucide-react";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";
import { buildVietQRPayload } from "@/lib/vietqr-payload";

// ---------------------------------------------------------------------------
// i18n — Vietnamese / English strings
// ---------------------------------------------------------------------------

type Lang = "vi" | "en";

const STRINGS = {
  en: {
    scanBtn: "Scan to see your stickers",
    loading: "Loading…",
    hero: "Your face. Your stickers.",
    heroSub: "See your personalized sticker pack in seconds",
    lookCamera: "Look at the camera",
    noMatchRetry: "No match yet — retrying…",
    nextScanIn: "Next scan in",
    statusAdjust: "Position your face in the frame",
    statusCapturing: "Hold still…",
    cancel: "Cancel",
    hiPlayer: (name: string) => `Hi ${name}! 👋`,
    paySubtitle: "Complete payment to get your sticker pack",
    confirmedSubtitle: "Payment received! Scan to access your stickers",
    scanToPay: (price: string) => `Scan to pay ${price} VND`,
    anyApp: "Use any Vietnamese banking app",
    noQR: "Payment QR not configured — contact staff.",
    confirmIn: (n: number) => `You can confirm payment in ${n}s…`,
    iPaid: "I just paid ✓",
    cancelBtn: "Cancel",
    confirmed: "Payment confirmed!",
    scanPhone: "Scan to download your sticker pack",
    downloadApp: "Download your stickers directly in the app",
    done: "Done",
    resetIn: (n: number) => `Screen resets in ${n}s`,
    notFoundTitle: "We didn't find your stickers",
    notFoundNoFace: "We couldn't recognize your face. Try again with better lighting.",
    notFoundNoPack: "Ask a staff member to set up your sticker pack first.",
    tryAgain: "Try again",
    goBack: "Go back",
    langAria: "Switch to Vietnamese",
    darkAria: "Switch to dark mode",
    lightAria: "Switch to light mode",
  },
  vi: {
    scanBtn: "Quét mặt để xem sticker",
    loading: "Đang tải…",
    hero: "Khuôn mặt bạn. Sticker của bạn.",
    heroSub: "Xem bộ sticker cá nhân trong vài giây",
    lookCamera: "Nhìn vào camera",
    noMatchRetry: "Chưa nhận dạng được — đang thử lại…",
    nextScanIn: "Quét tiếp trong",
    statusAdjust: "Đưa mặt vào khung hình",
    statusCapturing: "Giữ nguyên…",
    cancel: "Huỷ",
    hiPlayer: (name: string) => `Chào ${name}! 👋`,
    paySubtitle: "Hoàn thành thanh toán để nhận bộ sticker",
    confirmedSubtitle: "Đã thanh toán! Quét để truy cập sticker",
    scanToPay: (price: string) => `Quét để thanh toán ${price} VND`,
    anyApp: "Dùng app ngân hàng Việt Nam bất kỳ",
    noQR: "Chưa cấu hình mã QR — liên hệ nhân viên.",
    confirmIn: (n: number) => `Bạn có thể xác nhận thanh toán sau ${n}s…`,
    iPaid: "Tôi đã thanh toán ✓",
    cancelBtn: "Huỷ",
    confirmed: "Thanh toán thành công!",
    scanPhone: "Quét để tải bộ sticker của bạn",
    downloadApp: "Tải sticker trực tiếp trong ứng dụng",
    done: "Xong",
    resetIn: (n: number) => `Màn hình đặt lại sau ${n}s`,
    notFoundTitle: "Không tìm thấy sticker của bạn",
    notFoundNoFace: "Không nhận dạng được khuôn mặt. Thử lại ở nơi sáng hơn.",
    notFoundNoPack: "Nhờ nhân viên thiết lập bộ sticker trước nhé.",
    tryAgain: "Thử lại",
    goBack: "Quay lại",
    langAria: "Switch to English",
    darkAria: "Chuyển chế độ tối",
    lightAria: "Chuyển chế độ sáng",
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KioskState = "idle" | "scanning" | "identified" | "not_found";

interface SessionData {
  token: string;
  shopUrl: string;
  playerName: string;
  stickers: string[];
}

interface KioskSettings {
  stickerPrice: number;
  bankBin: string;
  bankAccount: string;
  bankOwnerName: string;
}

interface NotFoundReason {
  hasStickerPack: boolean;
}

// ---------------------------------------------------------------------------
// Design tokens (dark / light aware)
// ---------------------------------------------------------------------------

function getColors(dark: boolean) {
  return {
    bg:     dark ? "#000000" : "#f5f5f5",
    card:   dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text:   dark ? "#ffffff" : "#111111",
    muted:  dark ? "#9ca3af" : "#6b7280",
    dim:    dark ? "#6b7280" : "#9ca3af",
    green:  "#16a34a",
    headerBg: dark ? "#111111" : "#ffffff",
    headerBorder: dark ? "#2a2a2a" : "#e5e7eb",
  };
}

// Keep the old C alias so existing style references below still compile
// (we replace them per-component using the `c` local from props)
const C = getColors(true);

const BTN_BASE: React.CSSProperties = {
  height: 56,
  borderRadius: 16,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  transition: "opacity 200ms",
  width: "100%",
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: C.green,
  color: "#ffffff",
};

function btnSecondary(c: ReturnType<typeof getColors>): React.CSSProperties {
  return { ...BTN_BASE, background: "transparent", color: c.text, border: `1px solid ${c.border}` };
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kioskFetch(secret: string, url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-kiosk-secret": secret,
      ...(options?.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// CSS animations (injected once at page level)
// ---------------------------------------------------------------------------

const CSS_ANIMATIONS = `
@keyframes scroll-ltr {
  from { transform: translateX(-50%); }
  to   { transform: translateX(0%); }
}
@keyframes scroll-rtl {
  from { transform: translateX(0%); }
  to   { transform: translateX(-50%); }
}
@keyframes scan-line {
  0%   { top: 0%; }
  100% { top: 100%; }
}
@keyframes shimmer {
  0%   { opacity: 0.4; }
  50%  { opacity: 0.7; }
  100% { opacity: 0.4; }
}
@keyframes sticker-pop {
  0%   { opacity: 0; transform: scale(0.55) rotate(-6deg); }
  60%  { opacity: 1; transform: scale(1.08) rotate(1.5deg); }
  80%  { transform: scale(0.96) rotate(-0.5deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes sticker-shimmer-reveal {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes slide-up-in {
  0%   { transform: translateY(100vh); opacity: 0; }
  100% { transform: translateY(0);    opacity: 1; }
}
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Tablet responsive layout for the payment screen (≥768px) ── */
@media (min-width: 768px) {
  .sk-payment-outer {
    padding: 48px 32px !important;
    justify-content: flex-start !important;
  }
  .sk-payment-header {
    text-align: center;
    margin-bottom: 32px !important;
  }
  .sk-payment-header p {
    font-size: 24px !important;
  }
  .sk-two-col {
    display: flex !important;
    flex-direction: row !important;
    gap: 48px;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    align-items: flex-start;
  }
  .sk-col-left {
    flex: 1;
    display: flex;
    justify-content: center;
  }
  .sk-col-left .sk-sticker-grid {
    max-width: none !important;
    width: 420px !important;
  }
  .sk-col-left .sk-sticker-grid > div {
    gap: 10px !important;
  }
  .sk-col-left .sk-sticker-cell {
    aspect-ratio: 1 !important;
  }
  .sk-col-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    max-width: none !important;
  }
  .sk-qr-box {
    padding: 16px !important;
    border-radius: 16px !important;
  }
  .sk-price-strike {
    font-size: 18px !important;
  }
  .sk-price-main {
    font-size: 28px !important;
  }
  .sk-paid-btn-wrap {
    max-width: none !important;
    width: 100% !important;
    margin-top: 24px !important;
  }
}
`;

// ---------------------------------------------------------------------------
// Shared TopBar — matches mobile CourtFlowKioskTopBar exactly:
//   [left slot: sun/moon pill]  [center: mark + "CourtPay"]  [right slot: flag pill]
// ---------------------------------------------------------------------------

function KioskTopBar({
  dark,
  onToggleDark,
  lang,
  onToggleLang,
  c,
  onBack,
}: {
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
  c: ReturnType<typeof getColors>;
  onBack?: () => void;
}) {
  const s = STRINGS[lang];
  const isLight = !dark;

  const pillBase: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 18,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    background: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.12)",
  };

  return (
    <div
      style={{
        flexShrink: 0,
        paddingBottom: 12,
        paddingTop: 10,
        paddingLeft: 16,
        paddingRight: 16,
        borderBottom: `1.5px solid ${isLight ? "#e2e8f0" : "#262626"}`,
        background: isLight ? "rgba(255,255,255,0.92)" : "#000000",
      }}
    >
      {/* Three-column row: left slot | brand | right slot */}
      <div style={{ display: "flex", alignItems: "center", minHeight: 40 }}>

        {/* Left — back button or dark/light toggle */}
        <div style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
          {onBack ? (
            <button
              onClick={onBack}
              aria-label="Back"
              style={{ ...pillBase, fontSize: 20, color: isLight ? "#334155" : "#e2e8f0", fontWeight: 600 }}
            >
              ‹
            </button>
          ) : (
            <button
              onClick={onToggleDark}
              aria-label={dark ? s.lightAria : s.darkAria}
              style={pillBase}
            >
              {isLight
                ? <Moon size={20} color="#334155" />
                : <Sun size={20} color="#facc15" />}
            </button>
          )}
        </div>

        {/* Center — CourtFlow mark + "CourtPay" */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/courtflow-mark.png"
            alt=""
            style={{ width: 26, height: 26, borderRadius: 6, display: "block" }}
          />
          <span style={{ fontSize: 17, fontWeight: 700, color: isLight ? "#15803d" : "#22c55e", letterSpacing: "-0.2px" }}>
            CourtPay
          </span>
        </div>

        {/* Right — language flag */}
        <div style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={onToggleLang}
            aria-label={s.langAria}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 10, fontSize: 22, lineHeight: 1 }}
          >
            {lang === "vi" ? "🇬🇧" : "🇻🇳"}
          </button>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle — scrolling showcase rows
// ---------------------------------------------------------------------------

function StickerRow({
  stickers,
  direction,
}: {
  stickers: string[];
  direction: "ltr" | "rtl";
}) {
  const doubled = [...stickers, ...stickers];
  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          animation: `${direction === "ltr" ? "scroll-ltr" : "scroll-rtl"} 28s linear infinite`,
          width: "max-content",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.animationPlayState = "paused")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.animationPlayState = "running")
        }
      >
        {doubled.map((url, i) => (
          <div
            key={i}
            style={{
              width: 110,
              height: 110,
              borderRadius: 12,
              flexShrink: 0,
              overflow: "hidden",
              ...CHECKERED,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ShimmerRow() {
  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 110,
              height: 110,
              borderRadius: 12,
              flexShrink: 0,
              background: "#222",
              animation: "shimmer 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function IdleScreen({
  onScan,
  secretReady,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
}: {
  onScan: () => void;
  secretReady: boolean;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
}) {
  const [stickers, setStickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const c = getColors(dark);
  const s = STRINGS[lang];

  useEffect(() => {
    fetch("/api/kiosk/sticker-showcase")
      .then((r) => r.json())
      .then((d: { stickers: string[] }) => setStickers(d.stickers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Split into 3 bands
  const third = Math.ceil(stickers.length / 3);
  const rowA = stickers.slice(0, third);
  const rowB = stickers.slice(third, third * 2);
  const rowC = stickers.slice(third * 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: c.bg }}>
      <KioskTopBar dark={dark} onToggleDark={onToggleDark} lang={lang} onToggleLang={onToggleLang} c={c} />

      {/* Showcase rows — 3 bands */}
      <div
        style={{
          flex: "0 0 auto",
          height: "calc((100dvh - 56px) * 0.55)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
          padding: "12px 0",
          overflow: "hidden",
        }}
      >
        {loading || stickers.length === 0 ? (
          <>
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
          </>
        ) : (
          <>
            <StickerRow stickers={rowA.length > 0 ? rowA : stickers} direction="ltr" />
            <StickerRow stickers={rowB.length > 0 ? rowB : stickers} direction="rtl" />
            <StickerRow stickers={rowC.length > 0 ? rowC : stickers} direction="ltr" />
          </>
        )}
      </div>

      {/* CTA */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
        }}
      >
        <p style={{ fontSize: 26, fontWeight: 700, color: c.text, textAlign: "center", marginBottom: 8 }}>
          {s.hero}
        </p>
        <p style={{ fontSize: 15, color: c.muted, textAlign: "center", marginBottom: 32 }}>
          {s.heroSub}
        </p>
        <div style={{ maxWidth: 340, width: "100%" }}>
          <button
            style={{ ...BTN_PRIMARY, opacity: secretReady ? 1 : 0.5, cursor: secretReady ? "pointer" : "default" }}
            onClick={secretReady ? onScan : undefined}
          >
            <Camera size={20} />
            {secretReady ? s.scanBtn : s.loading}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scanning screen
// ---------------------------------------------------------------------------

type ScanPhase = "idle" | "adjust" | "capturing" | "between_retries" | "matched" | "failed";

function ScanningScreen({
  kioskSecret,
  onIdentified,
  onNotFound,
  onCancel,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
}: {
  kioskSecret: string;
  onIdentified: (session: SessionData) => void;
  onNotFound: (reason: NotFoundReason) => void;
  onCancel: () => void;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
}) {
  const c = getColors(dark);
  const s = STRINGS[lang];
  const cameraRef = useRef<CameraCaptureHandle>(null);

  type IdentifyResponse = {
    matched: boolean;
    playerId?: string;
    displayName?: string;
    hasStickerPack?: boolean;
  };

  const kioskHeaders = { "x-kiosk-secret": kioskSecret };

  const { phase: scanPhase, retrySecondsLeft } = useFaceScanner({
    cameraRef,
    active: true,
    endpoint: "/api/kiosk/sticker-face-identify",
    headers: kioskHeaders,
    onMatch: useCallback(
      (raw: unknown): boolean => {
        const data = raw as IdentifyResponse | null;
        if (!data?.matched) return false;

        if (!data.hasStickerPack) {
          console.debug("[StickerKiosk] matched but no sticker pack for", data.displayName);
          onNotFound({ hasStickerPack: false });
          return true;
        }

        console.debug("[StickerKiosk] matched:", data.displayName, "— creating session");
        void kioskFetch(kioskSecret, "/api/kiosk/sticker-session", {
          method: "POST",
          body: JSON.stringify({ playerId: data.playerId }),
        })
          .then((r) => {
            if (!r.ok) {
              console.error("[StickerKiosk] sticker-session creation failed", r.status);
              onNotFound({ hasStickerPack: true });
              return;
            }
            return r.json() as Promise<SessionData>;
          })
          .then((session) => { if (session) onIdentified(session); })
          .catch(() => { onNotFound({ hasStickerPack: true }); });

        return true;
      },
      [onIdentified, onNotFound]
    ),
    onMaxAttemptsReached: useCallback(() => {
      onNotFound({ hasStickerPack: true });
    }, [onNotFound]),
  });

  const viewfinderSize = "min(70vw, 380px)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: c.bg }}>
      <KioskTopBar dark={dark} onToggleDark={onToggleDark} lang={lang} onToggleLang={onToggleLang} c={c} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, paddingTop: 16 }}>
        {/* X button */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 16 }}>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "none", color: c.text, cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center" }}
          >
            <X size={24} />
          </button>
        </div>

        <p style={{ fontSize: 22, fontWeight: 600, color: c.text, textAlign: "center", marginBottom: 24 }}>
          {scanPhase === "between_retries" ? s.noMatchRetry : s.lookCamera}
        </p>

        {/* Circle viewfinder */}
        <div
          style={{
            position: "relative",
            width: viewfinderSize,
            height: viewfinderSize,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            border: `3px solid ${scanPhase === "capturing" ? c.green : c.border}`,
            transition: "border-color 300ms ease",
            boxShadow: scanPhase === "capturing" ? `0 0 0 4px rgba(22,163,74,0.2)` : "none",
          }}
        >
          <CameraCapture ref={cameraRef} active facingMode="user" className="w-full h-full" videoClassName="w-full h-full object-cover" />

          {scanPhase !== "between_retries" && (
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: c.green, opacity: 0.6, animation: "scan-line 1.5s linear infinite" }} />
          )}

          {scanPhase === "between_retries" && retrySecondsLeft != null && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#ffffff" }}>{s.nextScanIn}</p>
              <p style={{ fontSize: 52, fontWeight: 700, color: c.green, lineHeight: 1, marginTop: 4 }}>{retrySecondsLeft}</p>
            </div>
          )}
        </div>

        <p style={{ fontSize: 14, color: c.muted, textAlign: "center", marginTop: 16 }}>
          {scanPhase === "adjust" ? s.statusAdjust : scanPhase === "capturing" ? s.statusCapturing : ""}
        </p>

        <button
          onClick={onCancel}
          style={{ background: "transparent", border: "none", color: c.muted, fontSize: 16, cursor: "pointer", textDecoration: "underline", marginTop: "auto", marginBottom: 32 }}
        >
          {s.cancel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identified screen — payment phase then QR reveal phase
// ---------------------------------------------------------------------------

const AUTO_RESET_S = 60;
const PAYMENT_TIMER_S = 20;

function StickerGrid({ stickers, compact, animate, tabletLayout }: { stickers: string[]; compact?: boolean; animate?: boolean; tabletLayout?: boolean }) {
  return (
    <div className={tabletLayout ? "sk-sticker-grid" : undefined} style={{ maxWidth: compact ? 320 : 432, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: compact ? 4 : 6 }}>
        {Array.from({ length: 4 }).map((_, i) => {
          const url = stickers[i];
          // Stagger each card: 400ms, 800ms, 1200ms, 1500ms
          const DELAYS = [400, 800, 1200, 1500];
          const delay = animate ? `${DELAYS[i]}ms` : "0ms";
          return (
            <div
              key={i}
              className={tabletLayout ? "sk-sticker-cell" : undefined}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                borderRadius: 10,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...(animate
                  ? {
                      animation: `sticker-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) both`,
                      animationDelay: delay,
                      opacity: 0,
                    }
                  : {}),
              }}
            >
              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`Sticker ${i + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              )}
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
                    opacity: 0.45,
                    transform: "rotate(-35deg)",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  PREVIEW
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IdentifiedScreen({
  session,
  kioskSettings,
  onReset,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
}: {
  session: SessionData;
  kioskSettings: KioskSettings | null;
  onReset: () => void;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
}) {
  const c = getColors(dark);
  const s = STRINGS[lang];
  const isTablet = useIsTablet();
  // "payment" → show payment QR + timer; "confirmed" → full-screen QR reveal
  const [paymentPhase, setPaymentPhase] = useState<"payment" | "confirmed">("payment");
  const [paymentTimer, setPaymentTimer] = useState(PAYMENT_TIMER_S);
  const [showPaidButton, setShowPaidButton] = useState(false);
  // Countdown shown below "I just paid" — starts at 70s, auto-resets if user does nothing
  const [paidButtonCountdown, setPaidButtonCountdown] = useState(70);
  const [countdown, setCountdown] = useState(AUTO_RESET_S);
  // Whether the sticker grid has mounted (triggers animate prop)
  const [stickersVisible, setStickersVisible] = useState(false);

  // Trigger sticker animation shortly after mount
  useEffect(() => {
    const t = setTimeout(() => setStickersVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Payment countdown → show "I just paid" after timer
  useEffect(() => {
    if (paymentPhase !== "payment") return;
    const interval = setInterval(() => {
      setPaymentTimer((n) => {
        if (n <= 1) {
          clearInterval(interval);
          setShowPaidButton(true);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentPhase]);

  // Once "I just paid" button appears, run 70s countdown then auto-reset
  useEffect(() => {
    if (!showPaidButton || paymentPhase !== "payment") return;
    const interval = setInterval(() => {
      setPaidButtonCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showPaidButton, paymentPhase]);

  // Auto-reset when paidButtonCountdown hits 0 (still on payment phase)
  useEffect(() => {
    if (showPaidButton && paymentPhase === "payment" && paidButtonCountdown === 0) {
      onReset();
    }
  }, [paidButtonCountdown, showPaidButton, paymentPhase, onReset]);

  // Auto-reset after confirmed
  useEffect(() => {
    if (paymentPhase !== "confirmed") return;
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentPhase]);

  // Trigger onReset when countdown hits 0 (avoids calling setState inside a setState updater)
  useEffect(() => {
    if (paymentPhase === "confirmed" && countdown === 0) {
      onReset();
    }
  }, [countdown, paymentPhase, onReset]);

  const price = kioskSettings?.stickerPrice ?? 30000;
  console.log("[IdentifiedScreen] kioskSettings:", JSON.stringify(kioskSettings));
  const paymentQRPayload = kioskSettings?.bankBin && kioskSettings?.bankAccount
    ? buildVietQRPayload({
        bankBin: kioskSettings.bankBin,
        accountNumber: kioskSettings.bankAccount,
        amount: price,
        paymentRef: `Sticker ${session.playerName}`.slice(0, 50),
      })
    : null;

  const handlePaid = useCallback(() => {
    setCountdown(AUTO_RESET_S);
    setPaymentPhase("confirmed");
  }, []);

  const isLight = !dark;

  return (
    <div className="sk-payment-outer" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100dvh", background: c.bg, overflow: "hidden", padding: "16px 20px 16px" }}>

      {/* Header — full width on both mobile and tablet */}
      <div className="sk-payment-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexShrink: 0 }}>
        <button
          onClick={onReset}
          aria-label="Back"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 18,
            border: "none",
            background: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.12)",
            color: isLight ? "#334155" : "#e2e8f0",
            fontSize: 22,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: c.text, margin: 0, lineHeight: 1.2 }}>
            {s.hiPlayer(session.playerName)}
          </p>
        </div>
      </div>

      {/* Payment phase — two-col on tablet, single-col on mobile */}
      {paymentPhase === "payment" && (
        <div className="sk-two-col" style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minHeight: 0 }}>

          {/* Left col (mobile: sticker grid above QR) */}
          <div className="sk-col-left" style={{ display: "flex", justifyContent: "center", width: "100%", flexShrink: 0, marginBottom: 16 }}>
            <StickerGrid stickers={session.stickers} compact animate={stickersVisible} tabletLayout />
          </div>

          {/* Right col (mobile: QR + button below stickers) */}
          <div className="sk-col-right" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 432, flex: 1 }}>
            {paymentQRPayload ? (
              <>
                <div className="sk-qr-box" style={{ background: "#ffffff", padding: 10, borderRadius: 12, display: "inline-block" }}>
                  <QRCodeSVG value={paymentQRPayload} size={isTablet ? 260 : 130} bgColor="#ffffff" fgColor="#000000" />
                </div>
                {/* Strikethrough original price */}
                <p className="sk-price-strike" style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginTop: 6, textDecoration: "line-through" }}>
                  {(price * 2).toLocaleString("vi-VN")} VND
                </p>
                {/* Sale price + badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 }}>
                  <span className="sk-price-main" style={{ fontSize: 22, fontWeight: 600, color: "#4ade80" }}>
                    {s.scanToPay(price.toLocaleString("vi-VN"))}
                  </span>
                  <span style={{ background: "#4ade80", color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }}>
                    50% OFF
                  </span>
                </div>
                {/* Caption */}
                <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 3, fontStyle: "italic" }}>
                  {lang === "vi" ? "Để tải bộ sticker của bạn" : "To download your pack"}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: c.muted, textAlign: "center", marginTop: 8 }}>{s.noQR}</p>
            )}

            <div style={{ flex: 1 }} />

            {!showPaidButton ? (
              <p style={{ fontSize: 13, color: c.dim, textAlign: "center", marginBottom: 4 }}>{s.confirmIn(paymentTimer)}</p>
            ) : (
              <div className="sk-paid-btn-wrap" style={{ width: "100%", maxWidth: 432 }}>
                <button onClick={handlePaid} style={{ ...BTN_PRIMARY, width: "100%" }}>
                  {s.iPaid}
                </button>
                <p style={{
                  fontSize: 12,
                  color: c.dim,
                  textAlign: "center",
                  marginTop: 8,
                  visibility: paidButtonCountdown <= 60 ? "visible" : "hidden",
                }}>
                  {s.resetIn(paidButtonCountdown)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmed phase: full-screen overlay slides up from bottom ── */}
      {paymentPhase === "confirmed" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: dark ? "#0a0a0a" : "#f8fafc",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 28px 32px",
            animation: "slide-up-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Top — success badge + name */}
          <div style={{ textAlign: "center", animation: "fade-in 0.4s ease 0.3s both" }}>
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 12 }}>🎉</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: c.green, margin: 0 }}>{s.confirmed}</p>
            <p style={{ fontSize: 15, color: c.text, fontWeight: 600, margin: "4px 0 0" }}>
              {s.hiPlayer(session.playerName)}
            </p>
          </div>

          {/* Center — download QR */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "fade-in 0.4s ease 0.45s both" }}>
            {/* QR card */}
            <div style={{
              background: "#ffffff",
              padding: 18,
              borderRadius: 20,
              boxShadow: dark ? "0 8px 40px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.12)",
              display: "inline-block",
            }}>
              <QRCodeSVG value={session.shopUrl} size={200} bgColor="#ffffff" fgColor="#000000" />
            </div>

            {/* Labels */}
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: c.text, margin: 0 }}>{s.scanPhone}</p>
              <p style={{ fontSize: 13, color: c.muted, margin: "6px auto 0", maxWidth: 280, textAlign: "center" }}>{s.downloadApp}</p>
            </div>
          </div>

          {/* Bottom — Done button (discreet, visible only after 15s) + countdown */}
          <div style={{ width: "100%", maxWidth: 400, animation: "fade-in 0.4s ease 0.6s both" }}>
            <button
              onClick={onReset}
              style={{
                ...BTN_BASE,
                width: "100%",
                fontSize: 15,
                height: 52,
                borderRadius: 16,
                background: "transparent",
                color: c.dim,
                border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                opacity: countdown <= AUTO_RESET_S - 15 ? 1 : 0,
                pointerEvents: countdown <= AUTO_RESET_S - 15 ? "auto" : "none",
                transition: "opacity 0.6s ease",
              }}
            >
              {s.done}
            </button>
            <p style={{
              fontSize: 12,
              color: c.dim,
              textAlign: "center",
              marginTop: 10,
              visibility: countdown <= 20 ? "visible" : "hidden",
            }}>
              {s.resetIn(countdown)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not-found screen
// ---------------------------------------------------------------------------

function NotFoundScreen({
  reason,
  onTryAgain,
  onGoBack,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
}: {
  reason: NotFoundReason;
  onTryAgain: () => void;
  onGoBack: () => void;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
}) {
  const c = getColors(dark);
  const s = STRINGS[lang];

  useEffect(() => {
    const t = setTimeout(onGoBack, 15000);
    return () => clearTimeout(t);
  }, [onGoBack]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: c.bg }}>
      <KioskTopBar dark={dark} onToggleDark={onToggleDark} lang={lang} onToggleLang={onToggleLang} c={c} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "0 32px", textAlign: "center", gap: 16 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>⚠️</span>
        <p style={{ fontSize: 22, fontWeight: 600, color: c.text, margin: 0 }}>{s.notFoundTitle}</p>
        <p style={{ fontSize: 15, color: c.muted, maxWidth: 260, margin: 0 }}>
          {reason.hasStickerPack ? s.notFoundNoFace : s.notFoundNoPack}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8 }}>
          {reason.hasStickerPack && (
            <button style={BTN_PRIMARY} onClick={onTryAgain}>{s.tryAgain}</button>
          )}
          <button style={btnSecondary(c)} onClick={onGoBack}>{s.goBack}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page — state machine + slide/flip transitions
// ---------------------------------------------------------------------------

export default function StickerKioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>("idle");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [notFoundReason, setNotFoundReason] = useState<NotFoundReason>({ hasStickerPack: true });
  const [kioskSettings, setKioskSettings] = useState<KioskSettings | null>(null);
  const [kioskSecret, setKioskSecret] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState<Lang>("vi");
  const onToggleDark = useCallback(() => setDark((d) => !d), []);
  const onToggleLang = useCallback(() => setLang((l) => (l === "vi" ? "en" : "vi")), []);

  // Fetch secret from server on mount (avoids NEXT_PUBLIC_ build-time baking issue)
  useEffect(() => {
    void fetch("/api/kiosk/sticker-config")
      .then((r) => r.json() as Promise<{ secret: string }>)
      .then((data) => setKioskSecret(data.secret ?? ""))
      .catch(() => setKioskSecret(""));
  }, []);

  // Fetch kiosk settings once the secret is available — settings endpoint requires x-kiosk-secret
  useEffect(() => {
    if (kioskSecret === null) return; // wait for secret to load
    const secret = kioskSecret;
    void fetch("/api/kiosk/settings", {
      headers: { "x-kiosk-secret": secret },
    })
      .then((r) => {
        console.log("[kiosk/settings] status:", r.status, "ok:", r.ok);
        return r.ok ? r.json() as Promise<KioskSettings> : null;
      })
      .then((data) => {
        console.log("[kiosk/settings] data:", JSON.stringify(data));
        if (data) setKioskSettings(data);
      })
      .catch((e) => console.error("[kiosk/settings] fetch error:", e));
  }, [kioskSecret]);

  type SlideOffset = "idle" | "scanning" | "animating-to-scan" | "animating-to-idle";
  const [slideOffset, setSlideOffset] = useState<SlideOffset>("idle");
  const [flipped, setFlipped] = useState(false);

  const goToScanning = useCallback(() => {
    setSlideOffset("animating-to-scan");
    setTimeout(() => {
      setKioskState("scanning");
      setSlideOffset("scanning");
    }, 400);
  }, []);

  const goToIdle = useCallback(() => {
    setFlipped(false);
    setSlideOffset("animating-to-idle");
    setTimeout(() => {
      setKioskState("idle");
      setSlideOffset("idle");
      setSessionData(null);
    }, 400);
  }, []);

  const goToIdentified = useCallback((session: SessionData) => {
    setSessionData(session);
    setFlipped(true);
    setTimeout(() => setKioskState("identified"), 600);
  }, []);

  const goToNotFound = useCallback((reason: NotFoundReason) => {
    setNotFoundReason(reason);
    setKioskState("not_found");
  }, []);

  const goToScanningFromNotFound = useCallback(() => {
    setKioskState("scanning");
    setSlideOffset("scanning");
  }, []);

  const idleSlideStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transition: "transform 400ms ease-in-out",
    transform:
      slideOffset === "animating-to-scan" || slideOffset === "scanning"
        ? "translateY(-100vh)"
        : "translateY(0)",
  };

  const scanSlideStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transition: "transform 400ms ease-in-out",
    transform:
      slideOffset === "idle" || slideOffset === "animating-to-idle"
        ? "translateY(100vh)"
        : "translateY(0)",
  };

  return (
    <>
      <style>{CSS_ANIMATIONS}</style>

      {(kioskState === "idle" ||
        kioskState === "scanning" ||
        kioskState === "identified") && (
        <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden" }}>
          {/* Idle layer */}
          <div style={idleSlideStyle}>
            <IdleScreen
              onScan={goToScanning}
              secretReady={kioskSecret !== null}
              dark={dark}
              onToggleDark={onToggleDark}
              lang={lang}
              onToggleLang={onToggleLang}
            />
          </div>

          {/* Scanning / Identified layer (flip wrapper) */}
          <div style={scanSlideStyle}>
            <div style={{ perspective: 1000, width: "100%", height: "100%" }}>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  transition: "transform 0.6s ease-in-out",
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front — scanning */}
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
                  {(kioskState === "scanning" || kioskState === "identified") && kioskSecret !== null && (
                    <ScanningScreen
                      kioskSecret={kioskSecret}
                      onIdentified={goToIdentified}
                      onNotFound={goToNotFound}
                      onCancel={goToIdle}
                      dark={dark}
                      onToggleDark={onToggleDark}
                      lang={lang}
                      onToggleLang={onToggleLang}
                    />
                  )}
                </div>

                {/* Back — identified */}
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                  {sessionData && (
                    <IdentifiedScreen
                      session={sessionData}
                      kioskSettings={kioskSettings}
                      onReset={goToIdle}
                      dark={dark}
                      onToggleDark={onToggleDark}
                      lang={lang}
                      onToggleLang={onToggleLang}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {kioskState === "not_found" && (
        <NotFoundScreen
          reason={notFoundReason}
          onTryAgain={goToScanningFromNotFound}
          onGoBack={goToIdle}
          dark={dark}
          onToggleDark={onToggleDark}
          lang={lang}
          onToggleLang={onToggleLang}
        />
      )}
    </>
  );
}
