"use client";

import { useRef, useState, useCallback } from "react";
import { useFaceScanner } from "@/hooks/useFaceScanner";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { CameraCapture, type CameraCaptureHandle } from "@/components/camera-capture";
import { cn } from "@/lib/cn";
import { TvTabletLanguageToggle } from "@/components/tv-tablet-language-toggle";
import { tvI18n } from "@/i18n/tv-i18n";
import { useSuccessChime } from "@/hooks/use-success-chime";

type ScanState =
  | "idle"
  | "scanning"
  | "joined"
  | "already_queued"
  | "playing"
  | "not_checked_in"
  | "not_recognised"
  | "error";

interface ScanResult {
  playerName?: string;
  queueNumber?: number;
  queuePosition?: number;
  courtLabel?: string;
  error?: string;
}

const RESULT_DISPLAY_MS: Record<string, number> = {
  joined: 2000,
  already_queued: 3000,
  playing: 3000,
  not_checked_in: 3000,
  error: 3000,
};


interface TvQueueScannerProps {
  venueId: string;
}

export function TvQueueScanner({ venueId }: TvQueueScannerProps) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const { unlockChime, playSuccessChime } = useSuccessChime();
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<ScanResult>({});
  const [numberInput, setNumberInput] = useState("");
  const [numberLoading, setNumberLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const stateRef = useRef<ScanState>("idle");

  const resetToIdle = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    cameraRef.current?.stopCamera();
    stateRef.current = "idle";
    setState("idle");
    setResult({});
    setNumberInput("");
    setCameraError(null);
  }, []);

  const scheduleReset = useCallback(
    (ms: number) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, ms);
    },
    [resetToIdle]
  );

  const handleScanResult = useCallback(
    (data: { resultType: string; playerName?: string; queueNumber?: number; queuePosition?: number; courtLabel?: string; error?: string }) => {
      cameraRef.current?.stopCamera();

      const scanState = (
        {
          joined: "joined",
          already_queued: "already_queued",
          playing: "playing",
          not_checked_in: "not_checked_in",
          not_recognised: "not_recognised",
          error: "error",
        } as Record<string, ScanState>
      )[data.resultType] ?? "error";

      stateRef.current = scanState;
      setState(scanState);
      setResult({
        playerName: data.playerName,
        queueNumber: data.queueNumber,
        queuePosition: data.queuePosition,
        courtLabel: data.courtLabel,
        error: data.error,
      });

      if (scanState === "joined") {
        playSuccessChime();
      }

      if (scanState !== "not_recognised") {
        scheduleReset(RESULT_DISPLAY_MS[scanState] ?? 3000);
      }
    },
    [playSuccessChime, scheduleReset]
  );

  const beginFaceScan = useCallback(() => {
    if (stateRef.current === "scanning") return;
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setCameraError(null);
    setNumberInput("");
    unlockChime();
    stateRef.current = "scanning";
    setState("scanning");
  }, [unlockChime]);

  type TvQueueJoinResponse = {
    success: boolean;
    resultType: string;
    playerName?: string;
    queueNumber?: number;
    queuePosition?: number;
    courtLabel?: string;
    error?: string;
  };

  /* ─── Face scan loop — via useFaceScanner hook ────── */
  const { phase: scanPhase, retrySecondsLeft } = useFaceScanner({
    cameraRef,
    active: state === "scanning",
    endpoint: "/api/tv-queue/join",
    extraBody: { venueId },
    onMatch: useCallback(
      (raw: unknown): boolean => {
        const res = raw as TvQueueJoinResponse | null;
        if (!res) {
          // Network error — treat as not_recognised so the loop retries
          return false;
        }
        if (!res.success) {
          handleScanResult({ resultType: "error", error: res.error ?? "Recognition failed" });
          return true;
        }
        if (res.resultType === "not_recognised") {
          return false;
        }
        handleScanResult(res);
        return true;
      },
      [handleScanResult]
    ),
    onMaxAttemptsReached: useCallback(() => {
      // All attempts exhausted with not_recognised — call handleScanResult
      handleScanResult({ resultType: "not_recognised" });
    }, [handleScanResult]),
  });

  const handleNumberSubmit = useCallback(async () => {
    const num = parseInt(numberInput, 10);
    if (!num || num < 1) return;
    unlockChime();
    setNumberLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        resultType: string;
        playerName?: string;
        queueNumber?: number;
        queuePosition?: number;
        courtLabel?: string;
        error?: string;
      }>("/api/tv-queue/join-by-number", { venueId, queueNumber: num });

      if (!res.success) {
        handleScanResult({ resultType: "error", error: res.error ?? "Could not join queue" });
      } else {
        handleScanResult(res);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      const isNetwork = !navigator.onLine || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network");
      handleScanResult({ resultType: "error", error: isNetwork ? "Network issue \u2014 see staff" : msg });
    } finally {
      setNumberLoading(false);
    }
  }, [venueId, numberInput, handleScanResult, unlockChime]);

  const onCameraError = useCallback(
    (msg: string) => {
      setCameraError(msg);
      if (stateRef.current === "scanning") {
        cameraRef.current?.stopCamera();
        stateRef.current = "error";
        setState("error");
        setResult({ error: msg });
        scheduleReset(4000);
      }
    },
    [scheduleReset]
  );

  const bgColor = {
    idle: "bg-black",
    scanning: "bg-black",
    joined: "bg-green-950",
    already_queued: "bg-amber-950",
    playing: "bg-blue-950",
    not_checked_in: "bg-red-950",
    not_recognised: "bg-neutral-900",
    error: "bg-red-950",
  }[state];

  return (
    <div className={cn("relative flex h-full w-full flex-col transition-colors duration-300", bgColor)}>
      {state === "scanning" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-center text-lg text-neutral-300">
            {scanPhase === "between_retries"
              ? t("tablet.tvQueueScanner.scanNoMatch")
              : scanPhase === "adjust"
                ? t("tablet.tvQueueScanner.scanAdjust")
                : t("tablet.tvQueueScanner.scanHoldStill")}
          </p>
          {/* Same width as 16:9 preview, twice the height (8:9 box). Preview mirrored horizontally for display only; capture uses the raw stream. */}
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-green-600/40 bg-black shadow-lg shadow-green-900/20 aspect-[8/9]">
            <CameraCapture
              ref={cameraRef}
              active
              onError={onCameraError}
              className="h-full w-full"
              videoClassName="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {scanPhase === "between_retries" && retrySecondsLeft != null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-4 text-center">
                <p className="text-2xl font-semibold text-white">{t("tablet.tvQueueScanner.nextScanIn")}</p>
                <p className="mt-2 text-5xl font-bold tabular-nums text-green-400">{retrySecondsLeft}</p>
              </div>
            )}
          </div>
          {cameraError ? (
            <p className="text-center text-sm text-red-400">{cameraError}</p>
          ) : scanPhase === "between_retries" ? (
            <p className="text-sm text-amber-200/90">{t("tablet.tvQueueScanner.retryAuto")}</p>
          ) : scanPhase === "capturing" ? (
            <div className="flex items-center gap-3 text-neutral-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-green-500" />
              <span>{t("tablet.tvQueueScanner.scanning")}</span>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">{t("tablet.tvQueueScanner.cameraReady")}</p>
          )}
        </div>
      )}

      {state === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
          <div className="absolute right-6 top-6 z-20">
            <TvTabletLanguageToggle />
          </div>
          <div className="h-32 w-32 rounded-full border-4 border-green-500/40" />
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">{t("tablet.tvQueueScanner.readyTitle")}</h1>
            <p className="text-xl text-neutral-400">{t("tablet.tvQueueScanner.readyHint")}</p>
          </div>
          <button
            type="button"
            onClick={beginFaceScan}
            className="w-full max-w-lg rounded-3xl bg-green-600 px-8 py-7 text-2xl font-bold text-white shadow-lg shadow-green-900/40 transition-colors hover:bg-green-500 active:scale-[0.99] min-h-[3.75rem] sm:min-h-[4.5rem] sm:px-12 sm:py-8 sm:text-3xl"
          >
            {t("tablet.tvQueueScanner.scanToJoin")}
          </button>
          <p className="max-w-md text-sm text-neutral-600">
            {t("tablet.tvQueueScanner.checkInFirstHint")}
          </p>
        </div>
      )}

      {state === "joined" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-600">
            <span className="text-3xl">✓</span>
          </div>
          {result.queueNumber != null && (
            <p className="text-7xl font-bold text-green-400">#{result.queueNumber}</p>
          )}
          {result.queuePosition != null && (
            <p className="text-2xl text-green-300">
              {t("tablet.tvQueueScanner.queuePosition", { count: result.queuePosition })}
            </p>
          )}
          {result.playerName && (
            <p className="text-xl text-white">{t("tablet.tvQueueScanner.welcomeName", { name: result.playerName })}</p>
          )}
        </div>
      )}

      {state === "already_queued" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-600">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-3xl font-bold text-amber-300">
            {t("tablet.tvQueueScanner.alreadyInQueue")}
          </h2>
          {result.queuePosition != null && (
            <p className="text-xl text-amber-200">
              {t("tablet.tvQueueScanner.aheadOfYou", { count: result.queuePosition })}
            </p>
          )}
          <p className="text-lg text-neutral-400">{t("tablet.tvQueueScanner.noNeedScan")}</p>
        </div>
      )}

      {state === "playing" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600">
            <span className="text-3xl">🏓</span>
          </div>
          <h2 className="text-3xl font-bold text-blue-300">
            {t("tablet.tvQueueScanner.playingOn", { court: result.courtLabel ?? t("tablet.tvQueueScanner.aCourt") })}
          </h2>
          <p className="text-lg text-neutral-400">{t("tablet.tvQueueScanner.finishGameFirst")}</p>
        </div>
      )}

      {state === "not_checked_in" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">
            {t("tablet.tvQueueScanner.checkInFirst")}
          </h2>
          <p className="text-lg text-neutral-400">
            {t("tablet.tvQueueScanner.goToEntrance")}
          </p>
        </div>
      )}

      {state === "not_recognised" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <div className="absolute right-6 top-6 z-20">
            <TvTabletLanguageToggle />
          </div>
          <h2 className="text-2xl font-bold text-neutral-200">
            {t("tablet.tvQueueScanner.faceNotRecognized")}
          </h2>
          <p className="text-lg text-neutral-400">
            {t("tablet.tvQueueScanner.faceRetryHint")}
          </p>
          <button
            type="button"
            onClick={beginFaceScan}
            className="w-full max-w-lg rounded-3xl bg-green-600 px-8 py-7 text-2xl font-bold text-white transition-colors hover:bg-green-500 active:scale-[0.99] min-h-[3.75rem] sm:min-h-[4.5rem] sm:px-12 sm:py-8 sm:text-3xl"
          >
            {t("tablet.tvQueueScanner.scanToJoin")}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <input
              type="number"
              inputMode="numeric"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="#"
              className="w-32 rounded-xl border-2 border-neutral-600 bg-neutral-900 px-4 py-3 text-center text-3xl font-bold text-white placeholder:text-neutral-700 focus:border-green-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleNumberSubmit();
              }}
            />
            <button
              type="button"
              disabled={numberLoading || !numberInput}
              onClick={() => void handleNumberSubmit()}
              className="rounded-xl bg-neutral-700 px-6 py-3 text-lg font-semibold text-white hover:bg-neutral-600 disabled:opacity-50"
            >
              {numberLoading ? "..." : t("tablet.tvQueueScanner.joinByNumber")}
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">⚠</span>
          </div>
          <p className="text-xl text-red-300">{result.error ?? "Something went wrong"}</p>
        </div>
      )}
    </div>
  );
}
