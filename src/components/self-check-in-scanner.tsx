"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";
import { KioskConfirmationScreen } from "@/components/kiosk-confirmation-screen";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, Smartphone } from "lucide-react";

type ScanState =
  | "idle"
  | "scanning"
  | "confirmed"
  | "error"
  | "no_face"
  | "needs_registration"
  | "network_error"
  | "phone_enter"
  | "phone_preview";

interface CheckInResult {
  displayName?: string;
  queueNumber?: number;
  queuePosition?: number;
  skillLevel?: string;
  totalSessions?: number;
  isReturning?: boolean;
  alreadyCheckedIn?: boolean;
  error?: string;
}

interface PhonePreview {
  success: boolean;
  player: {
    id: string;
    name: string;
    phone: string;
    skillLevel: string;
    gender: string;
  };
  alreadyCheckedIn: boolean;
  queueNumber?: number;
  totalSessions?: number;
}

const CONFIRMED_DISPLAY_MS = 8000;
const ALREADY_DISPLAY_MS = 5000;
const ERROR_DISPLAY_MS = 3000;
const CAMERA_WARMUP_MS = 1500;
const CAPTURE_POLL_MS = 120;
const CAPTURE_MAX_ATTEMPTS = 45;
const MAX_FACE_ATTEMPTS = 3;
const RETRY_IDLE_MS = 2000;
const FACE_FAIL_THRESHOLD = 3;

interface SelfCheckInScannerProps {
  venueId: string;
}

