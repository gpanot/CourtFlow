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
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function useIsTablet() {
  return useSyncExternalStore(
    subscribeToResize,
    () => (typeof window !== "undefined" ? window.innerWidth >= 768 : false),
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
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// i18n — Vietnamese / English strings
// ---------------------------------------------------------------------------

type Lang = "vi" | "en";

const STRINGS = {
  en: {
    scanBtn: "Scan to see your stickers",
    loading: "Loading…",
    heroLines: [
      "Crafted for pickleball players only!",
      "Your face. Your stickers.",
      "Nobody else has these.",
      "Super high resolution stickers.",
    ],
    heroSub: "Get your sticker pack now.",
    lookCamera: "Look at the camera",
    noMatchRetry: "No match yet — retrying…",
    nextScanIn: "Next scan in",
    statusAdjust: "Position your face in the frame",
    statusCapturing: "Hold still…",
    cancel: "Cancel",
    hiPlayer: (name: string) => `Hi ${name}! 👋`,
    paySubtitle: "Complete payment to get your sticker pack",
    alreadyPaidSubtitle: "Your stickers are ready to download",
    confirmedSubtitle: "Payment received! Scan to access your stickers",
    scanToPay: (price: string) => `Scan to pay ${price} VND`,
    anyApp: "Use any Vietnamese banking app",
    noQR: "Payment QR not configured — contact staff.",
    confirmIn: (_n: number) => `Waiting for payment confirmation…`,
    waitingPayment: "Waiting for payment…",
    iPaid: "I just paid ✓",
    cancelBtn: "Cancel",
    confirmed: "Payment confirmed!",
    scanPhone: "Scan to download your sticker pack",
    downloadApp: "Download your stickers directly in the app",
    done: "Done",
    resetIn: (n: number) => `Screen resets in ${n}s`,
    notFoundTitle: "Your stickers are not ready yet",
    notFoundNoFace: "We couldn't recognize your face. Try again with better lighting.",
    notFoundNoPack: "Ask a staff member to set up your sticker pack first.",
    tryAgain: "Try again",
    goBack: "Go back",
    wantToBuy: "I want to buy 🛒",
    generatingNow: (n: number) => `We're on it! Processing now, come back in ${n}s…`,
    funPhrases: ["I am awesome! 🔥", "You rock! 🎸", "Forever young! ✨", "I am a star! ⭐"],
    langAria: "Switch to Vietnamese",
    darkAria: "Switch to dark mode",
    lightAria: "Switch to light mode",
  },
  vi: {
    scanBtn: "Quét mặt để xem sticker",
    loading: "Đang tải…",
    heroLines: [
      "Dành riêng cho người chơi pickleball!",
      "Khuôn mặt bạn. Sticker của bạn.",
      "Không ai khác có những sticker này.",
      "Độ phân giải cực cao.",
    ],
    heroSub: "Nhận bộ sticker của bạn ngay.",
    lookCamera: "Nhìn vào camera",
    noMatchRetry: "Chưa nhận dạng được — đang thử lại…",
    nextScanIn: "Quét tiếp trong",
    statusAdjust: "Đưa mặt vào khung hình",
    statusCapturing: "Giữ nguyên…",
    cancel: "Huỷ",
    hiPlayer: (name: string) => `Chào ${name}! 👋`,
    paySubtitle: "Hoàn thành thanh toán để nhận bộ sticker",
    alreadyPaidSubtitle: "Sticker của bạn sẵn sàng để tải về",
    confirmedSubtitle: "Đã thanh toán! Quét để truy cập sticker",
    scanToPay: (price: string) => `Quét để thanh toán ${price} VND`,
    anyApp: "Dùng app ngân hàng Việt Nam bất kỳ",
    noQR: "Chưa cấu hình mã QR — liên hệ nhân viên.",
    confirmIn: (_n: number) => `Đang chờ xác nhận thanh toán…`,
    waitingPayment: "Đang chờ thanh toán…",
    iPaid: "Tôi đã thanh toán ✓",
    cancelBtn: "Huỷ",
    confirmed: "Thanh toán thành công!",
    scanPhone: "Quét để tải bộ sticker của bạn",
    downloadApp: "Tải sticker trực tiếp trong ứng dụng",
    done: "Xong",
    resetIn: (n: number) => `Màn hình đặt lại sau ${n}s`,
    notFoundTitle: "Sticker của bạn chưa sẵn sàng",
    notFoundNoFace: "Không nhận dạng được khuôn mặt. Thử lại ở nơi sáng hơn.",
    notFoundNoPack: "Nhờ nhân viên thiết lập bộ sticker trước nhé.",
    tryAgain: "Thử lại",
    goBack: "Quay lại",
    wantToBuy: "Tôi muốn mua 🛒",
    generatingNow: (n: number) => `Đang xử lý! Quay lại sau ${n} giây…`,
    funPhrases: ["Tôi thật tuyệt vời! 🔥", "Bạn thật ngầu! 🎸", "Mãi mãi trẻ trung! ✨", "Tôi là ngôi sao! ⭐"],
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
  isPaid?: boolean;
  // PayOS fields
  checkoutUrl?: string | null;
  qrCode?: string | null;
  price?: number;
}

interface KioskSettings {
  stickerPrice: number;
}

interface NotFoundReason {
  hasStickerPack: boolean;
  playerId?: string;
  gender?: string;
  playerName?: string;
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

/* ── Portrait (all sizes): sticker grid = 55% of screen, QR fills the rest ── */
@media (orientation: portrait) {
  .sk-two-col {
    flex-direction: column !important;
    align-items: center !important;
    width: 100% !important;
    height: 100% !important;
  }
  .sk-col-left {
    /* exactly 55% of viewport height */
    flex: 0 0 55dvh !important;
    height: 55dvh !important;
    width: 100% !important;
    margin-bottom: 6px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;
  }
  .sk-col-left .sk-sticker-grid {
    width: auto !important;
    max-width: 100% !important;
    height: 100% !important;
  }
  .sk-col-left .sk-sticker-grid > div {
    height: 100% !important;
    gap: 6px !important;
  }
  /* Each cell = half of 55dvh minus gap ≈ 27dvh */
  .sk-col-left .sk-sticker-cell,
  .sk-col-left .sk-sticker-grid > div > div {
    aspect-ratio: 1 !important;
    width: calc(27dvh - 6px) !important;
    height: calc(27dvh - 6px) !important;
    max-width: 48vw !important;
    max-height: 48vw !important;
  }
  .sk-col-right {
    flex: 1 !important;
    min-height: 0 !important;
    width: 100% !important;
    max-width: 480px !important;
    overflow-y: auto !important;
  }
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
    width: 459px !important;
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

        {/* Center — CourtFlow mark + "CourtFun" */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/courtflow-mark.png"
            alt=""
            style={{ width: 26, height: 26, borderRadius: 6, display: "block" }}
          />
          <span style={{ fontSize: 17, fontWeight: 700, color: isLight ? "#15803d" : "#22c55e", letterSpacing: "-0.2px" }}>
            CourtFun
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
  speed = 28,
  onStickerTap,
}: {
  stickers: string[];
  direction: "ltr" | "rtl";
  speed?: number;
  onStickerTap?: (url: string) => void;
}) {
  const doubled = [...stickers, ...stickers];
  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          animation: `${direction === "ltr" ? "scroll-ltr" : "scroll-rtl"} ${speed}s linear infinite`,
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
            onClick={() => onStickerTap?.(url)}
            style={{
              width: 110,
              height: 110,
              borderRadius: 12,
              flexShrink: 0,
              overflow: "hidden",
              cursor: onStickerTap ? "pointer" : "default",
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

const RECENT_POLL_MS = 3 * 60 * 1000; // 3 minutes

function IdleScreen({
  onScan,
  secretReady,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
  kioskSecret,
}: {
  onScan: () => void;
  secretReady: boolean;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
  kioskSecret: string | null;
}) {
  const [femaleStickers, setFemaleStickers] = useState<string[]>([]);
  const [maleStickers, setMaleStickers] = useState<string[]>([]);
  const [recentStickers, setRecentStickers] = useState<string[]>([]);
  const [recentFemaleStickers, setRecentFemaleStickers] = useState<string[]>([]);
  const [recentMaleStickers, setRecentMaleStickers] = useState<string[]>([]);
  const [recentVersion, setRecentVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  // Tap-to-preview overlay
  const [previewSticker, setPreviewSticker] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewPhrase, setPreviewPhrase] = useState("");
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPreview = useCallback((url: string, phrases: readonly string[]) => {
    // Clear any running timer so rapid taps restart cleanly
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    setPreviewPhrase(phrase);
    setPreviewSticker(url);
    setIsPreviewVisible(true);
    previewTimerRef.current = setTimeout(() => {
      setIsPreviewVisible(false);
      setTimeout(() => setPreviewSticker(null), 300);
    }, 2000);
  }, []);

  const handleStickerTap = useCallback((url: string) => {
    showPreview(url, STRINGS[lang].funPhrases);
  }, [showPreview, lang]);

  // Attract mode: show a random sticker fullscreen at a random interval (5–15s)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const delay = (5 + Math.random() * 10) * 1000; // 5000–15000 ms
      timer = setTimeout(() => {
        const allStickers = [...femaleStickers, ...maleStickers, ...recentStickers, ...recentFemaleStickers, ...recentMaleStickers].filter(Boolean);
        if (allStickers.length > 0) {
          const url = allStickers[Math.floor(Math.random() * allStickers.length)];
          showPreview(url, STRINGS[lang].funPhrases);
        }
        scheduleNext();
      }, delay);
    }
    scheduleNext();
    return () => clearTimeout(timer);
  }, [femaleStickers, maleStickers, recentStickers, recentFemaleStickers, recentMaleStickers, showPreview, lang]);

  // Animated title rotator
  const [titleIdx, setTitleIdx] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setTitleVisible(false);
      setTimeout(() => {
        setTitleIdx((i) => (i + 1) % s.heroLines.length);
        setTitleVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  const c = getColors(dark);
  const s = STRINGS[lang];

  // Initial showcase load
  useEffect(() => {
    fetch("/api/kiosk/sticker-showcase")
      .then((r) => r.json())
      .then((d: { female?: string[]; male?: string[]; stickers?: string[] }) => {
        setFemaleStickers(d.female ?? d.stickers ?? []);
        setMaleStickers(d.male ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Poll recent check-in stickers every 3 min
  const fetchRecent = useCallback(() => {
    if (!kioskSecret) return;
    fetch("/api/kiosk/recent-checkin-stickers", {
      headers: { "x-kiosk-secret": kioskSecret },
    })
      .then((r) => r.ok ? r.json() as Promise<{ stickers: string[]; female?: string[]; male?: string[] }> : null)
      .then((d) => {
        if (d && d.stickers.length > 0) {
          setRecentStickers(d.stickers);
          setRecentFemaleStickers(d.female ?? []);
          setRecentMaleStickers(d.male ?? []);
          setRecentVersion((v) => v + 1);
        }
      })
      .catch(() => {});
  }, [kioskSecret]);

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, RECENT_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchRecent]);

  // Build 4 row data sets
  // Rows A/B: recent female check-ins if available, fallback to showcase females
  const recentFemSrc = recentFemaleStickers.length >= 4 ? recentFemaleStickers : femaleStickers;
  const half = Math.ceil(recentFemSrc.length / 2);
  const rowA = recentFemSrc.slice(0, half);
  const rowB = recentFemSrc.slice(half);
  // Row C: all recent check-ins (mixed gender — shows who just played), fallback females
  const rowC = recentStickers.length >= 4
    ? recentStickers
    : [...recentStickers, ...femaleStickers].slice(0, Math.max(recentStickers.length, 8));
  // Row D: recent male check-ins if available, fallback to showcase males (then females)
  const targetLen = rowA.length > 0 ? rowA.length : 8;
  let rowDRaw = recentMaleStickers.length >= 4
    ? recentMaleStickers
    : maleStickers.length > 0 ? maleStickers : femaleStickers;
  // Guard: if source is empty, skip the loop to avoid infinite expansion of []
  if (rowDRaw.length > 0) {
    while (rowDRaw.length < targetLen) rowDRaw = [...rowDRaw, ...rowDRaw];
  }
  const rowD = rowDRaw.slice(0, targetLen);

  const anyLoaded = femaleStickers.length > 0 || maleStickers.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: c.bg }}>
      <KioskTopBar dark={dark} onToggleDark={onToggleDark} lang={lang} onToggleLang={onToggleLang} c={c} />

      {/* Showcase rows — 4 bands */}
      <div
        style={{
          flex: "0 0 auto",
          height: "calc((100dvh - 56px) * 0.6)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 6,
          padding: "8px 0",
          overflow: "hidden",
        }}
      >
        {loading || !anyLoaded ? (
          <>
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
          </>
        ) : (
          <>
            <StickerRow stickers={rowA.length > 0 ? rowA : femaleStickers} direction="ltr" onStickerTap={handleStickerTap} />
            <StickerRow stickers={rowB.length > 0 ? rowB : femaleStickers} direction="rtl" onStickerTap={handleStickerTap} />
            {/* Row C: live recent check-ins, remounts when new data arrives */}
            <StickerRow
              key={`recent-${recentVersion}`}
              stickers={rowC.length > 0 ? rowC : femaleStickers}
              direction="ltr"
              onStickerTap={handleStickerTap}
            />
            {/* Row D: men only (padded to same length as other rows for consistent speed) */}
            <StickerRow
              stickers={rowD}
              direction="rtl"
              onStickerTap={handleStickerTap}
            />
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
        <p
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: c.text,
            textAlign: "center",
            marginBottom: 8,
            opacity: titleVisible ? 1 : 0,
            transform: titleVisible ? "translateY(0)" : "translateY(8px)",
            transition: titleVisible
              ? "opacity 400ms ease-out, transform 400ms ease-out"
              : "opacity 300ms ease-in",
          }}
        >
          {s.heroLines[titleIdx]}
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

      {/* Sticker tap-to-preview / attract-mode overlay */}
      {previewSticker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            pointerEvents: "none",
            backgroundColor: "rgba(0,0,0,0.82)",
            opacity: isPreviewVisible ? 1 : 0,
            transition: "opacity 300ms ease",
            gap: 24,
          }}
        >
          {/* Fun phrase */}
          <p style={{
            fontSize: "clamp(20px, 4.2vw, 40px)",
            fontWeight: 900,
            color: "#4ade80",
            textAlign: "center",
            margin: 0,
            padding: "0 24px",
            letterSpacing: "-0.5px",
            transform: isPreviewVisible ? "translateY(0) scale(1)" : "translateY(-16px) scale(0.9)",
            transition: "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            textShadow: "0 0 40px rgba(74,222,128,0.5)",
          }}>
            {previewPhrase}
          </p>

          {/* Sticker image */}
          <div style={{ position: "relative", width: "min(49vw, 49vh, 294px)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSticker}
              alt=""
              style={{
                width: "100%",
                height: "auto",
                objectFit: "contain",
                display: "block",
                transform: isPreviewVisible ? "scale(1)" : "scale(0.3)",
                transition: "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />
            {/* PREVIEW watermark */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ color: "#fff", fontSize: "clamp(18px,4vw,32px)", fontWeight: 700, opacity: 0.45, transform: "rotate(-35deg)", userSelect: "none", whiteSpace: "nowrap", letterSpacing: 4 }}>
                PREVIEW
              </span>
            </div>
          </div>
        </div>
      )}
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
    gender?: string;
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
          onNotFound({ hasStickerPack: false, playerId: data.playerId, gender: data.gender, playerName: data.displayName });
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
    overrides: { maxFaceAttempts: 2, retryIdleMs: 500, cameraWarmupMs: 800 },
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
          <div style={{ width: "100%", height: "100%", transform: "scaleX(-1)" }}>
            <CameraCapture ref={cameraRef} active facingMode="user" className="w-full h-full" videoClassName="w-full h-full object-cover" />
          </div>

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
    <div className="sk-sticker-grid" style={{ maxWidth: compact ? 320 : 432, width: "100%" }}>
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
                    opacity: 0.65,
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
  // If the player already paid, skip straight to "confirmed"
  const [paymentPhase, setPaymentPhase] = useState<"payment" | "confirmed">(
    session.isPaid ? "confirmed" : "payment"
  );
  // Countdown for auto-reset while waiting for payment (no payment detected in time)
  const [paymentCountdown, setPaymentCountdown] = useState(90);
  const [countdown, setCountdown] = useState(AUTO_RESET_S);
  // Whether the sticker grid has mounted (triggers animate prop)
  const [stickersVisible, setStickersVisible] = useState(false);

  // Trigger sticker animation shortly after mount
  useEffect(() => {
    const t = setTimeout(() => setStickersVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Poll payment status every 3s while in payment phase
  useEffect(() => {
    if (paymentPhase !== "payment" || !session.token) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/player/sticker-payment-status?token=${encodeURIComponent(session.token)}`);
        if (!res.ok) return;
        const data = await res.json() as { isPaid: boolean };
        if (data.isPaid) {
          clearInterval(interval);
          setCountdown(AUTO_RESET_S);
          setPaymentPhase("confirmed");
        }
      } catch { /* network error — keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentPhase, session.token]);

  // 90s countdown while waiting for payment — auto-reset if no payment received
  useEffect(() => {
    if (paymentPhase !== "payment") return;
    const interval = setInterval(() => {
      setPaymentCountdown((n) => {
        if (n <= 1) { clearInterval(interval); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentPhase]);

  // Auto-reset when paymentCountdown hits 0 (no payment received in time)
  useEffect(() => {
    if (paymentPhase === "payment" && paymentCountdown === 0) {
      onReset();
    }
  }, [paymentCountdown, paymentPhase, onReset]);

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

  const price = session.price ?? kioskSettings?.stickerPrice ?? 30000;

  // PayOS: use the QR code string returned by the payment link creation
  const payosQrCode = session.qrCode ?? null;

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
          <div className="sk-col-left" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <StickerGrid stickers={session.stickers} compact animate={stickersVisible} tabletLayout />
          </div>

          {/* Right col (mobile: QR + button below stickers) */}
          <div className="sk-col-right" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 432, flex: 1 }}>
            {payosQrCode ? (
              <>
                {/* PayOS VietQR code rendered as SVG */}
                <div className="sk-qr-box" style={{ background: "#ffffff", padding: 10, borderRadius: 12, display: "inline-block" }}>
                  <QRCodeSVG value={payosQrCode} size={isTablet ? 260 : 160} bgColor="#ffffff" fgColor="#000000" />
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
                <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>
                  {lang === "vi" ? "Để tải bộ sticker của bạn" : "To download your pack"}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: c.muted, textAlign: "center", marginTop: 8 }}>{s.noQR}</p>
            )}

            <div style={{ flex: 1 }} />

            {/* Polling indicator + urgency countdown */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: c.dim, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4ade80", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
                {s.waitingPayment}
              </p>
              <p style={{
                fontSize: 13,
                fontWeight: paymentCountdown <= 30 ? 700 : 500,
                color: paymentCountdown <= 30 ? "#f87171" : c.dim,
                letterSpacing: "0.01em",
                transition: "color 0.3s",
                margin: 0,
              }}>
                ⏱ {s.resetIn(paymentCountdown)}
              </p>
            </div>
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
            padding: "16px 28px 32px",
            animation: "slide-up-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Top-left back button */}
          <div style={{ width: "100%", display: "flex", alignItems: "center", marginBottom: 8 }}>
            <button
              onClick={onReset}
              aria-label="Back"
              style={{
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
          </div>

          {/* Top — success badge + name */}
          <div style={{ textAlign: "center", animation: "fade-in 0.4s ease 0.3s both" }}>
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 12 }}>🎉</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: c.green, margin: 0 }}>
              {session.isPaid ? s.alreadyPaidSubtitle : s.confirmed}
            </p>
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

const FAKE_TIMER_SECONDS = 130;

function NotFoundScreen({
  reason,
  onTryAgain,
  onGoBack,
  dark,
  onToggleDark,
  lang,
  onToggleLang,
  kioskSecret,
}: {
  reason: NotFoundReason;
  onTryAgain: () => void;
  onGoBack: () => void;
  dark: boolean;
  onToggleDark: () => void;
  lang: Lang;
  onToggleLang: () => void;
  kioskSecret: string | null;
}) {
  const c = getColors(dark);
  const s = STRINGS[lang];

  // Auto-go-back after 30s (extended since player may be waiting for processing)
  const autoBackSecs = reason.hasStickerPack ? 15 : 30;
  useEffect(() => {
    const t = setTimeout(onGoBack, autoBackSecs * 1000);
    return () => clearTimeout(t);
  }, [onGoBack, autoBackSecs]);

  // "I want to buy" flow — only for !hasStickerPack (no pack generated yet)
  const [buying, setBuying] = useState(false);
  const [fakeSecondsLeft, setFakeSecondsLeft] = useState(FAKE_TIMER_SECONDS);

  const handleWantToBuy = useCallback(() => {
    if (buying || !reason.playerId) return;
    setBuying(true);

    // Enqueue the sticker generation job — fire and forget, never blocks UI
    fetch("/api/kiosk/enqueue-sticker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kiosk-secret": kioskSecret ?? "",
      },
      body: JSON.stringify({ playerId: reason.playerId }),
    }).catch(console.error);
  }, [buying, reason.playerId, kioskSecret]);

  // Countdown timer while processing
  useEffect(() => {
    if (!buying) return;
    if (fakeSecondsLeft <= 0) return;
    const t = setInterval(() => setFakeSecondsLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [buying, fakeSecondsLeft]);

  const showBuyButton = !reason.hasStickerPack && !!reason.playerId && !buying;
  const showProcessing = !reason.hasStickerPack && buying;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: c.bg }}>
      <KioskTopBar dark={dark} onToggleDark={onToggleDark} lang={lang} onToggleLang={onToggleLang} c={c} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "0 32px", textAlign: "center", gap: 16 }}>
        <span style={{ fontSize: 64, lineHeight: 1 }}>😅</span>
        <p style={{ fontSize: 22, fontWeight: 600, color: c.text, margin: 0 }}>{s.notFoundTitle}</p>
        <p style={{ fontSize: 15, color: c.muted, maxWidth: 300, margin: 0 }}>
          {reason.hasStickerPack
            ? s.notFoundNoFace
            : reason.playerName
              ? (lang === "vi"
                ? `Đừng lo ${reason.playerName.split(" ").pop()}, chúng tôi đang xử lý nhé!`
                : `Don't worry ${reason.playerName.split(" ").pop()}, we're on it!`)
              : s.notFoundNoPack}
        </p>

        {showProcessing && (
          <div style={{
            background: dark ? "#1a2e1a" : "#e8f5e9",
            border: "1px solid #4ade80",
            borderRadius: 16,
            padding: "16px 24px",
            maxWidth: 340,
            width: "100%",
          }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#4ade80", margin: "0 0 8px 0" }}>
              {s.generatingNow(fakeSecondsLeft)}
            </p>
            {/* Progress bar */}
            <div style={{ background: dark ? "#333" : "#ddd", borderRadius: 999, height: 6, overflow: "hidden" }}>
              <div style={{
                background: "#4ade80",
                height: "100%",
                borderRadius: 999,
                width: `${Math.round(((FAKE_TIMER_SECONDS - fakeSecondsLeft) / FAKE_TIMER_SECONDS) * 100)}%`,
                transition: "width 1s linear",
              }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8 }}>
          {reason.hasStickerPack && (
            <button style={BTN_PRIMARY} onClick={onTryAgain}>{s.tryAgain}</button>
          )}
          {showBuyButton && (
            <button style={BTN_PRIMARY} onClick={handleWantToBuy}>{s.wantToBuy}</button>
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
              kioskSecret={kioskSecret}
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
          kioskSecret={kioskSecret}
        />
      )}
    </>
  );
}
