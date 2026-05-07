"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Camera, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CameraCapture, type CameraCaptureHandle } from "@/components/camera-capture";
import { cn } from "@/lib/cn";
import { BalanceTopBar } from "./BalanceTopBar";
import type { IdentifyResult } from "./types";

const CAMERA_WARMUP_MS = 1500;
const CAPTURE_POLL_MS = 200;
const CAPTURE_MAX_ATTEMPTS = 30;
const MAX_FACE_ATTEMPTS = 3;
const RETRY_COUNTDOWN_FROM = 3; // 3…2…1…0 then rescan
const FAILED_DISMISS_MS = 2500; // show "Face not found" then auto-return to phone

type ScanPhase = "adjust" | "capturing" | "between_retries" | "done" | "failed";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

interface IdentifyStateProps {
  onIdentified: (result: IdentifyResult, phone: string) => void;
}

export function IdentifyState({ onIdentified }: IdentifyStateProps) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("adjust");
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [faceError, setFaceError] = useState("");
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const cancelledRef = useRef(false);

  const handlePhoneSubmit = useCallback(async () => {
    const trimmed = phone.trim();
    if (trimmed.length < 8) {
      setError(t("balance.phoneError"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ phone: trimmed });
      const res = await fetch(`/api/balance/identify?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("balance.connectionError"));
        return;
      }
      if (data.found) {
        onIdentified(data as IdentifyResult, trimmed);
      } else {
        setError(t("balance.phoneNotFound"));
      }
    } catch {
      setError(t("balance.connectionError"));
    } finally {
      setLoading(false);
    }
  }, [phone, onIdentified, t]);

  const submitFrame = useCallback(
    async (imageBase64: string): Promise<"done" | "retry"> => {
      try {
        const res = await fetch("/api/balance/identify-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64 }),
        });
        const data = await res.json();
        if (!res.ok) return "retry";
        if (data.found && data.phone) {
          onIdentified(data as IdentifyResult, data.phone);
          return "done";
        }
        return "retry";
      } catch {
        return "retry";
      }
    },
    [onIdentified]
  );

  // Auto-capture loop (mirrors mobile SelfCheckInReturningFaceScanner)
  useEffect(() => {
    if (!showCamera) return;

    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setFaceError("");

    let cancelled = false;
    cancelledRef.current = false;

    (async () => {
      for (let attempt = 1; attempt <= MAX_FACE_ATTEMPTS && !cancelled; attempt++) {
        setScanPhase("adjust");
        await sleep(CAMERA_WARMUP_MS);
        if (cancelled) return;

        setScanPhase("capturing");

        let frame: string | null = null;
        for (let i = 0; i < CAPTURE_MAX_ATTEMPTS && !cancelled; i++) {
          const f = cameraRef.current?.captureFrame();
          if (f) { frame = f; break; }
          await sleep(CAPTURE_POLL_MS);
        }

        if (cancelled) return;

        if (!frame) {
          setScanPhase("failed");
          setFaceError(t("balance.faceNotRecognised"));
          await sleep(FAILED_DISMISS_MS);
          if (!cancelled) setShowCamera(false);
          return;
        }

        const outcome = await submitFrame(frame);
        if (cancelled) return;

        if (outcome === "done") {
          setScanPhase("done");
          cameraRef.current?.stopCamera();
          return;
        }

        // Between retries: countdown 3→2→1→0 below the circle
        if (attempt < MAX_FACE_ATTEMPTS) {
          setScanPhase("between_retries");
          for (let s = RETRY_COUNTDOWN_FROM; s >= 0 && !cancelled; s--) {
            setRetrySecondsLeft(s);
            await sleep(1000);
          }
          setRetrySecondsLeft(null);
        }
      }

      // All attempts exhausted — show red error then auto-return to phone screen
      if (!cancelled) {
        setScanPhase("failed");
        setFaceError(t("balance.faceNotRecognised"));
        await sleep(FAILED_DISMISS_MS);
        if (!cancelled) {
          cameraRef.current?.stopCamera();
          setShowCamera(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [showCamera, submitFrame, t]);

  const closeCamera = useCallback(() => {
    cancelledRef.current = true;
    cameraRef.current?.stopCamera();
    setShowCamera(false);
    setFaceError("");
    setScanPhase("adjust");
  }, []);

  const CIRCLE_SIZE = 280;

  const hintText =
    scanPhase === "adjust"
      ? t("balance.positionFace")
      : scanPhase === "capturing"
        ? t("balance.holdStill")
        : "";

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "var(--bal-bg)" }}
    >
      <BalanceTopBar />

      <div className="flex flex-1 flex-col items-center px-6 py-10">
        <h1 className="mt-2 text-2xl font-bold" style={{ color: "var(--bal-text)" }}>
          {t("balance.title")}
        </h1>

        {showCamera ? (
          <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-5">
            {/* Hint text */}
            <p className="text-center text-base" style={{ color: "var(--bal-text-secondary)" }}>
              {hintText}
            </p>

            {/* Circle camera — no shadow so the face is clearly visible */}
            <div
              className="relative overflow-hidden"
              style={{
                width: CIRCLE_SIZE,
                height: CIRCLE_SIZE,
                borderRadius: CIRCLE_SIZE / 2,
                border: "3px solid rgba(34, 197, 94, 0.45)",
                background: "#000",
              }}
            >
              <div
                className="overflow-hidden"
                style={{
                  width: CIRCLE_SIZE - 6,
                  height: CIRCLE_SIZE - 6,
                  borderRadius: (CIRCLE_SIZE - 6) / 2,
                }}
              >
                <CameraCapture
                  ref={cameraRef}
                  active={showCamera}
                  className="h-full w-full"
                  videoClassName="h-full w-full object-cover [transform:scaleX(-1)] scale-[1.18] -translate-y-[9%]"
                />
              </div>
            </div>

            {/* Status below circle — no overlays on the video feed */}
            {scanPhase === "capturing" && (
              <div className="flex items-center gap-2.5">
                <Loader2
                  className="h-5 w-5 animate-spin"
                  style={{ color: "var(--bal-green)" }}
                />
                <span className="text-sm" style={{ color: "var(--bal-muted)" }}>
                  {t("balance.scanning")}
                </span>
              </div>
            )}

            {scanPhase === "between_retries" && retrySecondsLeft != null && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium" style={{ color: "var(--bal-red)" }}>
                  {t("balance.faceNotFound")}
                </p>
                <span
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: "var(--bal-green-text)" }}
                >
                  {retrySecondsLeft}
                </span>
              </div>
            )}

            {scanPhase === "failed" && faceError && (
              <p className="text-center text-sm font-medium" style={{ color: "var(--bal-red)" }}>
                {faceError}
              </p>
            )}

            {/* Close / back to phone */}
            <button
              onClick={closeCamera}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: "var(--bal-subtle)" }}
            >
              <X className="h-4 w-4" />
              {t("balance.closeCamera")}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-8 w-full max-w-sm">
              <label
                className="mb-2 block text-sm"
                style={{ color: "var(--bal-muted)" }}
              >
                {t("balance.phoneLabel")}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePhoneSubmit(); }}
                placeholder={t("balance.phonePlaceholder")}
                className={cn(
                  "w-full rounded-xl border px-4 py-3.5 text-lg focus:outline-none focus:ring-2",
                  error ? "border-red-500/50 focus:ring-red-500/30" : "focus:ring-green-500/30"
                )}
                style={{
                  background: "var(--bal-input-bg)",
                  borderColor: error ? undefined : "var(--bal-border)",
                  color: "var(--bal-text)",
                }}
              />
              {error && (
                <p className="mt-2 text-sm" style={{ color: "var(--bal-red)" }}>{error}</p>
              )}
              <button
                onClick={handlePhoneSubmit}
                disabled={loading || phone.trim().length < 8}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white transition-colors disabled:opacity-40"
                style={{ background: "var(--bal-green)" }}
              >
                {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                {t("balance.checkBalance")}
              </button>
            </div>

            <div className="my-8 flex w-full max-w-sm items-center gap-3">
              <div className="h-px flex-1" style={{ background: "var(--bal-border)" }} />
              <span className="text-xs" style={{ color: "var(--bal-dimmed)" }}>
                {t("balance.or")}
              </span>
              <div className="h-px flex-1" style={{ background: "var(--bal-border)" }} />
            </div>

            <div className="w-full max-w-sm text-center">
              <button
                onClick={() => { setShowCamera(true); setFaceError(""); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white transition-colors"
                style={{ background: "var(--bal-green)" }}
              >
                <Camera className="h-5 w-5" />
                {t("balance.scanFace")}
              </button>
              <p className="mt-2 text-xs" style={{ color: "var(--bal-subtle)" }}>
                {t("balance.scanFaceHint")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
