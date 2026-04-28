"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CameraCapture,
  type CameraCaptureHandle,
} from "@/components/camera-capture";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, Smartphone, UserPlus, ScanFace } from "lucide-react";
import { useSuccessChime } from "@/hooks/use-success-chime";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  blurBackgroundKeepFaceSharp,
  type RelativeFaceBoundingBox,
} from "@/lib/courtpay-face-blur";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { SubscriptionOffer } from "./SubscriptionOffer";
import { SuccessScreen } from "./SuccessScreen";
import {
  COURTPAY_LEVEL_QR_FRAME,
  parseCourtPaySkillLevel,
  type CourtPaySkillLevelUI,
} from "@/modules/courtpay/lib/skill-level-ui";

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
  | "reg_face_capture"
  | "reg_face_preview"
  | "reg_form"
  | "existing_user"
  | "subscription_offer"
  | "payment_waiting"
  | "payment_cash"
  | "payment_timeout"
  | "payment_cancelled"
  | "confirmed";

interface PlayerInfo {
  id: string;
  name: string;
  phone: string;
  skillLevel?: string | null;
}

interface SubscriptionInfo {
  id: string;
  packageName: string;
  sessionsRemaining: number | null;
  daysRemaining: number;
  isUnlimited: boolean;
}

interface PaymentInfo {
  pendingPaymentId: string;
  amount: number;
  vietQR: string | null;
  paymentRef: string;
  /** Session skill level — colored QR frame for staff. */
  skillLevel?: CourtPaySkillLevelUI;
}

interface Package {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
}

interface RegistrationDraft {
  name: string;
  phone: string;
  gender: "male" | "female";
  skillLevel: "beginner" | "intermediate" | "advanced";
  imageBase64: string | null;
}

/* ─── Constants ───────────────────────────────────────────── */
const CONFIRMED_DISPLAY_MS = 8000;
const ERROR_DISPLAY_MS = 3000;
const CAMERA_WARMUP_MS = 1500;
const CAPTURE_POLL_MS = 120;
const CAPTURE_MAX_ATTEMPTS = 45;
const MAX_FACE_ATTEMPTS = 3;
const RETRY_IDLE_MS = 2000;
const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000;
const PAYMENT_CANCELLED_RESET_MS = 10_000;
const PAYMENT_TIMEOUT_RESET_MS = 15_000;
const ERROR_RESET_MS = 15_000;

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN");
}

/* ─── Component ───────────────────────────────────────────── */
interface CourtPayKioskProps {
  venueId: string;
}

