"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  use,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { Camera, X } from "lucide-react";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";

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

const KIOSK_SECRET =
  process.env.NEXT_PUBLIC_STICKER_KIOSK_SECRET ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kioskFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-kiosk-secret": KIOSK_SECRET,
      ...(options?.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Idle — scrolling showcase rows
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
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
`;

function StickerRow({
  stickers,
  direction,
}: {
  stickers: string[];
  direction: "ltr" | "rtl";
}) {
  const doubled = [...stickers, ...stickers];
  return (
    <div
      style={{
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          animation: `${direction === "ltr" ? "scroll-ltr" : "scroll-rtl"} 28s linear infinite`,
          width: "max-content",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.animationPlayState =
            "paused")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.animationPlayState =
            "running")
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
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
  venueName,
  onScan,
}: {
  venueName: string;
  onScan: () => void;
}) {
  const [stickers, setStickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const venueId =
    typeof window !== "undefined"
      ? window.location.pathname.split("/").pop() ?? ""
      : "";

  useEffect(() => {
    fetch(`/api/kiosk/sticker-showcase?venueId=${venueId}`)
      .then((r) => r.json())
      .then((d: { stickers: string[] }) => setStickers(d.stickers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [venueId]);

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
          position: "relative",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
          {venueName}
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
          <button style={BTN_PRIMARY} onClick={onScan}>
            <Camera size={20} />
            Scan to see your stickers
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scanning screen
// ---------------------------------------------------------------------------

const CAPTURE_INTERVAL_MS = 1500;
const MAX_NO_MATCH = 5;

function ScanningScreen({
  venueId,
  onIdentified,
  onNotFound,
  onCancel,
}: {
  venueId: string;
  onIdentified: (session: SessionData) => void;
  onNotFound: (reason: NotFoundReason) => void;
  onCancel: () => void;
}) {
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const [streamReady, setStreamReady] = useState(false);
  const noMatchCount = useRef(0);
  const scanning = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scanning.current = false;
    };
  }, []);

  // Start scanning loop when stream is ready
  useEffect(() => {
    if (!streamReady) return;
    scanning.current = true;

    const timer = setInterval(async () => {
      if (!scanning.current) return;
      const frame = cameraRef.current?.captureFrame();
      if (!frame) return;

      try {
        const res = await kioskFetch("/api/kiosk/sticker-face-identify", {
          method: "POST",
          body: JSON.stringify({ venueId, imageBase64: frame }),
        });
        if (!scanning.current) return;
        const data = await res.json() as {
          matched: boolean;
          playerId?: string;
          displayName?: string;
          hasStickerPack?: boolean;
        };

        if (!data.matched) {
          noMatchCount.current += 1;
          if (noMatchCount.current >= MAX_NO_MATCH) {
            scanning.current = false;
            clearInterval(timer);
            onNotFound({ hasStickerPack: true });
          }
          return;
        }

        if (!data.hasStickerPack) {
          scanning.current = false;
          clearInterval(timer);
          onNotFound({ hasStickerPack: false });
          return;
        }

        // Matched and has sticker pack — create session
        scanning.current = false;
        clearInterval(timer);

        const sessionRes = await kioskFetch("/api/kiosk/sticker-session", {
          method: "POST",
          body: JSON.stringify({ playerId: data.playerId }),
        });
        if (!sessionRes.ok) {
          onNotFound({ hasStickerPack: true });
          return;
        }
        const session = await sessionRes.json() as SessionData;
        onIdentified(session);
      } catch {
        // network error — keep scanning
      }
    }, CAPTURE_INTERVAL_MS);

    return () => {
      scanning.current = false;
      clearInterval(timer);
    };
  }, [streamReady, venueId, onIdentified, onNotFound]);

  const viewfinderSize = "min(70vw, 380px)";

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
      {/* Close button */}
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

      {/* Title */}
      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: C.text,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        Look at the camera
      </p>

      {/* Viewfinder */}
      <div
        style={{
          position: "relative",
          width: viewfinderSize,
          height: viewfinderSize,
          borderRadius: 24,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <CameraCapture
          ref={cameraRef}
          active
          facingMode="user"
          onStreamReady={() => setStreamReady(true)}
          className="w-full h-full"
          videoClassName="w-full h-full object-cover"
        />

        {/* Corner brackets */}
        {(["tl", "tr", "bl", "br"] as const).map((pos) => (
          <div
            key={pos}
            style={{
              position: "absolute",
              width: 28,
              height: 28,
              borderColor: C.green,
              borderStyle: "solid",
              borderWidth: 0,
              ...(pos === "tl"
                ? { top: 12, left: 12, borderTopWidth: 2, borderLeftWidth: 2 }
                : pos === "tr"
                ? { top: 12, right: 12, borderTopWidth: 2, borderRightWidth: 2 }
                : pos === "bl"
                ? { bottom: 12, left: 12, borderBottomWidth: 2, borderLeftWidth: 2 }
                : {
                    bottom: 12,
                    right: 12,
                    borderBottomWidth: 2,
                    borderRightWidth: 2,
                  }),
              borderRadius: 4,
            }}
          />
        ))}

        {/* Scanning line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 2,
            background: C.green,
            opacity: 0.8,
            animation: "scan-line 1.5s linear infinite",
          }}
        />
      </div>

      <p
        style={{
          fontSize: 14,
          color: C.muted,
          textAlign: "center",
          marginTop: 16,
        }}
      >
        Hold still for 2 seconds
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
// Identified screen
// ---------------------------------------------------------------------------

const AUTO_RESET_S = 60;

function IdentifiedScreen({
  session,
  onReset,
}: {
  session: SessionData;
  onReset: () => void;
}) {
  const [countdown, setCountdown] = useState(AUTO_RESET_S);

  const resetCountdown = useCallback(() => setCountdown(AUTO_RESET_S), []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          onReset();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReset]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100dvh",
        background: C.bg,
        overflowY: "auto",
        padding: "0 24px 32px",
      }}
      onClick={(e) => {
        // Reset countdown on tap, but not if clicking the QR area
        const target = e.target as HTMLElement;
        if (!target.closest("[data-qr]")) resetCountdown();
      }}
    >
      {/* Header */}
      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: C.text,
          textAlign: "center",
          marginTop: 24,
          marginBottom: 4,
        }}
      >
        Hi {session.playerName}! 👋
      </p>
      <p
        style={{
          fontSize: 16,
          color: C.muted,
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        Your sticker pack is ready
      </p>

      {/* Sticker 2x2 grid */}
      <div
        style={{
          background: C.card,
          borderRadius: 16,
          padding: 16,
          maxWidth: 340,
          width: "100%",
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
            const url = session.stickers[i];
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 12,
                  overflow: "hidden",
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
                {/* PREVIEW watermark */}
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
                      fontSize: 18,
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

      {/* QR Code */}
      <div
        data-qr
        style={{
          marginTop: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: 16,
            borderRadius: 12,
            display: "inline-block",
          }}
        >
          <QRCodeSVG
            value={session.shopUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        <p
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: C.text,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Scan with your phone
        </p>
        <p style={{ fontSize: 14, color: C.muted, textAlign: "center" }}>
          Get your sticker pack for 30,000 VND
        </p>
      </div>

      {/* Countdown (show only when <10s) */}
      <p
        style={{
          fontSize: 12,
          color: C.dim,
          textAlign: "center",
          marginTop: 16,
          visibility: countdown <= 10 ? "visible" : "hidden",
        }}
      >
        Screen resets in {countdown}s
      </p>
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
      <p
        style={{
          fontSize: 15,
          color: C.muted,
          maxWidth: 260,
          margin: 0,
        }}
      >
        {message}
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 340,
          marginTop: 8,
        }}
      >
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
// Main page — state machine + transitions
// ---------------------------------------------------------------------------

export default function StickerKioskPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = use(params);

  const [kioskState, setKioskState] = useState<KioskState>("idle");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [notFoundReason, setNotFoundReason] = useState<NotFoundReason>({
    hasStickerPack: true,
  });
  const [venueName, setVenueName] = useState("Pickleball HCMC");

  // Slide transition: idle ↕ scanning
  const [slideOffset, setSlideOffset] = useState<"idle" | "scanning" | "animating-to-scan" | "animating-to-idle">("idle");

  // Flip transition: scanning ↔ identified
  const [flipped, setFlipped] = useState(false);

  // Fetch venue name on mount
  useEffect(() => {
    fetch(`/api/venues/${venueId}`)
      .then((r) => r.json())
      .then((d: { name?: string }) => {
        if (d.name) setVenueName(d.name);
      })
      .catch(() => {});
  }, [venueId]);

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

  // Slide offset styles
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
            <IdleScreen venueName={venueName} onScan={goToScanning} />
          </div>

          {/* Scanning / Identified layer (flip wrapper) */}
          <div style={scanSlideStyle}>
            {/* Flip wrapper */}
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
                  {(kioskState === "scanning" || kioskState === "identified") && (
                    <ScanningScreen
                      venueId={venueId}
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
                    <IdentifiedScreen session={sessionData} onReset={goToIdle} />
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
