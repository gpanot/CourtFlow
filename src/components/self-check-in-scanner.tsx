"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";
import { KioskConfirmationScreen } from "@/components/kiosk-confirmation-screen";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, Smartphone, UserPlus, ScanFace, Hash } from "lucide-react";
import { tvI18n } from "@/i18n/tv-i18n";
import { TvTabletLanguageToggle } from "@/components/tv-tablet-language-toggle";
import { useSuccessChime } from "@/hooks/use-success-chime";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";

/* ─── State machine ───────────────────────────────────────── */
type KioskStep =
  | "home"
  | "scanning"
  | "needs_registration"
  | "no_face"
  | "error"
  | "network_error"
  | "phone_enter"
  | "phone_preview"
  | "wristband_enter"
  | "reg_face_capture"
  | "reg_face_preview"
  | "reg_form"
  | "payment_waiting"
  | "payment_cash"
  | "payment_timeout"
  | "payment_cancelled"
  | "confirmed"
  | "already_checked_in";

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

interface PaymentData {
  pendingPaymentId: string;
  amount: number;
  vietQR: string | null;
  playerName: string;
  isNew: boolean;
}

/* ─── Constants ───────────────────────────────────────────── */
const CONFIRMED_DISPLAY_MS = 8000;
const ALREADY_DISPLAY_MS = 8000;
const ERROR_DISPLAY_MS = 3000;
const CAMERA_WARMUP_MS = 1500;
const CAPTURE_POLL_MS = 120;
const CAPTURE_MAX_ATTEMPTS = 45;
const MAX_FACE_ATTEMPTS = 3;
const RETRY_IDLE_MS = 2000;
const FACE_FAIL_THRESHOLD = 3;
const INACTIVITY_RESET_MS = 45_000;
const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000;
const PAYMENT_CANCELLED_RESET_MS = 10_000;
const PAYMENT_TIMEOUT_RESET_MS = 15_000;
const ERROR_RESET_MS = 15_000;

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN");
}

/* ─── Component ───────────────────────────────────────────── */
interface SelfCheckInScannerProps {
  venueId: string;
}