export function SelfCheckInScanner({ venueId }: SelfCheckInScannerProps) {
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<ScanState>("idle");

  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<CheckInResult>({});
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [scanPhase, setScanPhase] = useState<
    "adjust" | "capturing" | "between_retries"
  >("adjust");
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneConfirmLoading, setPhoneConfirmLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<PhonePreview | null>(null);
  const [phoneError, setPhoneError] = useState("");

  const [cachedCheckIn, setCachedCheckIn] = useState<CheckInResult | null>(
    null
  );

  /* Reset UI to idle but preserve consecutive failure count. */
  const resetToIdle = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    cameraRef.current?.stopCamera();
    stateRef.current = "idle";
    setState("idle");
    setResult({});
    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setCameraError(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
  }, []);

  /* Full reset including failure counter — used after successful check-in. */
  const fullReset = useCallback(() => {
    resetToIdle();
    setConsecutiveFailures(0);
  }, [resetToIdle]);

  const scheduleReset = useCallback(
    (ms: number) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, ms);
    },
    [resetToIdle]
  );

  const handleCheckInResult = useCallback(
    (data: CheckInResult & { resultType: string }) => {
      cameraRef.current?.stopCamera();
      setResult(data);

      if (data.resultType === "checked_in" || data.resultType === "matched") {
        stateRef.current = "confirmed";
        setState("confirmed");
        setConsecutiveFailures(0);
        try {
          localStorage.setItem(
            `kiosk-last-checkin-${venueId}`,
            JSON.stringify({ ...data, cachedAt: Date.now() })
          );
        } catch {
          /* storage full — skip */
        }
        scheduleReset(CONFIRMED_DISPLAY_MS);
        return;
      }
      if (data.resultType === "already_checked_in") {
        stateRef.current = "confirmed";
        setState("confirmed");
        setConsecutiveFailures(0);
        scheduleReset(ALREADY_DISPLAY_MS);
        return;
      }
      if (data.resultType === "needs_registration") {
        stateRef.current = "needs_registration";
        setState("needs_registration");
        setConsecutiveFailures((c) => c + 1);
        return;
      }
      if (data.resultType === "no_face" || data.resultType === "multi_face") {
        stateRef.current = "no_face";
        setState("no_face");
        setConsecutiveFailures((c) => c + 1);
        scheduleReset(ERROR_DISPLAY_MS);
        return;
      }
      stateRef.current = "error";
      setState("error");
      setConsecutiveFailures((c) => c + 1);
      scheduleReset(ERROR_DISPLAY_MS);
    },
    [scheduleReset, venueId]
  );

  const beginFaceScan = useCallback(() => {
    if (stateRef.current === "scanning") return;
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setCameraError(null);
    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
    stateRef.current = "scanning";
    setState("scanning");
  }, []);

  /* ---- Face scan loop ---- */
  useEffect(() => {
    if (state !== "scanning") return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      for (
        let attempt = 1;
        attempt <= MAX_FACE_ATTEMPTS && !cancelled;
        attempt++
      ) {
        setScanPhase("adjust");
        await sleep(CAMERA_WARMUP_MS);
        if (cancelled) return;
        setScanPhase("capturing");

        let frame: string | null = null;
        for (let i = 0; i < CAPTURE_MAX_ATTEMPTS && !cancelled; i++) {
          frame = cameraRef.current?.captureFrame() ?? null;
          if (frame) break;
          await sleep(CAPTURE_POLL_MS);
        }
        if (cancelled) return;

        if (!frame) {
          cameraRef.current?.stopCamera();
          stateRef.current = "error";
          setState("error");
          setResult({ error: "Camera not ready — tap to try again" });
          scheduleReset(4000);
          return;
        }

        try {
          const res = await api.post<{
            success: boolean;
            resultType: string;
            displayName?: string;
            queueNumber?: number;
            queuePosition?: number;
            skillLevel?: string;
            totalSessions?: number;
            isReturning?: boolean;
            alreadyCheckedIn?: boolean;
            error?: string;
          }>("/api/kiosk/process-face", { venueId, imageBase64: frame });

          if (cancelled) return;

          const isRetryable =
            res.resultType === "no_face" || res.resultType === "multi_face";
          if (isRetryable && attempt < MAX_FACE_ATTEMPTS) {
            setScanPhase("between_retries");
            const steps = Math.ceil(RETRY_IDLE_MS / 1000);
            for (let s = steps; s >= 1 && !cancelled; s--) {
              setRetrySecondsLeft(s);
              await sleep(1000);
            }
            setRetrySecondsLeft(null);
            if (cancelled) return;
            continue;
          }

          handleCheckInResult({
            ...res,
            resultType: res.success ? res.resultType : "error",
          });
          return;
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : "Unknown error";
          const isNetwork =
            !navigator.onLine ||
            msg.toLowerCase().includes("fetch") ||
            msg.toLowerCase().includes("network");

          if (isNetwork) {
            cameraRef.current?.stopCamera();
            try {
              const cached = localStorage.getItem(
                `kiosk-last-checkin-${venueId}`
              );
              if (cached) setCachedCheckIn(JSON.parse(cached));
            } catch {
              /* ignore */
            }
            stateRef.current = "network_error";
            setState("network_error");
            scheduleReset(8000);
            return;
          }

          handleCheckInResult({ resultType: "error", error: msg });
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state, venueId, handleCheckInResult, scheduleReset]);

  /* ---- Phone fallback handlers ---- */
  const openPhoneFlow = useCallback(() => {
    cameraRef.current?.stopCamera();
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    stateRef.current = "phone_enter";
    setState("phone_enter");
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
  }, []);

  const handlePhoneLookup = useCallback(async () => {
    const raw = phoneInput.trim();
    if (!raw) {
      setPhoneError("Enter a phone number");
      return;
    }
    setPhoneLoading(true);
    setPhoneError("");
    try {
      const res = await api.post<PhonePreview>("/api/kiosk/phone-check-in", {
        venueId,
        phase: "lookup",
        phone: raw,
      });
      setPhonePreview(res);
      stateRef.current = "phone_preview";
      setState("phone_preview");
    } catch (e) {
      setPhoneError(
        e instanceof Error ? e.message : "Could not look up this number"
      );
    } finally {
      setPhoneLoading(false);
    }
  }, [phoneInput, venueId]);

  const handlePhoneConfirm = useCallback(async () => {
    const pid = phonePreview?.player?.id;
    if (!pid) return;
    setPhoneConfirmLoading(true);
    setPhoneError("");
    try {
      const res = await api.post<{
        success: boolean;
        resultType: string;
        displayName?: string;
        queueNumber?: number;
        skillLevel?: string;
        totalSessions?: number;
        isReturning?: boolean;
        alreadyCheckedIn?: boolean;
        error?: string;
      }>("/api/kiosk/phone-check-in", {
        venueId,
        phase: "confirm",
        playerId: pid,
      });

      if (res.success) {
        setResult({
          displayName: res.displayName,
          queueNumber: res.queueNumber,
          skillLevel: res.skillLevel,
          totalSessions: res.totalSessions,
          isReturning: res.isReturning,
          alreadyCheckedIn: res.alreadyCheckedIn ?? false,
        });
        stateRef.current = "confirmed";
        setState("confirmed");
        setConsecutiveFailures(0);
        scheduleReset(
          res.alreadyCheckedIn ? ALREADY_DISPLAY_MS : CONFIRMED_DISPLAY_MS
        );
      } else {
        setPhoneError(res.error || "Could not complete check-in");
      }
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPhoneConfirmLoading(false);
    }
  }, [phonePreview, venueId, scheduleReset]);

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

  useEffect(() => {
    return () => {
      cameraRef.current?.stopCamera();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const showPhoneFallback = consecutiveFailures >= FACE_FAIL_THRESHOLD;

  const bgColor =
    ({
      idle: "bg-black",
      scanning: "bg-black",
      confirmed: "bg-black",
      error: "bg-red-950",
      no_face: "bg-amber-950",
      needs_registration: "bg-neutral-900",
      network_error: "bg-red-950",
      phone_enter: "bg-black",
      phone_preview: "bg-black",
    } as Record<string, string>)[state] ?? "bg-black";

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col transition-colors duration-300",
        bgColor
      )}
    >
      {/* ---- IDLE ---- */}
      {state === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
          <div className="h-32 w-32 rounded-full border-4 border-green-500/40" />
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">Welcome!</h1>
            <p className="text-xl text-neutral-400">Tap below to check in</p>
          </div>
          <button
            type="button"
            onClick={beginFaceScan}
            className="w-full max-w-lg rounded-3xl bg-green-600 px-8 py-7 text-2xl font-bold text-white shadow-lg shadow-green-900/40 transition-colors hover:bg-green-500 active:scale-[0.99] min-h-[3.75rem] sm:min-h-[4.5rem] sm:px-12 sm:py-8 sm:text-3xl"
          >
            Check In
          </button>
          {showPhoneFallback && (
            <button
              type="button"
              onClick={openPhoneFlow}
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
            >
              <Smartphone className="h-5 w-5" />
              Check in with phone number
            </button>
          )}
          <p className="max-w-md text-sm text-neutral-600">
            The camera will scan your face to check you in.
          </p>
        </div>
      )}

      {/* ---- SCANNING ---- */}
      {state === "scanning" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-center text-lg text-neutral-300">
            {scanPhase === "between_retries"
              ? "No match yet \u2014 adjust if needed"
              : scanPhase === "adjust"
                ? "Position your face \u2014 scanning starts in a moment"
                : "Hold still \u2014 scanning now"}
          </p>
          <div className="relative aspect-[8/9] w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-green-600/40 bg-black shadow-lg shadow-green-900/20">
            <CameraCapture
              ref={cameraRef}
              active
              onError={onCameraError}
              className="h-full w-full"
              videoClassName="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {scanPhase === "between_retries" && retrySecondsLeft != null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-4 text-center">
                <p className="text-2xl font-semibold text-white">
                  Next scan in
                </p>
                <p className="mt-2 text-5xl font-bold tabular-nums text-green-400">
                  {retrySecondsLeft}
                </p>
              </div>
            )}
          </div>
          {cameraError ? (
            <p className="text-center text-sm text-red-400">{cameraError}</p>
          ) : scanPhase === "capturing" ? (
            <div className="flex items-center gap-3 text-neutral-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-green-500" />
              <span>Scanning&hellip;</span>
            </div>
          ) : scanPhase === "between_retries" ? (
            <p className="text-sm text-amber-200/90">
              We&apos;ll try again automatically
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Camera ready</p>
          )}
        </div>
      )}

      {/* ---- CONFIRMED ---- */}
      {state === "confirmed" && (
        <div className="flex min-h-0 w-full flex-1 p-2 sm:p-4">
          <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1">
            <KioskConfirmationScreen
              displayName={result.displayName ?? "Player"}
              queueNumber={result.queueNumber}
              queuePosition={result.queuePosition}
              skillLevel={result.skillLevel}
              totalSessions={result.totalSessions}
              isReturning={result.isReturning}
              alreadyCheckedIn={result.alreadyCheckedIn}
              onScanNext={fullReset}
            />
          </div>
        </div>
      )}

      {/* ---- NO FACE / ERROR ---- */}
      {(state === "no_face" || state === "error") && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">
            {state === "no_face"
              ? "No face detected"
              : "Something went wrong"}
          </h2>
          <p className="text-lg text-neutral-400">
            {state === "no_face"
              ? "Look at the camera and try again"
              : result.error || "Please try again"}
          </p>
        </div>
      )}

      {/* ---- NEEDS REGISTRATION ---- */}
      {state === "needs_registration" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <h2 className="text-2xl font-bold text-neutral-200">
            Face not recognised
          </h2>
          <p className="text-lg text-neutral-400">
            Try checking in with your phone number, or scan again
          </p>
          <button
            type="button"
            onClick={beginFaceScan}
            className="w-full max-w-lg rounded-3xl bg-green-600 px-8 py-7 text-2xl font-bold text-white transition-colors hover:bg-green-500 active:scale-[0.99] min-h-[3.75rem] sm:min-h-[4.5rem] sm:px-12 sm:py-8 sm:text-3xl"
          >
            Scan Again
          </button>
          <button
            type="button"
            onClick={openPhoneFlow}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-500"
          >
            <Smartphone className="h-5 w-5" />
            Check in with phone
          </button>
        </div>
      )}

      {/* ---- NETWORK ERROR ---- */}
      {state === "network_error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">{"\u26A0"}</span>
          </div>
          {cachedCheckIn?.queueNumber ? (
            <>
              <p className="text-xl text-amber-300">
                Network issue &mdash; showing last check-in
              </p>
              <p className="text-6xl font-bold text-green-400">
                #{cachedCheckIn.queueNumber}
              </p>
              {cachedCheckIn.displayName && (
                <p className="text-xl text-white">
                  {cachedCheckIn.displayName}
                </p>
              )}
              <p className="text-sm text-neutral-500">
                Offline &mdash; will sync when network returns
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-red-300">Network issue</h2>
              <p className="text-lg text-neutral-400">
                See staff for check-in
              </p>
            </>
          )}
        </div>
      )}

      {/* ---- PHONE ENTER ---- */}
      {state === "phone_enter" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetToIdle}
                className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-white">
                Check in by phone
              </h3>
            </div>
            <p className="text-sm text-neutral-400">Enter your phone number</p>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-lg text-white placeholder:text-neutral-600"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handlePhoneLookup();
              }}
            />
            {phoneError && (
              <p className="text-sm text-red-400">{phoneError}</p>
            )}
            <button
              type="button"
              disabled={phoneLoading}
              onClick={() => void handlePhoneLookup()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {phoneLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              Look up
            </button>
          </div>
        </div>
      )}

      {/* ---- PHONE PREVIEW ---- */}
      {state === "phone_preview" && phonePreview?.player && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stateRef.current = "phone_enter";
                  setState("phone_enter");
                  setPhoneError("");
                }}
                className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-white">
                {phonePreview.player.name}
              </h3>
            </div>
            <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <p>
                <span className="text-neutral-500">Phone: </span>
                <span className="font-medium text-white">
                  {phonePreview.player.phone}
                </span>
              </p>
              <p>
                <span className="text-neutral-500">Level: </span>
                {phonePreview.player.skillLevel}
              </p>
            </div>
            {phonePreview.alreadyCheckedIn && (
              <p className="text-center text-sm text-amber-400">
                Already checked in
                {phonePreview.queueNumber != null &&
                  phonePreview.queueNumber > 0 && (
                    <span className="mt-1 block font-mono text-lg text-white">
                      #{phonePreview.queueNumber}
                    </span>
                  )}
              </p>
            )}
            {phoneError && (
              <p className="text-sm text-red-400">{phoneError}</p>
            )}
            <button
              type="button"
              disabled={phoneConfirmLoading}
              onClick={() => void handlePhoneConfirm()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {phoneConfirmLoading && (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              Confirm check-in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