export function CourtPayKiosk({ venueId }: CourtPayKioskProps) {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const { unlockChime, playSuccessChime } = useSuccessChime();
  const { on } = useSocket();
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const paymentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef<KioskStep>("home");

  const [step, setStep] = useState<KioskStep>("home");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [activeSub, setActiveSub] = useState<SubscriptionInfo | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [isNewPlayer, setIsNewPlayer] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Face scan state
  const [scanPhase, setScanPhase] = useState<"adjust" | "capturing" | "between_retries">("adjust");
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Phone state
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<{ player: PlayerInfo; activeSubscription: SubscriptionInfo | null } | null>(null);
  const [phoneError, setPhoneError] = useState("");

  // Registration state
  const [regImage, setRegImage] = useState<string | null>(null);
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regGender, setRegGender] = useState<"male" | "female" | null>(null);
  const [regLevel, setRegLevel] = useState<"beginner" | "intermediate" | "advanced" | null>(null);
  const [regFaceChecking, setRegFaceChecking] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regDraft, setRegDraft] = useState<RegistrationDraft | null>(null);
  const [registrationQualityMessage, setRegistrationQualityMessage] = useState("");
  const [registrationQualityFailures, setRegistrationQualityFailures] = useState(0);

  // Payment state
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Venue info
  const [venueName, setVenueName] = useState("");
  const [venueLogoUrl, setVenueLogoUrl] = useState<string | null>(null);
  const [venueLogoSpin, setVenueLogoSpin] = useState(false);

  /* ─── Helpers ──────────────────────────────────── */
  const goTo = useCallback((s: KioskStep) => {
    stepRef.current = s;
    setStep(s);
  }, []);

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    resetTimerRef.current = null;
    paymentTimerRef.current = null;
  }, []);

  const resetToHome = useCallback(() => {
    clearTimers();
    cameraRef.current?.stopCamera();
    goTo("home");
    setPlayer(null);
    setActiveSub(null);
    setPayment(null);
    setIsNewPlayer(false);
    setErrorMessage("");
    setScanPhase("adjust");
    setRetrySecondsLeft(null);
    setCameraError(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneError("");
    setRegImage(null);
    setRegName("");
    setRegPhone("");
    setRegGender(null);
    setRegLevel(null);
    setRegFaceChecking(false);
    setPaymentLoading(false);
    setPackages([]);
    setRegDraft(null);
    setRegistrationQualityMessage("");
    setRegistrationQualityFailures(0);
  }, [clearTimers, goTo]);

  const scheduleReset = useCallback(
    (ms: number) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToHome, ms);
    },
    [resetToHome]
  );

  // Load venue info
  useEffect(() => {
    api
      .get<{ name: string; logoUrl?: string | null; settings?: { logoSpin?: boolean } }>(`/api/venues/${venueId}`)
      .then((v) => {
        setVenueName(v.name);
        setVenueLogoUrl(v.logoUrl ?? null);
        setVenueLogoSpin(!!v.settings?.logoSpin);
      })
      .catch(() => {});
  }, [venueId]);

  useEffect(() => {
    joinVenue(venueId);
  }, [venueId]);

  /* ─── Socket: listen for payment confirmation/cancellation ──── */
  useEffect(() => {
    const offConfirmed = on("payment:confirmed", (data: unknown) => {
      const d = data as { pendingPaymentId?: string; paymentRef?: string; playerName?: string };
      if (
        stepRef.current === "payment_waiting" ||
        stepRef.current === "payment_cash"
      ) {
        const match =
          (payment?.pendingPaymentId && d.pendingPaymentId === payment.pendingPaymentId) ||
          (payment?.paymentRef && d.paymentRef === payment.paymentRef);
        if (match) {
          clearTimers();
          playSuccessChime();
          goTo("confirmed");
          resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS);
        }
      }
    });

    const offCancelled = on("payment:cancelled", (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (
        stepRef.current === "payment_waiting" ||
        stepRef.current === "payment_cash"
      ) {
        if (payment?.pendingPaymentId && d.pendingPaymentId === payment.pendingPaymentId) {
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
  }, [on, payment, clearTimers, goTo, playSuccessChime, resetToHome]);

  /* ─── Unmount cleanup ───────────────────────── */
  useEffect(() => {
    return () => {
      cameraRef.current?.stopCamera();
      clearTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Load packages when reaching subscription_offer ──── */
  useEffect(() => {
    if (step === "subscription_offer" && packages.length === 0) {
      fetch(`/api/courtpay/packages/${venueId}`)
        .then((r) => r.json())
        .then((d) => setPackages(d.packages || []))
        .catch(() => {});
    }
  }, [step, venueId, packages.length]);

  /* ─── Face scan result handler ─── */
  const handleFaceCheckin = useCallback(
    async (imageBase64: string) => {
      try {
        const res = await api.post<{
          resultType: string;
          player?: PlayerInfo;
          activeSubscription?: SubscriptionInfo | null;
          error?: string;
        }>("/api/courtpay/face-checkin", { venueId, imageBase64 });

        if (res.resultType === "needs_registration") {
          cameraRef.current?.stopCamera();
          goTo("needs_registration");
          return;
        }

        if (res.resultType === "matched" && res.player) {
          cameraRef.current?.stopCamera();
          setPlayer(res.player);

          if (res.activeSubscription) {
            setActiveSub(res.activeSubscription);
            // Auto check-in for subscribers
            const payRes = await fetch("/api/courtpay/pay-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ venueCode: venueId, playerId: res.player.id }),
            });
            const payData = await payRes.json();
            if (payData.checkedIn) {
              playSuccessChime();
              goTo("confirmed");
              resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS);
              return;
            }
          }

          goTo("subscription_offer");
          return;
        }

        // no_face / error: stay on scanning so the loop can retry
        if (res.resultType === "error") {
          cameraRef.current?.stopCamera();
          goTo("error");
          setErrorMessage(res.error || "Something went wrong");
          scheduleReset(ERROR_DISPLAY_MS);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        const isNetwork =
          !navigator.onLine ||
          msg.toLowerCase().includes("fetch") ||
          msg.toLowerCase().includes("network");
        if (isNetwork) {
          goTo("network_error");
          scheduleReset(ERROR_RESET_MS);
          return;
        }
        goTo("error");
        setErrorMessage(msg);
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
    unlockChime();
    goTo("scanning");
  }, [unlockChime, clearTimers, goTo]);

  /* ─── Face scan loop ────── */
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
          setErrorMessage("Camera not ready — tap to try again");
          scheduleReset(4000);
          return;
        }

        await handleFaceCheckin(frame);
        if (cancelled) return;

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
        scheduleReset(ERROR_DISPLAY_MS);
      }
    })();

    return () => { cancelled = true; };
  }, [step, goTo, scheduleReset, handleFaceCheckin]);

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
    if (!raw || raw.length < 8) { setPhoneError("Enter a valid phone number"); return; }
    unlockChime();
    setPhoneLoading(true);
    setPhoneError("");
    try {
      const res = await api.post<{
        found: boolean;
        player?: PlayerInfo;
        activeSubscription?: SubscriptionInfo | null;
      }>("/api/courtpay/identify", { venueCode: venueId, phone: raw });
      if (res.found && res.player) {
        setPhonePreview({ player: res.player, activeSubscription: res.activeSubscription ?? null });
        goTo("phone_preview");
      } else {
        setRegPhone(raw);
        setIsNewPlayer(true);
        goTo("reg_face_capture");
      }
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Could not look up this number");
    } finally {
      setPhoneLoading(false);
    }
  }, [phoneInput, unlockChime, venueId, goTo]);

  const handlePhoneConfirm = useCallback(async () => {
    if (!phonePreview?.player) return;
    const p = phonePreview.player;
    setPlayer(p);

    if (phonePreview.activeSubscription) {
      setActiveSub(phonePreview.activeSubscription);
      try {
        const res = await fetch("/api/courtpay/pay-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueCode: venueId, playerId: p.id }),
        });
        const data = await res.json();
        if (data.checkedIn) {
          playSuccessChime();
          goTo("confirmed");
          resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS);
          return;
        }
      } catch {}
    }

    goTo("subscription_offer");
  }, [phonePreview, venueId, goTo, playSuccessChime, resetToHome]);

  /* ─── Registration: face capture ────────────── */
  const beginRegFaceCapture = useCallback(() => {
    clearTimers();
    setCameraError(null);
    unlockChime();
    setIsNewPlayer(true);
    goTo("reg_face_capture");
  }, [clearTimers, unlockChime, goTo]);

  const captureRegFace = useCallback(async () => {
    const frame = cameraRef.current?.captureFrame();
    if (!frame || regFaceChecking) return;
    setRegFaceChecking(true);
    try {
      let processedFrame = frame;
      try {
        const preview = await api.post<{
          faceDetected?: boolean;
          boundingBox?: RelativeFaceBoundingBox;
        }>("/api/courtpay/preview-face-presence", {
          imageBase64: frame,
          returnBoundingBox: true,
        });
        if (preview.faceDetected && preview.boundingBox) {
          processedFrame = await blurBackgroundKeepFaceSharp(frame, preview.boundingBox, {
            blurPx: 8,
            facePaddingRatio: 0.2,
          });
        }
      } catch {
        // Fallback to the original image without blocking enrollment.
      }

      const check = await api.post<{ existing: boolean; playerName?: string | null }>(
        "/api/courtpay/check-face",
        { imageBase64: processedFrame }
      );
      if (check.existing) {
        cameraRef.current?.stopCamera();
        goTo("existing_user");
        scheduleReset(2200);
        return;
      }

      setRegistrationQualityMessage("");
      setRegImage(processedFrame);
      cameraRef.current?.stopCamera();
      goTo("reg_face_preview");
    } catch {
      cameraRef.current?.stopCamera();
      goTo("error");
      setErrorMessage("Could not verify face. Please try again.");
      scheduleReset(ERROR_DISPLAY_MS);
    } finally {
      setRegFaceChecking(false);
    }
  }, [goTo, regFaceChecking, scheduleReset]);

  const handleRegistrationPhotoTryAgain = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setRegistrationQualityMessage("");
    setRegImage(null);
    setRegDraft((d) => (d ? { ...d, imageBase64: null } : null));
    goTo("reg_face_capture");
  }, [goTo]);

  /* ─── Registration: submit form ─────────────── */
  const handleRegSubmit = useCallback(async () => {
    if (!regName.trim() || !regPhone.trim() || !regGender || !regLevel) return;
    setRegDraft({
      name: regName.trim(),
      phone: regPhone.trim(),
      gender: regGender,
      skillLevel: regLevel,
      imageBase64: regImage,
    });
    setPlayer({
      id: "",
      name: regName.trim(),
      phone: regPhone.trim(),
      skillLevel: regLevel,
    });
    setIsNewPlayer(true);
    goTo("subscription_offer");
  }, [regName, regPhone, regGender, regLevel, regImage, goTo]);

  const startPaymentTimeout = useCallback(() => {
    paymentTimerRef.current = setTimeout(() => {
      if (stepRef.current === "payment_waiting" || stepRef.current === "payment_cash") {
        goTo("payment_timeout");
        resetTimerRef.current = setTimeout(resetToHome, PAYMENT_TIMEOUT_RESET_MS);
      }
    }, PAYMENT_TIMEOUT_MS);
  }, [goTo, resetToHome]);

  /* ─── Subscription: package selected ─────────────── */
  const handlePackageSelected = useCallback(async (packageId: string) => {
    try {
      if (isNewPlayer && (!player?.id || player.id === "") && regDraft) {
        const data = await api.post<{
          playerId: string;
          playerName: string;
          pendingPaymentId?: string | null;
          amount?: number;
          vietQR?: string | null;
          paymentRef?: string | null;
          error?: string;
        }>("/api/courtpay/register", {
          venueCode: venueId,
          ...regDraft,
          packageId,
        });

        if (data.error) {
          setErrorMessage(data.error);
          goTo("error");
          scheduleReset(ERROR_DISPLAY_MS);
          return;
        }

        setRegistrationQualityFailures(0);
        setRegistrationQualityMessage("");

        setPlayer({
          id: data.playerId,
          name: data.playerName,
          phone: regDraft.phone,
          skillLevel: regDraft.skillLevel,
        });
        if (data.pendingPaymentId) {
          setPayment({
            pendingPaymentId: data.pendingPaymentId,
            amount: data.amount ?? 0,
            vietQR: data.vietQR ?? null,
            paymentRef: data.paymentRef ?? "",
            skillLevel: parseCourtPaySkillLevel(regDraft.skillLevel),
          });
          goTo("payment_waiting");
          startPaymentTimeout();
          return;
        }

        playSuccessChime();
        goTo("confirmed");
        resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS);
        return;
      }

      if (!player?.id) return;
      const res = await fetch("/api/courtpay/pay-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueCode: venueId, playerId: player.id, packageId }),
      });
      const data = await res.json();
      if (data.error) { setErrorMessage(data.error); goTo("error"); scheduleReset(ERROR_DISPLAY_MS); return; }
      if (data.checkedIn) { playSuccessChime(); goTo("confirmed"); resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS); return; }
      setPayment({
        pendingPaymentId: data.pendingPaymentId,
        amount: data.amount,
        vietQR: data.vietQR,
        paymentRef: data.paymentRef,
        skillLevel: parseCourtPaySkillLevel(player.skillLevel),
      });
      goTo("payment_waiting");
      startPaymentTimeout();
    } catch (err) {
      if (err instanceof ApiRequestError && err.qualityError) {
        if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setRegistrationQualityFailures((n) => n + 1);
        setRegistrationQualityMessage(err.message);
        return;
      }
      setErrorMessage("Error processing selection");
      goTo("error");
      scheduleReset(ERROR_DISPLAY_MS);
    }
  }, [isNewPlayer, player, regDraft, venueId, goTo, scheduleReset, playSuccessChime, resetToHome, startPaymentTimeout]);

  /* ─── Subscription: skip (pay session only) ──────── */
  const handleSkipSubscription = useCallback(async () => {
    try {
      if (isNewPlayer && (!player?.id || player.id === "") && regDraft) {
        const data = await api.post<{
          playerId: string;
          playerName: string;
          pendingPaymentId?: string | null;
          amount?: number;
          vietQR?: string | null;
          paymentRef?: string | null;
          error?: string;
        }>("/api/courtpay/register", {
          venueCode: venueId,
          ...regDraft,
        });

        if (data.error) {
          setErrorMessage(data.error);
          goTo("error");
          scheduleReset(ERROR_DISPLAY_MS);
          return;
        }

        setRegistrationQualityFailures(0);
        setRegistrationQualityMessage("");

        setPlayer({
          id: data.playerId,
          name: data.playerName,
          phone: regDraft.phone,
          skillLevel: regDraft.skillLevel,
        });
        if (data.pendingPaymentId) {
          setPayment({
            pendingPaymentId: data.pendingPaymentId,
            amount: data.amount ?? 0,
            vietQR: data.vietQR ?? null,
            paymentRef: data.paymentRef ?? "",
            skillLevel: parseCourtPaySkillLevel(regDraft.skillLevel),
          });
          goTo("payment_waiting");
          startPaymentTimeout();
          return;
        }

        playSuccessChime();
        goTo("confirmed");
        resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS);
        return;
      }

      if (!player?.id) return;
      const res = await fetch("/api/courtpay/pay-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueCode: venueId, playerId: player.id }),
      });
      const data = await res.json();
      if (data.checkedIn) { playSuccessChime(); goTo("confirmed"); resetTimerRef.current = setTimeout(resetToHome, CONFIRMED_DISPLAY_MS); return; }
      setPayment({
        pendingPaymentId: data.pendingPaymentId,
        amount: data.amount,
        vietQR: data.vietQR,
        paymentRef: data.paymentRef,
        skillLevel: parseCourtPaySkillLevel(player.skillLevel),
      });
      goTo("payment_waiting");
      startPaymentTimeout();
    } catch (err) {
      if (err instanceof ApiRequestError && err.qualityError) {
        if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setRegistrationQualityFailures((n) => n + 1);
        setRegistrationQualityMessage(err.message);
        return;
      }
      setErrorMessage("Error processing payment");
      goTo("error");
      scheduleReset(ERROR_DISPLAY_MS);
    }
  }, [isNewPlayer, player, regDraft, venueId, goTo, scheduleReset, playSuccessChime, resetToHome, startPaymentTimeout]);

  /* ─── Payment: switch to cash ───────────────── */
  const switchToCash = useCallback(async () => {
    if (!payment) return;
    setPaymentLoading(true);
    try {
      await api.post("/api/courtpay/cash-payment", { pendingPaymentId: payment.pendingPaymentId });
      goTo("payment_cash");
    } catch {
      // stay on QR screen
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
        setErrorMessage(msg);
        scheduleReset(4000);
      }
    },
    [scheduleReset, goTo]
  );

  const bgColor =
    ({
      home: "bg-black",
      scanning: "bg-black",
      confirmed: "bg-black",
      error: "bg-red-950",
      no_face: "bg-amber-950",
      needs_registration: "bg-neutral-900",
      network_error: "bg-red-950",
      phone_enter: "bg-black",
      phone_preview: "bg-black",
      reg_face_capture: "bg-black",
      reg_face_preview: "bg-black",
      reg_form: "bg-black",
      existing_user: "bg-amber-950",
      subscription_offer: "bg-black",
      payment_waiting: "bg-black",
      payment_cash: "bg-black",
      payment_timeout: "bg-red-950",
      payment_cancelled: "bg-red-950",
    } as Record<string, string>)[step] ?? "bg-black";

  return (
    <div className={cn("relative flex h-full w-full flex-col transition-colors duration-300", bgColor)}>

      {/* ── HOME ─────────────────────────────────── */}
      {step === "home" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-7 px-8 pb-10 text-center">
          {venueLogoUrl && (
            <div
              className={cn(
                "h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-neutral-800 bg-neutral-900",
                venueLogoSpin && "animate-flip-y"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={venueLogoUrl} alt={venueName || "Venue logo"} className="h-full w-full object-cover" />
            </div>
          )}
          {venueName && (
            <p className="text-lg font-medium text-neutral-400">{venueName}</p>
          )}
          <div className="w-full max-w-lg space-y-4">
            <button
              type="button"
              onClick={beginRegFaceCapture}
              className="flex w-full items-center gap-5 rounded-3xl border-2 border-neutral-600/50 bg-neutral-800/30 px-8 py-7 text-left transition-colors hover:bg-neutral-800/60 active:scale-[0.99]"
            >
              <UserPlus className="h-10 w-10 shrink-0 text-neutral-400" />
              <div>
                <p className="text-2xl font-bold text-white">First Time?</p>
                <p className="text-base text-neutral-400">Register & get started</p>
              </div>
            </button>
            <button
              type="button"
              onClick={beginFaceScan}
              className="flex w-full items-center gap-5 rounded-3xl border-2 border-fuchsia-600/50 bg-fuchsia-900/30 px-8 py-7 text-left transition-colors hover:bg-fuchsia-900/50 active:scale-[0.99]"
            >
              <ScanFace className="h-10 w-10 shrink-0 text-fuchsia-400" />
              <div>
                <p className="text-2xl font-bold text-white">Registered player</p>
                <p className="text-base text-neutral-400">Scan your face to check in</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── SCANNING (face scan for returning) ──── */}
      {step === "scanning" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-center text-lg text-neutral-300">
            {scanPhase === "between_retries"
              ? "No match yet — retrying…"
              : scanPhase === "adjust"
                ? "Position your face in the frame"
                : "Hold still…"}
          </p>
          <div className="relative aspect-[8/9] w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-fuchsia-600/40 bg-black shadow-lg shadow-fuchsia-900/20">
            <CameraCapture ref={cameraRef} active onError={onCameraError} className="h-full w-full" videoClassName="h-full w-full object-cover [transform:scaleX(-1)]" />
            {scanPhase === "between_retries" && retrySecondsLeft != null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-4 text-center">
                <p className="text-2xl font-semibold text-white">Next scan in</p>
                <p className="mt-2 text-5xl font-bold tabular-nums text-fuchsia-400">{retrySecondsLeft}</p>
              </div>
            )}
          </div>
          {cameraError ? (
            <p className="text-center text-sm text-red-400">{cameraError}</p>
          ) : scanPhase === "capturing" ? (
            <div className="flex items-center gap-3 text-neutral-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-fuchsia-500" />
              <span>Scanning…</span>
            </div>
          ) : scanPhase === "between_retries" ? (
            <p className="text-sm text-amber-200/90">Will retry automatically</p>
          ) : (
            <p className="text-sm text-neutral-500">Camera ready</p>
          )}
        </div>
      )}

      {/* ── NEEDS REGISTRATION ──────────────────── */}
      {step === "needs_registration" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <button type="button" onClick={resetToHome} className="absolute left-6 top-6 z-20 rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="Back">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h2 className="text-2xl font-bold text-neutral-200">Face not recognized</h2>
          <p className="text-lg text-neutral-400">Try again or use your phone number</p>
          <button type="button" onClick={beginFaceScan} className="w-full max-w-lg rounded-3xl bg-fuchsia-600 px-8 py-7 text-2xl font-bold text-white transition-colors hover:bg-fuchsia-500 active:scale-[0.99]">
            Scan Again
          </button>
          <div className="flex items-center justify-center">
            <button type="button" onClick={openPhoneFlow} className="flex items-center gap-2 rounded-xl bg-fuchsia-700 px-6 py-3 text-lg font-semibold text-white hover:bg-fuchsia-600">
              <Smartphone className="h-5 w-5" />
              Check in with phone
            </button>
          </div>
        </div>
      )}

      {/* ── NO FACE / ERROR ─────────────────────── */}
      {(step === "no_face" || step === "error") && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">
            {step === "no_face" ? "No face detected" : "Something went wrong"}
          </h2>
          <p className="text-lg text-neutral-400">
            {step === "no_face" ? "Please look directly at the camera" : errorMessage || "Please try again"}
          </p>
        </div>
      )}

      {step === "existing_user" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-amber-200">Already Registered</h2>
          <p className="text-lg text-neutral-300">Use &quot;Registered player&quot; instead</p>
        </div>
      )}

      {/* ── NETWORK ERROR ───────────────────────── */}
      {step === "network_error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">{"\u26A0"}</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">Network Issue</h2>
          <p className="text-lg text-neutral-400">Please check the connection or see staff</p>
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
              <h3 className="text-lg font-semibold text-white">Check in by phone</h3>
            </div>
            <p className="text-sm text-neutral-400">Enter your phone number to look up your account</p>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="0901234567"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-lg text-white placeholder:text-neutral-600"
              onKeyDown={(e) => { if (e.key === "Enter") void handlePhoneLookup(); }}
            />
            {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
            <button type="button" disabled={phoneLoading} onClick={() => void handlePhoneLookup()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-700 py-3 font-medium text-white hover:bg-fuchsia-600 disabled:opacity-50">
              {phoneLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              Look up
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
              <p><span className="text-neutral-500">Phone: </span><span className="font-medium text-white">{phonePreview.player.phone}</span></p>
              {phonePreview.activeSubscription && (
                <p><span className="text-neutral-500">Package: </span><span className="font-medium text-purple-400">{phonePreview.activeSubscription.packageName}</span></p>
              )}
            </div>
            <button type="button" onClick={() => void handlePhoneConfirm()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 py-3 font-medium text-white hover:bg-fuchsia-500">
              Confirm Check In
            </button>
          </div>
        </div>
      )}

      {/* ── REGISTRATION: FACE CAPTURE ──────────── */}
      {step === "reg_face_capture" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">New Player</h2>
            <p className="mt-1 text-base text-neutral-400">Take a photo to register your face</p>
          </div>
          <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-full border-4 border-fuchsia-600/40 bg-black">
            <CameraCapture ref={cameraRef} active onError={onCameraError} className="h-full w-full" videoClassName="h-full w-full object-cover [transform:scaleX(-1)]" />
          </div>
          <button type="button" onClick={captureRegFace}
            disabled={regFaceChecking}
            className="flex items-center gap-2 rounded-2xl bg-fuchsia-600 px-10 py-4 text-xl font-bold text-white hover:bg-fuchsia-500 active:scale-[0.98] disabled:opacity-60">
            {regFaceChecking && <Loader2 className="h-5 w-5 animate-spin" />}
            {regFaceChecking ? "Checking…" : "Capture"}
          </button>
          <button type="button" onClick={resetToHome} className="text-sm text-neutral-500 hover:text-neutral-300">
            <ArrowLeft className="mr-1 inline h-4 w-4" />
            Back
          </button>
        </div>
      )}

      {/* ── REGISTRATION: FACE PREVIEW ──────────── */}
      {step === "reg_face_preview" && regImage && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-4">
          <h2 className="text-3xl font-bold text-fuchsia-400">Great photo!</h2>
          <div className="h-56 w-56 overflow-hidden rounded-full border-4 border-fuchsia-600/70 shadow-[0_0_40px_rgba(192,38,211,0.28)] sm:h-64 sm:w-64">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${regImage}`} alt="" className="h-full w-full object-cover [transform:scaleX(-1)]" />
          </div>
          <div className="mt-1 flex w-full max-w-md gap-3">
            <button type="button" onClick={() => goTo("reg_form")}
              className="flex-1 rounded-2xl bg-fuchsia-600 px-6 py-4 text-xl font-bold text-white hover:bg-fuchsia-500">
              Looks good →
            </button>
            <button type="button" onClick={() => { setRegImage(null); setRegistrationQualityMessage(""); goTo("reg_face_capture"); }}
              className="rounded-2xl bg-neutral-700 px-6 py-4 text-lg font-medium text-neutral-200 hover:bg-neutral-600">
              Retake
            </button>
          </div>
        </div>
      )}

      {/* ── REGISTRATION: FORM ──────────────────── */}
      {step === "reg_form" && (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 pb-8 sm:items-center sm:py-6">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            {registrationQualityMessage ? (
              <div className="space-y-2 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3">
                <p className="text-sm leading-snug text-amber-50">{registrationQualityMessage}</p>
                {registrationQualityFailures >= 3 ? (
                  <p className="text-xs text-neutral-300">{t("staff.courtPayCheckIn.registerPhotoAskStaff")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleRegistrationPhotoTryAgain()}
                  className="w-full rounded-lg bg-fuchsia-600 py-2.5 text-sm font-bold text-white hover:bg-fuchsia-500"
                >
                  {t("staff.courtPayCheckIn.registerPhotoTryAgain")}
                </button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                  Name
                </label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                  placeholder="Your Reclub's name"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-white placeholder:text-neutral-500 focus:border-fuchsia-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-400">Gender</p>
                <div className="flex gap-1.5">
                  {(["male", "female"] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setRegGender(g)}
                      className={cn(
                        "flex h-10 w-12 items-center justify-center rounded-lg border-2 text-xs font-bold tracking-wide transition-colors",
                        regGender === g
                          ? g === "male"
                            ? "border-sky-400 bg-sky-500/40 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                            : "border-rose-400 bg-rose-500/40 text-rose-100 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.35)]"
                          : "border-neutral-600 bg-neutral-950/80 text-neutral-400 hover:border-neutral-500"
                      )}
                    >
                      {g === "male" ? "M" : "F"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">Phone</label>
              <input type="tel" inputMode="tel" autoComplete="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)}
                placeholder="0901234567"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-white placeholder:text-neutral-500 focus:border-fuchsia-500 focus:outline-none"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Skill Level</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                  <button key={lvl} type="button" onClick={() => setRegLevel(lvl)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-2 text-center text-xs font-semibold transition-colors",
                      regLevel === lvl
                        ? lvl === "beginner"
                          ? "border-green-500 bg-green-500/35 text-green-50 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.4)]"
                          : lvl === "intermediate"
                            ? "border-red-500 bg-red-500/35 text-red-50 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.4)]"
                            : "border-yellow-500 bg-yellow-500/35 text-yellow-950 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.45)]"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                    )}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <button type="button"
              disabled={!regName.trim() || !regPhone.trim() || !regGender || !regLevel || regLoading}
              onClick={() => void handleRegSubmit()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 py-3 text-base font-semibold text-white transition-colors hover:bg-fuchsia-500 disabled:opacity-40"
            >
              {regLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTION OFFER ──────────────────── */}
      {step === "subscription_offer" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {registrationQualityMessage ? (
            <div className="shrink-0 px-4 pt-4 sm:px-6">
              <div className="mx-auto max-w-md space-y-2 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3">
                <p className="text-sm leading-snug text-amber-50">{registrationQualityMessage}</p>
                {registrationQualityFailures >= 3 ? (
                  <p className="text-xs text-neutral-300">{t("staff.courtPayCheckIn.registerPhotoAskStaff")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleRegistrationPhotoTryAgain()}
                  className="w-full rounded-lg bg-fuchsia-600 py-2.5 text-sm font-bold text-white hover:bg-fuchsia-500"
                >
                  {t("staff.courtPayCheckIn.registerPhotoTryAgain")}
                </button>
              </div>
            </div>
          ) : null}
          <SubscriptionOffer
            playerName={player?.name || ""}
            packages={packages}
            isNew={isNewPlayer}
            onSelect={handlePackageSelected}
            onSkip={handleSkipSubscription}
          />
        </div>
      )}

      {/* ── PAYMENT WAITING (VietQR) ────────────── */}
      {step === "payment_waiting" && payment && (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
          <button type="button" onClick={resetToHome} className="absolute left-4 top-4 rounded-full p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h2 className="text-2xl font-bold text-white">
            {isNewPlayer ? `Payment — ${player?.name || ""}` : "Session Payment"}
          </h2>

          {payment.vietQR ? (
            <div
              className={cn(
                "rounded-2xl bg-white p-3",
                payment.skillLevel ? COURTPAY_LEVEL_QR_FRAME[payment.skillLevel] : ""
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={payment.vietQR} alt="VietQR" className="w-72 max-w-[70vw] object-contain" />
            </div>
          ) : (
            <div
              className={cn(
                "rounded-2xl bg-neutral-900 p-8 text-center",
                payment.skillLevel
                  ? COURTPAY_LEVEL_QR_FRAME[payment.skillLevel]
                  : "border-2 border-dashed border-neutral-600"
              )}
            >
              <p className="text-lg text-neutral-400">QR unavailable — pay by cash below</p>
            </div>
          )}

          <p className="text-4xl font-bold text-fuchsia-400">{formatVND(payment.amount)} VND</p>
          <p className="text-xs font-mono text-neutral-500">{payment.paymentRef}</p>

          <p className="max-w-sm text-center text-base text-neutral-400">
            Scan with your banking app to pay
          </p>

          <div className="flex items-center gap-3 text-neutral-500">
            <div className="h-3 w-3 animate-pulse rounded-full bg-fuchsia-500" />
            <span>Waiting for confirmation…</span>
          </div>

          <div className="flex items-center gap-4 text-neutral-500">
            <div className="h-px w-12 bg-neutral-700" />
            <span className="text-sm">or</span>
            <div className="h-px w-12 bg-neutral-700" />
          </div>

          <button type="button" disabled={paymentLoading} onClick={() => void switchToCash()}
            className="flex items-center gap-2 rounded-xl bg-amber-700/30 px-6 py-3 text-lg font-semibold text-amber-200 hover:bg-amber-700/50 disabled:opacity-50">
            {paymentLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            Pay by cash
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
            Pay {formatVND(payment.amount)} VND at the counter
          </h2>
          <div className="flex items-center gap-3 text-neutral-400">
            <div className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
            <span>Waiting for staff confirmation…</span>
          </div>
        </div>
      )}

      {/* ── PAYMENT TIMEOUT ─────────────────────── */}
      {step === "payment_timeout" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">Payment Timed Out</h2>
          <p className="text-lg text-neutral-400">Please try again or ask staff for help</p>
          <button type="button" onClick={resetToHome}
            className="mt-4 rounded-2xl bg-fuchsia-600 px-8 py-4 text-xl font-bold text-white hover:bg-fuchsia-500">
            Try Again
          </button>
        </div>
      )}

      {/* ── PAYMENT CANCELLED ───────────────────── */}
      {step === "payment_cancelled" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-700">
            <span className="text-3xl">✕</span>
          </div>
          <h2 className="text-3xl font-bold text-red-300">Payment Cancelled</h2>
          <p className="text-lg text-neutral-400">See staff if you need assistance</p>
        </div>
      )}

      {/* ── CONFIRMED / SUCCESS ──────────────────── */}
      {step === "confirmed" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <SuccessScreen
            playerName={player?.name || ""}
            subscription={
              activeSub
                ? {
                    packageName: activeSub.packageName,
                    sessionsRemaining: activeSub.sessionsRemaining,
                    isUnlimited: activeSub.isUnlimited,
                  }
                : null
            }
            isNew={isNewPlayer}
            onReset={resetToHome}
          />
        </div>
      )}
    </div>
  );
}