export function SelfCheckInScanner({ venueId }: SelfCheckInScannerProps) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const { unlockChime, playSuccessChime } = useSuccessChime();
  const { on } = useSocket();
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const paymentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef<KioskStep>("home");

  const [step, setStep] = useState<KioskStep>("home");
  const [result, setResult] = useState<CheckInResult>({});
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [scanPhase, setScanPhase] = useState<"adjust" | "capturing" | "between_retries">("adjust");
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneConfirmLoading, setPhoneConfirmLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<PhonePreview | null>(null);
  const [phoneError, setPhoneError] = useState("");

  const [wristbandInput, setWristbandInput] = useState("");
  const [wristbandLoading, setWristbandLoading] = useState(false);
  const [wristbandError, setWristbandError] = useState("");

  const [regImage, setRegImage] = useState<string | null>(null);
  const [regName, setRegName] = useState("");
  const [regGender, setRegGender] = useState<"male" | "female" | null>(null);
  const [regLevel, setRegLevel] = useState<"beginner" | "intermediate" | "advanced" | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [cachedCheckIn, setCachedCheckIn] = useState<CheckInResult | null>(null);
  const [venueName, setVenueName] = useState("");

  /* ─── Helpers ──────────────────────────────────── */
  const goTo = useCallback((s: KioskStep) => {
    stepRef.current = s;
    setStep(s);
  }, []);

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    resetTimerRef.current = null;
    inactivityTimerRef.current = null;
    paymentTimerRef.current = null;
  }, []);

  const resetToHome = useCallback(() => {
    clearTimers();
    cameraRef.current?.stopCamera();
    goTo("home");
    setResult({});
    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setCameraError(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
    setWristbandInput("");
    setWristbandError("");
    setRegImage(null);
    setRegName("");
    setRegGender(null);
    setRegLevel(null);
    setPayment(null);
    setPaymentLoading(false);
  }, [clearTimers, goTo]);

  const fullReset = useCallback(() => {
    resetToHome();
    setConsecutiveFailures(0);
  }, [resetToHome]);

  const scheduleReset = useCallback(
    (ms: number) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToHome, ms);
    },
    [resetToHome]
  );

  useEffect(() => {
    api.get<{ name: string }>(`/api/venues/${venueId}`).then((v) => setVenueName(v.name)).catch(() => {});
  }, [venueId]);

  useEffect(() => {
    joinVenue(venueId);
  }, [venueId]);

  /* ─── Socket: listen for payment confirmation/cancellation ──── */
  useEffect(() => {
    const offConfirmed = on("payment:confirmed", (data: unknown) => {
      const d = data as { pendingPaymentId: string; playerName: string; queueNumber: number };
      if (
        stepRef.current === "payment_waiting" ||
        stepRef.current === "payment_cash"
      ) {
        if (payment?.pendingPaymentId === d.pendingPaymentId) {
          clearTimers();
          playSuccessChime();
          setResult({
            displayName: d.playerName,
            queueNumber: d.queueNumber,
            isReturning: !payment.isNew,
            alreadyCheckedIn: false,
          });
          goTo("confirmed");
          resetTimerRef.current = setTimeout(fullReset, CONFIRMED_DISPLAY_MS);
        }
      }
    });

    const offCancelled = on("payment:cancelled", (data: unknown) => {
      const d = data as { pendingPaymentId: string };
      if (
        stepRef.current === "payment_waiting" ||
        stepRef.current === "payment_cash"
      ) {
        if (payment?.pendingPaymentId === d.pendingPaymentId) {
          clearTimers();
          goTo("payment_cancelled");
          resetTimerRef.current = setTimeout(resetToHome, PAYMENT_CANCELLED_RESET_MS);
        }
      }
    });

    return () => {
      offConfirmed();
      offCancelled();
    };
  }, [on, payment, clearTimers, goTo, playSuccessChime, fullReset, resetToHome]);

  /* ─── Inactivity reset on home ───────────────── */
  useEffect(() => {
    if (step !== "home") {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }
    // No inactivity timer on home — home is the default resting state
  }, [step]);

  /* ─── Unmount cleanup ───────────────────────── */
  useEffect(() => {
    return () => {
      cameraRef.current?.stopCamera();
      clearTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Face scan result handler (returning flow) ─── */
  const handleCheckinPayment = useCallback(
    async (imageBase64?: string, queueNumber?: number) => {
      try {
        const body: Record<string, unknown> = { venueId };
        if (imageBase64) body.imageBase64 = imageBase64;
        if (queueNumber != null) body.queueNumber = queueNumber;

        const res = await api.post<{
          pendingPaymentId?: string;
          playerId?: string;
          amount?: number;
          vietQR?: string;
          playerName?: string;
          isReturning?: boolean;
          resultType?: string;
          alreadyCheckedIn?: boolean;
          queueNumber?: number;
          skillLevel?: string;
          error?: string;
          resuming?: boolean;
        }>("/api/kiosk/checkin-payment", body);

        if (res.resultType === "needs_registration") {
          cameraRef.current?.stopCamera();
          goTo("needs_registration");
          setConsecutiveFailures((c) => c + 1);
          return;
        }
        if (res.resultType === "already_checked_in") {
          cameraRef.current?.stopCamera();
          playSuccessChime();
          setResult({
            displayName: res.playerName,
            queueNumber: res.queueNumber,
            skillLevel: res.skillLevel,
            isReturning: true,
            alreadyCheckedIn: true,
          });
          goTo("already_checked_in");
          scheduleReset(ALREADY_DISPLAY_MS);
          return;
        }
        // no_face / multi_face: stay on "scanning" so the loop can retry
        if (res.resultType === "no_face" || res.resultType === "multi_face") {
          return;
        }
        if (res.resultType === "error") {
          cameraRef.current?.stopCamera();
          goTo("error");
          setResult({ error: res.error });
          scheduleReset(ERROR_DISPLAY_MS);
          return;
        }

        if (res.pendingPaymentId) {
          setPayment({
            pendingPaymentId: res.pendingPaymentId,
            amount: res.amount || 0,
            vietQR: res.vietQR || null,
            playerName: res.playerName || "",
            isNew: false,
          });
          goTo("payment_waiting");
          paymentTimerRef.current = setTimeout(() => {
            if (stepRef.current === "payment_waiting" || stepRef.current === "payment_cash") {
              goTo("payment_timeout");
              resetTimerRef.current = setTimeout(resetToHome, PAYMENT_TIMEOUT_RESET_MS);
            }
          }, PAYMENT_TIMEOUT_MS);
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        const isNetwork =
          !navigator.onLine ||
          msg.toLowerCase().includes("fetch") ||
          msg.toLowerCase().includes("network");
        if (isNetwork) {
          try {
            const cached = localStorage.getItem(`kiosk-last-checkin-${venueId}`);
            if (cached) setCachedCheckIn(JSON.parse(cached));
          } catch { /* ignore */ }
          goTo("network_error");
          scheduleReset(ERROR_RESET_MS);
          return;
        }
        goTo("error");
        setResult({ error: msg });
        scheduleReset(ERROR_DISPLAY_MS);
      }
    },
    [venueId, goTo, scheduleReset, playSuccessChime, resetToHome]
  );

  /* ─── Begin face scan (returning path) ──────── */
  const beginFaceScan = useCallback(() => {
    if (stepRef.current === "scanning") return;
    clearTimers();
    setCameraError(null);
    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
    setWristbandInput("");
    setWristbandError("");
    unlockChime();
    goTo("scanning");
  }, [unlockChime, clearTimers, goTo]);

  /* ─── Face scan loop (calls checkin-payment directly) ────── */
  useEffect(() => {
    if (step !== "scanning") return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      for (let attempt = 1; attempt <= MAX_FACE_ATTEMPTS && !cancelled; attempt++) {
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
          goTo("error");
          setResult({ error: "Camera not ready — tap to try again" });
          scheduleReset(4000);
          return;
        }

        // handleCheckinPayment navigates to the right step based on the API response.
        // It handles needs_registration, already_checked_in, payment_waiting, error, etc.
        await handleCheckinPayment(frame);
        if (cancelled) return;

        // If we're still on "scanning" after handleCheckinPayment, it means
        // the face was not detected (no_face/multi_face). Retry if attempts remain.
        if (stepRef.current !== "scanning") {
          cameraRef.current?.stopCamera();
          return;
        }

        if (attempt < MAX_FACE_ATTEMPTS) {
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
      }

      if (!cancelled && stepRef.current === "scanning") {
        cameraRef.current?.stopCamera();
        goTo("no_face");
        setConsecutiveFailures((c) => c + 1);
        scheduleReset(ERROR_DISPLAY_MS);
      }
    })();

    return () => { cancelled = true; };
  }, [step, venueId, goTo, scheduleReset, handleCheckinPayment]);

  /* ─── Phone fallback ────────────────────────── */
  const openPhoneFlow = useCallback(() => {
    cameraRef.current?.stopCamera();
    clearTimers();
    goTo("phone_enter");
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
  }, [clearTimers, goTo]);

  const handlePhoneLookup = useCallback(async () => {
    const raw = phoneInput.trim();
    if (!raw) { setPhoneError(t("tablet.checkInScanner.enterPhone")); return; }
    unlockChime();
    setPhoneLoading(true);
    setPhoneError("");
    try {
      const res = await api.post<PhonePreview>("/api/kiosk/phone-check-in", { venueId, phase: "lookup", phone: raw });
      setPhonePreview(res);
      goTo("phone_preview");
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Could not look up this number");
    } finally {
      setPhoneLoading(false);
    }
  }, [phoneInput, t, unlockChime, venueId, goTo]);

  const handlePhoneConfirm = useCallback(async () => {
    const pid = phonePreview?.player?.id;
    if (!pid) return;
    unlockChime();
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
      }>("/api/kiosk/phone-check-in", { venueId, phase: "confirm", playerId: pid });
      if (res.success) {
        await handleCheckinPayment(undefined, undefined);
      } else {
        setPhoneError(res.error || "Could not complete check-in");
      }
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPhoneConfirmLoading(false);
    }
  }, [phonePreview, venueId, unlockChime, handleCheckinPayment]);

  /* ─── Wristband fallback ────────────────────── */
  const openWristbandFlow = useCallback(() => {
    cameraRef.current?.stopCamera();
    clearTimers();
    goTo("wristband_enter");
    setWristbandInput("");
    setWristbandError("");
  }, [clearTimers, goTo]);

  const handleWristbandLookup = useCallback(async () => {
    const num = parseInt(wristbandInput.trim(), 10);
    if (isNaN(num) || num <= 0) {
      setWristbandError("Enter a valid number");
      return;
    }
    unlockChime();
    setWristbandLoading(true);
    setWristbandError("");
    try {
      await handleCheckinPayment(undefined, num);
    } catch (e) {
      setWristbandError(e instanceof Error ? e.message : "Could not find player");
    } finally {
      setWristbandLoading(false);
    }
  }, [wristbandInput, unlockChime, handleCheckinPayment]);

  /* ─── Registration: face capture ────────────── */
  const beginRegFaceCapture = useCallback(() => {
    clearTimers();
    setCameraError(null);
    unlockChime();
    goTo("reg_face_capture");
  }, [clearTimers, unlockChime, goTo]);

  const captureRegFace = useCallback(() => {
    const frame = cameraRef.current?.captureFrame();
    if (frame) {
      setRegImage(frame);
      cameraRef.current?.stopCamera();
      goTo("reg_face_preview");
    }
  }, [goTo]);

  /* ─── Registration: submit form ─────────────── */
  const handleRegSubmit = useCallback(async () => {
    if (!regName.trim() || !regGender || !regLevel || !regImage) return;
    setRegLoading(true);
    try {
      const res = await api.post<{
        pendingPaymentId: string;
        playerId: string;
        amount: number;
        vietQR: string | null;
        playerName: string;
      }>("/api/kiosk/register", {
        venueId,
        imageBase64: regImage,
        name: regName.trim(),
        gender: regGender,
        skillLevel: regLevel,
      });

      setPayment({
        pendingPaymentId: res.pendingPaymentId,
        amount: res.amount,
        vietQR: res.vietQR,
        playerName: res.playerName,
        isNew: true,
      });
      goTo("payment_waiting");
      paymentTimerRef.current = setTimeout(() => {
        if (stepRef.current === "payment_waiting" || stepRef.current === "payment_cash") {
          goTo("payment_timeout");
          resetTimerRef.current = setTimeout(resetToHome, PAYMENT_TIMEOUT_RESET_MS);
        }
      }, PAYMENT_TIMEOUT_MS);
    } catch (e) {
      goTo("error");
      setResult({ error: e instanceof Error ? e.message : "Registration failed" });
      scheduleReset(ERROR_DISPLAY_MS);
    } finally {
      setRegLoading(false);
    }
  }, [regName, regGender, regLevel, regImage, venueId, goTo, scheduleReset, resetToHome]);

  /* ─── Payment: switch to cash ───────────────── */
  const switchToCash = useCallback(async () => {
    if (!payment) return;
    setPaymentLoading(true);
    try {
      await api.post("/api/kiosk/cash-payment", { pendingPaymentId: payment.pendingPaymentId });
      goTo("payment_cash");
    } catch {
      // Stay on QR screen if cash switch fails
    } finally {
      setPaymentLoading(false);
    }
  }, [payment, goTo]);

  const onCameraError = useCallback(
    (msg: string) => {
      setCameraError(msg);
      if (stepRef.current === "scanning" || stepRef.current === "reg_face_capture") {
        cameraRef.current?.stopCamera();
        goTo("error");
        setResult({ error: msg });
        scheduleReset(4000);
      }
    },
    [scheduleReset, goTo]
  );

  const showPhoneFallback = consecutiveFailures >= FACE_FAIL_THRESHOLD;

  const bgColor =
    ({
      home: "bg-black",
      scanning: "bg-black",
      confirmed: "bg-black",
      already_checked_in: "bg-black",
      error: "bg-red-950",
      no_face: "bg-amber-950",
      needs_registration: "bg-neutral-900",
      network_error: "bg-red-950",
      phone_enter: "bg-black",
      phone_preview: "bg-black",
      wristband_enter: "bg-black",
      reg_face_capture: "bg-black",
      reg_face_preview: "bg-black",
      reg_form: "bg-black",
      payment_waiting: "bg-black",
      payment_cash: "bg-black",
      payment_timeout: "bg-red-950",
      payment_cancelled: "bg-red-950",
    } as Record<string, string>)[step] ?? "bg-black";

  return (
    <div className={cn("relative flex h-full w-full flex-col transition-colors duration-300", bgColor)}>

      {/* ── HOME ─────────────────────────────────── */}
      {step === "home" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
          <div className="absolute right-6 top-6 z-20">
            <TvTabletLanguageToggle />
          </div>
          {venueName && (
            <p className="text-lg font-medium text-neutral-400">{venueName}</p>
          )}
          <div className="w-full max-w-lg space-y-4">
            <button
              type="button"
              onClick={beginFaceScan}
              className="flex w-full items-center gap-5 rounded-3xl border-2 border-green-600/50 bg-green-900/30 px-8 py-7 text-left transition-colors hover:bg-green-900/50 active:scale-[0.99]"
            >
              <ScanFace className="h-10 w-10 shrink-0 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{t("tablet.checkInScanner.homeCheckIn")}</p>
                <p className="text-base text-neutral-400">{t("tablet.checkInScanner.homeCheckInSub")}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={beginRegFaceCapture}
              className="flex w-full items-center gap-5 rounded-3xl border-2 border-neutral-600/50 bg-neutral-800/30 px-8 py-7 text-left transition-colors hover:bg-neutral-800/60 active:scale-[0.99]"
            >
              <UserPlus className="h-10 w-10 shrink-0 text-neutral-400" />
              <div>
                <p className="text-2xl font-bold text-white">{t("tablet.checkInScanner.homeFirstTime")}</p>
                <p className="text-base text-neutral-400">{t("tablet.checkInScanner.homeFirstTimeSub")}</p>
              </div>
            </button>
          </div>
          {showPhoneFallback && (
            <button type="button" onClick={openPhoneFlow} className="flex items-center gap-2 text-blue-400 hover:text-blue-300">
              <Smartphone className="h-5 w-5" />
              {t("tablet.checkInScanner.checkInWithPhone")}
            </button>
          )}
        </div>
      )}

      {/* ── SCANNING (face scan for returning) ──── */}
      {step === "scanning" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-center text-lg text-neutral-300">
            {scanPhase === "between_retries"
              ? t("tablet.checkInScanner.noMatchYet")
              : scanPhase === "adjust"
                ? t("tablet.checkInScanner.positionFace")
                : t("tablet.checkInScanner.holdStill")}
          </p>
          <div className="relative aspect-[8/9] w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-green-600/40 bg-black shadow-lg shadow-green-900/20">
            <CameraCapture ref={cameraRef} active onError={onCameraError} className="h-full w-full" videoClassName="h-full w-full object-cover [transform:scaleX(-1)]" />
            {scanPhase === "between_retries" && retrySecondsLeft != null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-4 text-center">
                <p className="text-2xl font-semibold text-white">{t("tablet.checkInScanner.nextScanIn")}</p>
                <p className="mt-2 text-5xl font-bold tabular-nums text-green-400">{retrySecondsLeft}</p>
              </div>
            )}
          </div>
          {cameraError ? (
            <p className="text-center text-sm text-red-400">{cameraError}</p>
          ) : scanPhase === "capturing" ? (
            <div className="flex items-center gap-3 text-neutral-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-green-500" />
              <span>{t("tablet.checkInScanner.scanning")}</span>
            </div>
          ) : scanPhase === "between_retries" ? (
            <p className="text-sm text-amber-200/90">{t("tablet.checkInScanner.retryAuto")}</p>
          ) : (
            <p className="text-sm text-neutral-500">{t("tablet.checkInScanner.cameraReady")}</p>
          )}
        </div>
      )}

      {/* ── CONFIRMED / ALREADY_CHECKED_IN ──────── */}
      {(step === "confirmed" || step === "already_checked_in") && (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 p-4">
          {step === "confirmed" && payment?.isNew ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-600">
                <span className="text-4xl">✓</span>
              </div>
              <h1 className="text-3xl font-bold text-green-400">
                {t("tablet.checkInScanner.successWelcomeNew", { venue: venueName, name: result.displayName })}
              </h1>
              {result.queueNumber && (
                <p className="text-7xl font-bold tabular-nums text-white">{result.queueNumber}</p>
              )}
              <p className="text-lg text-neutral-300">{t("tablet.checkInScanner.successFaceRegistered")}</p>
              <p className="text-base text-neutral-500">{t("tablet.checkInScanner.successHeadToTv")}</p>
            </div>
          ) : (
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
                translationI18n={tvI18n}
              />
            </div>
          )}
        </div>
      )}

      {/* ── NO FACE / ERROR ─────────────────────── */}
      {(step === "no_face" || step === "error") && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">
            {step === "no_face" ? t("tablet.checkInScanner.noFaceDetected") : t("tablet.checkInScanner.somethingWrong")}
          </h2>
          <p className="text-lg text-neutral-400">
            {step === "no_face" ? t("tablet.checkInScanner.lookAtCamera") : result.error || t("tablet.checkInScanner.tryAgain")}
          </p>
        </div>
      )}

      {/* ── NEEDS REGISTRATION ──────────────────── */}
      {step === "needs_registration" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <div className="absolute right-6 top-6 z-20"><TvTabletLanguageToggle /></div>
          <h2 className="text-2xl font-bold text-neutral-200">{t("tablet.checkInScanner.faceNotRecognized")}</h2>
          <p className="text-lg text-neutral-400">{t("tablet.checkInScanner.faceNotRecognizedHint")}</p>
          <button type="button" onClick={beginFaceScan} className="w-full max-w-lg rounded-3xl bg-green-600 px-8 py-7 text-2xl font-bold text-white transition-colors hover:bg-green-500 active:scale-[0.99]">
            {t("tablet.checkInScanner.scanAgain")}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={openPhoneFlow} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-500">
              <Smartphone className="h-5 w-5" />
              {t("tablet.checkInScanner.checkInWithPhone")}
            </button>
            <button type="button" onClick={openWristbandFlow} className="flex items-center gap-2 rounded-xl bg-neutral-700 px-6 py-3 text-lg font-semibold text-white hover:bg-neutral-600">
              <Hash className="h-5 w-5" />
              {t("tablet.checkInScanner.enterWristband")}
            </button>
          </div>
        </div>
      )}

      {/* ── NETWORK ERROR ───────────────────────── */}
      {step === "network_error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">{"\u26A0"}</span>
          </div>
          {cachedCheckIn?.queueNumber ? (
            <>
              <p className="text-xl text-amber-300">{t("tablet.checkInScanner.networkShowingLast")}</p>
              <p className="text-6xl font-bold text-green-400">#{cachedCheckIn.queueNumber}</p>
              {cachedCheckIn.displayName && <p className="text-xl text-white">{cachedCheckIn.displayName}</p>}
              <p className="text-sm text-neutral-500">{t("tablet.checkInScanner.offlineSync")}</p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-red-300">{t("tablet.checkInScanner.networkIssue")}</h2>
              <p className="text-lg text-neutral-400">{t("tablet.checkInScanner.seeStaff")}</p>
            </>
          )}
        </div>
      )}

      {/* ── PHONE ENTER ─────────────────────────── */}
      {step === "phone_enter" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetToHome} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-white">{t("tablet.checkInScanner.checkInByPhone")}</h3>
            </div>
            <p className="text-sm text-neutral-400">{t("tablet.checkInScanner.enterPhonePrompt")}</p>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={t("tablet.checkInScanner.phonePlaceholder")}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-lg text-white placeholder:text-neutral-600"
              onKeyDown={(e) => { if (e.key === "Enter") void handlePhoneLookup(); }}
            />
            {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
            <button type="button" disabled={phoneLoading} onClick={() => void handlePhoneLookup()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-50">
              {phoneLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {t("tablet.checkInScanner.lookUp")}
            </button>
          </div>
        </div>
      )}

      {/* ── PHONE PREVIEW ───────────────────────── */}
      {step === "phone_preview" && phonePreview?.player && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { goTo("phone_enter"); setPhoneError(""); }} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-white">{phonePreview.player.name}</h3>
            </div>
            <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <p><span className="text-neutral-500">{t("tablet.checkInScanner.phoneLabel")} </span><span className="font-medium text-white">{phonePreview.player.phone}</span></p>
              <p><span className="text-neutral-500">{t("tablet.checkInScanner.levelLabel")} </span>{phonePreview.player.skillLevel}</p>
            </div>
            {phonePreview.alreadyCheckedIn && (
              <p className="text-center text-sm text-amber-400">
                {t("tablet.checkInScanner.alreadyCheckedIn")}
                {phonePreview.queueNumber != null && phonePreview.queueNumber > 0 && (
                  <span className="mt-1 block font-mono text-lg text-white">#{phonePreview.queueNumber}</span>
                )}
              </p>
            )}
            {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
            <button type="button" disabled={phoneConfirmLoading} onClick={() => void handlePhoneConfirm()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-500 disabled:opacity-50">
              {phoneConfirmLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {t("tablet.checkInScanner.confirmCheckIn")}
            </button>
          </div>
        </div>
      )}

      {/* ── WRISTBAND ENTER ─────────────────────── */}
      {step === "wristband_enter" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetToHome} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-white">{t("tablet.checkInScanner.enterWristband")}</h3>
            </div>
            <input type="number" inputMode="numeric" value={wristbandInput} onChange={(e) => setWristbandInput(e.target.value)}
              placeholder={t("tablet.checkInScanner.wristbandPlaceholder")}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-lg text-white placeholder:text-neutral-600"
              onKeyDown={(e) => { if (e.key === "Enter") void handleWristbandLookup(); }}
            />
            {wristbandError && <p className="text-sm text-red-400">{wristbandError}</p>}
            <button type="button" disabled={wristbandLoading} onClick={() => void handleWristbandLookup()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-500 disabled:opacity-50">
              {wristbandLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {t("tablet.checkInScanner.wristbandLookUp")}
            </button>
          </div>
        </div>
      )}

      {/* ── REGISTRATION: FACE CAPTURE ──────────── */}
      {step === "reg_face_capture" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{t("tablet.checkInScanner.regTitle")}</h2>
            <p className="mt-1 text-base text-neutral-400">{t("tablet.checkInScanner.regFaceHint")}</p>
          </div>
          <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-full border-4 border-green-600/40 bg-black">
            <CameraCapture ref={cameraRef} active onError={onCameraError} className="h-full w-full" videoClassName="h-full w-full object-cover [transform:scaleX(-1)]" />
          </div>
          <button type="button" onClick={captureRegFace}
            className="rounded-2xl bg-green-600 px-10 py-4 text-xl font-bold text-white hover:bg-green-500 active:scale-[0.98]">
            📸
          </button>
          <button type="button" onClick={resetToHome} className="text-sm text-neutral-500 hover:text-neutral-300">
            <ArrowLeft className="mr-1 inline h-4 w-4" />
            {t("tablet.checkInScanner.scanAgain")}
          </button>
        </div>
      )}

      {/* ── REGISTRATION: FACE PREVIEW ──────────── */}
      {step === "reg_face_preview" && regImage && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4">
          <h2 className="text-2xl font-bold text-green-400">{t("tablet.checkInScanner.regGotPhoto")}</h2>
          <div className="h-40 w-40 overflow-hidden rounded-full border-4 border-green-600/60">
            <img src={`data:image/jpeg;base64,${regImage}`} alt="" className="h-full w-full object-cover [transform:scaleX(-1)]" />
          </div>
          <div className="flex gap-4">
            <button type="button" onClick={() => goTo("reg_form")}
              className="rounded-2xl bg-green-600 px-8 py-4 text-xl font-bold text-white hover:bg-green-500">
              {t("tablet.checkInScanner.regLooksGood")} →
            </button>
            <button type="button" onClick={() => { setRegImage(null); goTo("reg_face_capture"); }}
              className="rounded-2xl bg-neutral-700 px-6 py-4 text-lg font-medium text-neutral-200 hover:bg-neutral-600">
              {t("tablet.checkInScanner.regRetake")}
            </button>
          </div>
        </div>
      )}

      {/* ── REGISTRATION: FORM ──────────────────── */}
      {step === "reg_form" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6">
          <div className="w-full max-w-md space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-400">{t("tablet.checkInScanner.regName")}</label>
              <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                placeholder={t("tablet.checkInScanner.regNamePlaceholder")}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-xl text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-400">{t("tablet.checkInScanner.regGender")}</label>
              <div className="flex gap-3">
                {(["male", "female"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setRegGender(g)}
                    className={cn("flex-1 rounded-xl py-3 text-lg font-semibold transition-colors",
                      regGender === g ? "bg-green-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    )}>
                    {t(`tablet.checkInScanner.reg${g === "male" ? "Male" : "Female"}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-400">{t("tablet.checkInScanner.regLevel")}</label>
              <div className="space-y-2">
                {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                  <button key={lvl} type="button" onClick={() => setRegLevel(lvl)}
                    className={cn("flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors",
                      regLevel === lvl ? "bg-green-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    )}>
                    <span className="font-semibold">{t(`tablet.checkInScanner.reg${lvl.charAt(0).toUpperCase() + lvl.slice(1)}`)}</span>
                    <span className="text-sm opacity-70">{t(`tablet.checkInScanner.reg${lvl.charAt(0).toUpperCase() + lvl.slice(1)}Desc`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" disabled={!regName.trim() || !regGender || !regLevel || regLoading}
              onClick={() => void handleRegSubmit()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-xl font-bold text-white transition-colors hover:bg-green-500 disabled:opacity-40">
              {regLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {t("tablet.checkInScanner.regNext")} →
            </button>
          </div>
        </div>
      )}

      {/* ── PAYMENT WAITING (VietQR) ────────────── */}
      {step === "payment_waiting" && payment && (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
          <button type="button" onClick={resetToHome} className="absolute left-4 top-4 rounded-full p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h2 className="text-2xl font-bold text-white">
            {payment.isNew
              ? t("tablet.checkInScanner.payTitle", { name: payment.playerName })
              : t("tablet.checkInScanner.payReturningTitle")}
          </h2>

          {payment.vietQR ? (
            <div className="rounded-2xl bg-white p-3">
              <img src={payment.vietQR} alt="VietQR" className="w-72 max-w-[70vw] object-contain" />
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-neutral-600 bg-neutral-900 p-8 text-center">
              <p className="text-lg text-neutral-400">QR unavailable — pay by cash below</p>
            </div>
          )}

          <p className="text-4xl font-bold text-green-400">{formatVND(payment.amount)} VND</p>

          <p className="max-w-sm text-center text-base text-neutral-400">
            {t("tablet.checkInScanner.payScanQR")}
          </p>

          <div className="flex items-center gap-3 text-neutral-500">
            <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
            <span>{t("tablet.checkInScanner.payWaitingForStaff")}</span>
          </div>

          <div className="flex items-center gap-4 text-neutral-500">
            <div className="h-px w-12 bg-neutral-700" />
            <span className="text-sm">{t("tablet.checkInScanner.payOr")}</span>
            <div className="h-px w-12 bg-neutral-700" />
          </div>

          <button type="button" disabled={paymentLoading} onClick={() => void switchToCash()}
            className="flex items-center gap-2 rounded-xl bg-amber-700/30 px-6 py-3 text-lg font-semibold text-amber-200 hover:bg-amber-700/50 disabled:opacity-50">
            {paymentLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {t("tablet.checkInScanner.payByCash")}
          </button>
        </div>
      )}

      {/* ── PAYMENT CASH ────────────────────────── */}
      {step === "payment_cash" && payment && (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <button type="button" onClick={resetToHome} className="absolute left-4 top-4 rounded-full p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-700/30">
            <span className="text-4xl">💵</span>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {t("tablet.checkInScanner.payCashTitle", { amount: `${formatVND(payment.amount)} VND` })}
          </h2>
          <div className="flex items-center gap-3 text-neutral-400">
            <div className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
            <span>{t("tablet.checkInScanner.payWaitingForStaff")}</span>
          </div>
        </div>
      )}

      {/* ── PAYMENT TIMEOUT ─────────────────────── */}
      {step === "payment_timeout" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">{t("tablet.checkInScanner.payTimeout")}</h2>
          <p className="text-lg text-neutral-400">{t("tablet.checkInScanner.payTimeoutHint")}</p>
          <button type="button" onClick={resetToHome}
            className="mt-4 rounded-2xl bg-green-600 px-8 py-4 text-xl font-bold text-white hover:bg-green-500">
            {t("tablet.checkInScanner.tryAgain")}
          </button>
        </div>
      )}

      {/* ── PAYMENT CANCELLED ───────────────────── */}
      {step === "payment_cancelled" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">✕</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">{t("tablet.checkInScanner.payCancelled")}</h2>
          <p className="text-lg text-neutral-400">{t("tablet.checkInScanner.payCancelledHint")}</p>
        </div>
      )}
    </div>
  );
}
