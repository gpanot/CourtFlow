"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useFaceScanner } from "@/hooks/useFaceScanner";
import { QRCodeSVG } from "qrcode.react";
import { Camera, X } from "lucide-react";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";
import { buildVietQRPayload } from "@/lib/vietqr-payload";

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
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  bg: "#000000",
  card: "#1a1a1a",
  border: "#2a2a2a",
  text: "#ffffff",
  muted: "#9ca3af",
  dim: "#6b7280",
  green: "#4ade80",
} as const;

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
  color: "#000000",
};

const BTN_SECONDARY: React.CSSProperties = {
  ...BTN_BASE,
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
};

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
`;

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

function IdleScreen({ onScan, secretReady }: { onScan: () => void; secretReady: boolean }) {
  const [stickers, setStickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kiosk/sticker-showcase")
      .then((r) => r.json())
      .then((d: { stickers: string[] }) => setStickers(d.stickers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const half = Math.ceil(stickers.length / 2);
  const rowA = stickers.slice(0, half);
  const rowB = stickers.slice(half);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: C.bg,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
          Pickleball HCMC
        </span>
      </div>

      {/* Showcase rows */}
      <div
        style={{
          flex: "0 0 auto",
          height: "calc((100dvh - 56px) * 0.55)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
          padding: "16px 0",
          overflow: "hidden",
        }}
      >
        {loading || stickers.length === 0 ? (
          <>
            <ShimmerRow />
            <ShimmerRow />
          </>
        ) : (
          <>
            <StickerRow stickers={rowA.length > 0 ? rowA : stickers} direction="ltr" />
            <StickerRow stickers={rowB.length > 0 ? rowB : stickers} direction="rtl" />
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
            color: C.text,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Your face. Your stickers.
        </p>
        <p
          style={{
            fontSize: 15,
            color: C.muted,
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          See your personalized sticker pack in seconds
        </p>
        <div style={{ maxWidth: 340, width: "100%" }}>
          <button
            style={{ ...BTN_PRIMARY, opacity: secretReady ? 1 : 0.5, cursor: secretReady ? "pointer" : "default" }}
            onClick={secretReady ? onScan : undefined}
          >
            <Camera size={20} />
            {secretReady ? "Scan to see your stickers" : "Loading…"}
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
}: {
  kioskSecret: string;
  onIdentified: (session: SessionData) => void;
  onNotFound: (reason: NotFoundReason) => void;
  onCancel: () => void;
}) {
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

  const statusLabel: Record<ScanPhase, string> = {
    idle: "",
    adjust: "Position your face in the frame",
    capturing: "Hold still…",
    between_retries: "No match yet — retrying…",
    matched: "",
    failed: "",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100dvh",
        background: C.bg,
        paddingTop: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          marginBottom: 16,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: C.text,
            cursor: "pointer",
            padding: 8,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={24} />
        </button>
      </div>

      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: C.text,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        {scanPhase === "between_retries" ? "No match yet — retrying…" : "Look at the camera"}
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
          border: `3px solid ${scanPhase === "capturing" ? C.green : C.border}`,
          transition: "border-color 300ms ease",
          boxShadow: scanPhase === "capturing"
            ? `0 0 0 4px rgba(74,222,128,0.2)`
            : "none",
        }}
      >
        <CameraCapture
          ref={cameraRef}
          active
          facingMode="user"
          className="w-full h-full"
          videoClassName="w-full h-full object-cover"
        />

        {/* Scanning line — only during adjust/capturing */}
        {scanPhase !== "between_retries" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 2,
              background: C.green,
              opacity: 0.6,
              animation: "scan-line 1.5s linear infinite",
            }}
          />
        )}

        {/* Retry overlay */}
        {scanPhase === "between_retries" && retrySecondsLeft != null && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.55)",
            }}
          >
            <p style={{ fontSize: 18, fontWeight: 600, color: C.text }}>Next scan in</p>
            <p style={{ fontSize: 52, fontWeight: 700, color: C.green, lineHeight: 1, marginTop: 4 }}>
              {retrySecondsLeft}
            </p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 14, color: C.muted, textAlign: "center", marginTop: 16 }}>
        {statusLabel[scanPhase]}
      </p>

      <button
        onClick={onCancel}
        style={{
          background: "transparent",
          border: "none",
          color: C.muted,
          fontSize: 16,
          cursor: "pointer",
          textDecoration: "underline",
          marginTop: "auto",
          marginBottom: 32,
        }}
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identified screen — payment phase then QR reveal phase
// ---------------------------------------------------------------------------

const AUTO_RESET_S = 60;
const PAYMENT_TIMER_S = 5;

function StickerGrid({ stickers }: { stickers: string[] }) {
  return (
    <div style={{ maxWidth: 432, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {Array.from({ length: 4 }).map((_, i) => {
          const url = stickers[i];
          return (
            <div
              key={i}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1",
                borderRadius: 10,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
                    opacity: 0.25,
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
}: {
  session: SessionData;
  kioskSettings: KioskSettings | null;
  onReset: () => void;
}) {
  // "payment" → show payment QR + timer; "confirmed" → show shopUrl QR
  const [paymentPhase, setPaymentPhase] = useState<"payment" | "confirmed">("payment");
  const [paymentTimer, setPaymentTimer] = useState(PAYMENT_TIMER_S);
  const [showPaidButton, setShowPaidButton] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_RESET_S);

  // Payment countdown (5s → show "I just paid")
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

  // Auto-reset after confirmed
  useEffect(() => {
    if (paymentPhase !== "confirmed") return;
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(interval); onReset(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentPhase, onReset]);

  const price = kioskSettings?.stickerPrice ?? 30000;
  const paymentQRPayload = kioskSettings
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100dvh",
        background: C.bg,
        overflow: "hidden",
        padding: "0 20px 16px",
      }}
    >
      <p
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: C.text,
          textAlign: "center",
          marginTop: 16,
          marginBottom: 2,
        }}
      >
        Hi {session.playerName}! 👋
      </p>
      <p style={{ fontSize: 14, color: C.muted, textAlign: "center", marginBottom: 10 }}>
        {paymentPhase === "payment" ? "Complete payment to get your sticker pack" : "Payment received! Scan to access your stickers"}
      </p>

      {/* Sticker grid preview */}
      <StickerGrid stickers={session.stickers} />

      {/* Payment phase */}
      {paymentPhase === "payment" && (
        <div
          style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 432 }}
        >
          {paymentQRPayload ? (
            <>
              <div style={{ background: "#ffffff", padding: 12, borderRadius: 12, display: "inline-block" }}>
                <QRCodeSVG value={paymentQRPayload} size={148} bgColor="#ffffff" fgColor="#000000" />
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: C.text, textAlign: "center", marginTop: 8 }}>
                Scan to pay {price.toLocaleString("vi-VN")} VND
              </p>
              <p style={{ fontSize: 13, color: C.muted, textAlign: "center", marginTop: 2 }}>
                Use any Vietnamese banking app
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: C.muted, textAlign: "center", marginTop: 8 }}>
              Payment QR not configured — contact staff.
            </p>
          )}

          {/* Timer / paid button */}
          {!showPaidButton ? (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: C.dim }}>
                You can confirm payment in {paymentTimer}s…
              </p>
            </div>
          ) : (
            <button
              onClick={handlePaid}
              style={{
                ...BTN_PRIMARY,
                marginTop: 16,
                maxWidth: 432,
              }}
            >
              I just paid ✓
            </button>
          )}

          {/* Cancel */}
          <button
            onClick={onReset}
            style={{
              marginTop: 10,
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.muted,
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
              borderRadius: 12,
              padding: "9px 32px",
              width: "100%",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirmed phase — shopUrl QR */}
      {paymentPhase === "confirmed" && (
        <div
          data-qr
          style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 432 }}
        >
          <div style={{ background: "#ffffff", padding: 12, borderRadius: 12, display: "inline-block" }}>
            <QRCodeSVG value={session.shopUrl} size={160} bgColor="#ffffff" fgColor="#000000" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.green, textAlign: "center", marginTop: 8 }}>
            Payment confirmed!
          </p>
          <p style={{ fontSize: 14, fontWeight: 500, color: C.text, textAlign: "center", marginTop: 4 }}>
            Scan with your phone to access your sticker pack
          </p>
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 2 }}>
            Download your stickers directly from the app
          </p>

          <button
            onClick={onReset}
            style={{
              marginTop: 16,
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.muted,
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
              borderRadius: 12,
              padding: "9px 32px",
              width: "100%",
            }}
          >
            Done
          </button>

          <p
            style={{
              fontSize: 11,
              color: C.dim,
              textAlign: "center",
              marginTop: 8,
              visibility: countdown <= 15 ? "visible" : "hidden",
            }}
          >
            Screen resets in {countdown}s
          </p>
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
}: {
  reason: NotFoundReason;
  onTryAgain: () => void;
  onGoBack: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onGoBack, 15000);
    return () => clearTimeout(t);
  }, [onGoBack]);

  const message = reason.hasStickerPack
    ? "We couldn't recognize your face. Try again with better lighting."
    : "Ask a staff member to set up your sticker pack first.";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        background: C.bg,
        padding: "0 32px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <span style={{ fontSize: 64, lineHeight: 1 }}>⚠️</span>
      <p style={{ fontSize: 22, fontWeight: 600, color: C.text, margin: 0 }}>
        We didn&apos;t find your stickers
      </p>
      <p style={{ fontSize: 15, color: C.muted, maxWidth: 260, margin: 0 }}>
        {message}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8 }}>
        {reason.hasStickerPack && (
          <button style={BTN_PRIMARY} onClick={onTryAgain}>
            Try again
          </button>
        )}
        <button style={BTN_SECONDARY} onClick={onGoBack}>
          Go back
        </button>
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

  // Fetch secret from server on mount (avoids NEXT_PUBLIC_ build-time baking issue)
  useEffect(() => {
    void fetch("/api/kiosk/sticker-config")
      .then((r) => r.json() as Promise<{ secret: string }>)
      .then((data) => setKioskSecret(data.secret ?? ""))
      .catch(() => setKioskSecret(""));
  }, []);

  // Fetch kiosk settings once on mount
  useEffect(() => {
    void fetch("/api/kiosk/settings")
      .then((r) => r.ok ? r.json() as Promise<KioskSettings> : null)
      .then((data) => { if (data) setKioskSettings(data); })
      .catch(() => {});
  }, []);

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
            <IdleScreen onScan={goToScanning} secretReady={kioskSecret !== null} />
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
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  {(kioskState === "scanning" || kioskState === "identified") && kioskSecret !== null && (
                    <ScanningScreen
                      kioskSecret={kioskSecret}
                      onIdentified={goToIdentified}
                      onNotFound={goToNotFound}
                      onCancel={goToIdle}
                    />
                  )}
                </div>

                {/* Back — identified */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  {sessionData && (
                    <IdentifiedScreen session={sessionData} kioskSettings={kioskSettings} onReset={goToIdle} />
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
        />
      )}
    </>
  );
}
