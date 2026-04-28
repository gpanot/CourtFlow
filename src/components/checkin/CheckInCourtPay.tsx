"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { api, ApiRequestError } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import type { StaffTabPanelProps } from "@/config/componentMap";
import { CameraCapture, type CameraCaptureHandle, mapCameraError } from "@/components/camera-capture";
import { acquireBrowserCameraStream, stopMediaStream } from "@/lib/browser-camera";
import { parseCourtPaySkillLevel, type CourtPaySkillLevelUI } from "@/modules/courtpay/lib/skill-level-ui";
import {
  CourtPayAwaitingPaymentStaff,
  COURTPAY_SESSION_PARTY_MAX,
} from "@/components/checkin/court-pay-awaiting-payment-staff";
import { cn } from "@/lib/cn";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  User,
  AlertTriangle,
} from "lucide-react";

type Step = "form" | "awaiting_payment" | "success" | "error";
type Mode = "new" | "existing";

interface ExistingPlayerPreview {
  id: string;
  name: string;
  phone: string;
  source?: "player" | "checkInPlayer";
  skillLevel?: string | null;
  facePhotoPath?: string | null;
  avatarPhotoPath?: string | null;
}

interface PendingPaymentState {
  id: string;
  checkInPlayerId: string;
  amount: number;
  qrUrl: string | null;
  paymentRef: string;
  partyCount: number;
  playerName?: string | null;
  playerPhone?: string | null;
  skillLevel?: CourtPaySkillLevelUI;
}

function toPendingPayment(
  data: {
    pendingPaymentId?: string;
    amount?: number;
    vietQR?: string | null;
    paymentRef?: string;
    playerName?: string | null;
    playerPhone?: string | null;
    skillLevel?: string | null;
    partyCount?: number;
  } | null,
  checkInPlayerId: string
): PendingPaymentState | null {
  if (!data?.pendingPaymentId || !checkInPlayerId) return null;
  const parsedLevel = parseCourtPaySkillLevel(data.skillLevel ?? undefined);
  const partyCount = data.partyCount ?? 1;
  return {
    id: data.pendingPaymentId,
    checkInPlayerId,
    amount: data.amount ?? 0,
    qrUrl: data.vietQR ?? null,
    paymentRef: data.paymentRef ?? "",
    partyCount,
    playerName: data.playerName ?? null,
    playerPhone: data.playerPhone ?? null,
    ...(parsedLevel ? { skillLevel: parsedLevel } : {}),
  };
}

function photoSrc(path: string | null | undefined): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("data:")) return p;
  return p;
}

export function CheckInCourtPay(props: StaffTabPanelProps) {
  void props.legacyTab;
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const venueId = useSessionStore((s) => s.venueId);

  const [mode, setMode] = useState<Mode>("new");
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<"beginner" | "intermediate" | "advanced" | null>(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  /** null = not checked yet / cleared; set after /api/courtpay/preview-face-presence */
  const [capturedFacePresent, setCapturedFacePresent] = useState<boolean | null>(null);
  const [capturedFacePresenceLoading, setCapturedFacePresenceLoading] = useState(false);
  const [existingPreview, setExistingPreview] = useState<ExistingPlayerPreview | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [sessionPartyCount, setSessionPartyCount] = useState(1);
  const [partyAdjusting, setPartyAdjusting] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);

  const [newFacing, setNewFacing] = useState<"user" | "environment">("user");
  const [newStream, setNewStream] = useState<MediaStream | null>(null);
  const [newCameraStarted, setNewCameraStarted] = useState(false);
  const [newCameraReady, setNewCameraReady] = useState(false);
  const [newCaptureBusy, setNewCaptureBusy] = useState(false);
  const newCamRef = useRef<CameraCaptureHandle>(null);
  const newStreamRef = useRef<MediaStream | null>(null);
  const newCameraLive =
    newCameraStarted && !!newStream && mode === "new" && step === "form" && !faceBase64;

  const [existingStream, setExistingStream] = useState<MediaStream | null>(null);
  const [existingCameraStarted, setExistingCameraStarted] = useState(false);
  const [existingFacing, setExistingFacing] = useState<"user" | "environment">("environment");
  const [existingCameraReady, setExistingCameraReady] = useState(false);
  const [existingCaptureBusy, setExistingCaptureBusy] = useState(false);
  const existingCamRef = useRef<CameraCaptureHandle>(null);
  const existingStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    newStreamRef.current = newStream;
  }, [newStream]);
  useEffect(() => {
    existingStreamRef.current = existingStream;
  }, [existingStream]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Server-side enrollment photo quality (DetectFaces); non-empty → show retake UI, stay on form. */
  const [registrationQualityMessage, setRegistrationQualityMessage] = useState("");
  const [registrationQualityFailures, setRegistrationQualityFailures] = useState(0);

  const resetForm = useCallback(() => {
    stopMediaStream(newStreamRef.current);
    stopMediaStream(existingStreamRef.current);
    setNewStream(null);
    setExistingStream(null);
    setStep("form");
    setName("");
    setPhone("");
    setGender(null);
    setSkillLevel(null);
    setFaceBase64(null);
    setCapturedFacePresent(null);
    setCapturedFacePresenceLoading(false);
    setExistingPreview(null);
    setPendingPayment(null);
    setSessionPartyCount(1);
    setPartyAdjusting(false);
    setCashSubmitting(false);
    setNewFacing("user");
    setNewCameraStarted(false);
    setNewCameraReady(false);
    setNewCaptureBusy(false);
    setExistingCameraStarted(false);
    setExistingFacing("environment");
    setExistingCameraReady(false);
    setExistingCaptureBusy(false);
    setLoading(false);
    setError("");
    setRegistrationQualityMessage("");
    setRegistrationQualityFailures(0);
  }, []);

  const pendingIdRef = useRef<string | null>(null);
  useEffect(() => {
    pendingIdRef.current = pendingPayment?.id ?? null;
  }, [pendingPayment?.id]);

  const { on } = useSocket();
  useEffect(() => {
    if (!venueId) return;
    joinVenue(venueId);
    const offConfirmed = on("payment:confirmed", (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (d.pendingPaymentId && d.pendingPaymentId === pendingIdRef.current) {
        setStep("success");
      }
    });
    const offCancelled = on("payment:cancelled", (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (d.pendingPaymentId && d.pendingPaymentId === pendingIdRef.current) {
        resetForm();
      }
    });
    return () => {
      offConfirmed();
      offCancelled();
    };
  }, [venueId, on, resetForm]);

  useEffect(() => {
    let cancelled = false;
    if (!faceBase64) {
      setCapturedFacePresent(null);
      setCapturedFacePresenceLoading(false);
      return;
    }
    setCapturedFacePresent(null);
    setCapturedFacePresenceLoading(true);
    void api
      .post<{ faceDetected?: boolean }>("/api/courtpay/preview-face-presence", {
        imageBase64: faceBase64,
      })
      .then((response) => {
        if (cancelled) return;
        setCapturedFacePresent(response.faceDetected === true);
      })
      .catch(() => {
        if (cancelled) return;
        setCapturedFacePresent(true);
      })
      .finally(() => {
        if (!cancelled) setCapturedFacePresenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [faceBase64]);

  useEffect(() => {
    if (!newCameraLive) setNewCameraReady(false);
  }, [newCameraLive, newFacing]);

  useEffect(() => {
    if (!existingCameraStarted || !existingStream) setExistingCameraReady(false);
  }, [existingCameraStarted, existingStream, existingFacing]);

  const handleLookupByPhone = async () => {
    if (!phone.trim() || !venueId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        success: boolean;
        source: "player" | "checkInPlayer";
        player: ExistingPlayerPreview;
      }>("/api/staff/player-lookup", {
        phone: phone.trim(),
        venueId,
      });
      setExistingPreview({ ...data.player, source: data.source });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("staff.courtPayCheckIn.lookupFailed"));
    } finally {
      setLoading(false);
    }
  };

  const stopExistingCamera = useCallback(() => {
    setExistingStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    setExistingCameraStarted(false);
    setExistingCaptureBusy(false);
    setExistingCameraReady(false);
  }, []);

  const startExistingCamera = useCallback(async () => {
    setError("");
    setExistingCameraReady(false);
    try {
      const stream = await acquireBrowserCameraStream(existingFacing);
      setExistingStream(stream);
      setExistingCameraStarted(true);
    } catch (err) {
      setError(mapCameraError(err));
    }
  }, [existingFacing]);

  const switchExistingFacing = useCallback(async () => {
    setExistingCameraReady(false);
    const next = existingFacing === "environment" ? "user" : "environment";
    setExistingStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    try {
      const stream = await acquireBrowserCameraStream(next);
      setExistingFacing(next);
      setExistingStream(stream);
    } catch (err) {
      setError(mapCameraError(err));
      stopExistingCamera();
    }
  }, [existingFacing, stopExistingCamera]);

  const stopNewCamera = useCallback(() => {
    setNewStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    setNewCameraStarted(false);
    setNewCameraReady(false);
    setNewCaptureBusy(false);
  }, []);

  const startNewCamera = useCallback(async () => {
    setError("");
    setNewCameraReady(false);
    try {
      const stream = await acquireBrowserCameraStream(newFacing);
      setNewStream(stream);
      setNewCameraStarted(true);
    } catch (err) {
      setError(mapCameraError(err));
    }
  }, [newFacing]);

  const switchNewFacing = useCallback(async () => {
    setNewCameraReady(false);
    const next = newFacing === "user" ? "environment" : "user";
    setNewStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    try {
      const stream = await acquireBrowserCameraStream(next);
      setNewFacing(next);
      setNewStream(stream);
    } catch (err) {
      setError(mapCameraError(err));
      stopNewCamera();
    }
  }, [newFacing, stopNewCamera]);

  const handleExistingCapture = useCallback(async () => {
    if (!venueId || !existingCamRef.current || !existingCameraReady || existingCaptureBusy) return;
    setExistingCaptureBusy(true);
    setError("");
    try {
      const imageBase64 = existingCamRef.current.captureFrame();
      if (!imageBase64) {
        setError(t("staff.courtPayCheckIn.tryAgainGeneric"));
        return;
      }
      try {
        const data = await api.post<{
          resultType?: string;
          error?: string;
          player?: { id: string; name: string; phone: string };
          alreadyPaidStatus?: string;
        }>("/api/courtpay/face-checkin", { venueId, imageBase64 });

        if (data.resultType === "needs_registration") {
          setError(t("staff.courtPayCheckIn.checkInFaceNotRecognized"));
          return;
        }
        if (data.resultType === "no_face" || data.resultType === "multi_face") {
          setError(t("staff.courtPayCheckIn.checkInNoFaceDetected"));
          return;
        }
        if (data.resultType === "error") {
          setError(data.error ?? t("staff.courtPayCheckIn.somethingWrong"));
          return;
        }
        if (data.resultType === "already_paid") {
          setStep("success");
          stopExistingCamera();
          return;
        }
        if (data.resultType === "matched" && data.player) {
          const pay = await api.post<{
            pendingPaymentId?: string;
            amount?: number;
            vietQR?: string | null;
            paymentRef?: string;
            playerName?: string | null;
            playerPhone?: string | null;
            skillLevel?: string | null;
            partyCount?: number;
            checkedIn?: boolean;
            free?: boolean;
          }>("/api/courtpay/pay-session", {
            venueCode: venueId,
            playerId: data.player.id,
            headCount: sessionPartyCount,
          });
          if (pay.checkedIn || pay.free) {
            setStep("success");
            stopExistingCamera();
            return;
          }
          const payment = toPendingPayment(pay, data.player.id);
          if (payment) {
            setSessionPartyCount(payment.partyCount);
            setPendingPayment(payment);
            setStep("awaiting_payment");
            stopExistingCamera();
            return;
          }
          setStep("success");
          stopExistingCamera();
          return;
        }
        setError(t("staff.courtPayCheckIn.checkInFaceNotRecognized"));
      } catch (err) {
        const msg =
          err instanceof ApiRequestError || err instanceof Error ? err.message : "Check-in failed";
        if (msg === "already_checked_in") {
          setStep("success");
          stopExistingCamera();
          return;
        }
        setError(msg);
      }
    } finally {
      setExistingCaptureBusy(false);
    }
  }, [existingCameraReady, existingCaptureBusy, venueId, t, sessionPartyCount, stopExistingCamera]);

  const handleNewCapture = async () => {
    if (!newCamRef.current || !newCameraReady || newCaptureBusy) return;
    setNewCaptureBusy(true);
    try {
      const b64 = newCamRef.current.captureFrame();
      if (!b64) {
        setError(t("staff.courtPayCheckIn.tryAgainGeneric"));
        return;
      }
      setFaceBase64(b64);
      stopNewCamera();
    } finally {
      setNewCaptureBusy(false);
    }
  };

  const handleExistingPhoneCheckIn = async () => {
    if (!existingPreview || !venueId) return;
    setLoading(true);
    setError("");
    try {
      let checkInPlayerId = existingPreview.id;
      if (existingPreview.source === "player") {
        const bridged = await api.post<{
          checkInPlayer: { id: string; name: string; phone: string };
        }>("/api/courtpay/staff/ensure-check-in-player", {
          venueId,
          playerId: existingPreview.id,
        });
        checkInPlayerId = bridged.checkInPlayer.id;
        setExistingPreview({
          id: bridged.checkInPlayer.id,
          name: bridged.checkInPlayer.name,
          phone: bridged.checkInPlayer.phone,
          source: "checkInPlayer",
          skillLevel: existingPreview.skillLevel ?? null,
        });
      }

      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        paymentRef?: string;
        playerName?: string | null;
        playerPhone?: string | null;
        skillLevel?: string | null;
        partyCount?: number;
        checkedIn?: boolean;
        free?: boolean;
      }>("/api/courtpay/pay-session", {
        venueCode: venueId,
        playerId: checkInPlayerId,
        headCount: sessionPartyCount,
      });

      if (data.checkedIn || data.free) {
        setStep("success");
        return;
      }
      const payment = toPendingPayment(data, checkInPlayerId);
      if (payment) {
        setSessionPartyCount(payment.partyCount);
        setPendingPayment(payment);
        setStep("awaiting_payment");
      } else {
        setStep("success");
      }
    } catch (err) {
      const msg =
        err instanceof ApiRequestError || err instanceof Error ? err.message : "Check-in failed";
      if (msg === "already_checked_in") {
        setStep("success");
        return;
      }
      setError(msg);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationPhotoTryAgain = useCallback(() => {
    setRegistrationQualityMessage("");
    stopNewCamera();
    setFaceBase64(null);
    setCapturedFacePresent(null);
    setCapturedFacePresenceLoading(false);
  }, [stopNewCamera]);

  const handleNewRegistration = async () => {
    if (!venueId || !name.trim() || !phone.trim() || !gender || !skillLevel || !faceBase64) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        playerId?: string;
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        paymentRef?: string;
        playerName?: string | null;
        playerPhone?: string | null;
        skillLevel?: string | null;
        partyCount?: number;
        checkedIn?: boolean;
        free?: boolean;
      }>("/api/courtpay/register", {
        venueCode: venueId,
        imageBase64: faceBase64,
        name: name.trim(),
        phone: phone.trim(),
        gender,
        skillLevel,
        headCount: sessionPartyCount,
      });
      setRegistrationQualityFailures(0);
      if (data.checkedIn || data.free) {
        setStep("success");
        return;
      }
      const pid = data.playerId?.trim();
      const payment = pid ? toPendingPayment(data, pid) : null;
      if (payment) {
        setSessionPartyCount(payment.partyCount);
        setPendingPayment(payment);
        setStep("awaiting_payment");
      } else {
        setStep("success");
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.qualityError) {
        setRegistrationQualityFailures((n) => n + 1);
        setRegistrationQualityMessage(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : t("staff.courtPayCheckIn.registrationFailed"));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSessionPartyCountChange = useCallback(
    async (next: number) => {
      if (!venueId || !pendingPayment) return;
      const clamped = Math.min(COURTPAY_SESSION_PARTY_MAX, Math.max(1, Math.floor(next)));
      if (clamped === sessionPartyCount) return;
      setPartyAdjusting(true);
      setError("");
      try {
        const res = await api.post<{
          pendingPaymentId?: string | null;
          amount?: number;
          paymentRef?: string | null;
          vietQR?: string | null;
          skillLevel?: string | null;
          partyCount?: number;
        }>("/api/courtpay/pay-session", {
          venueCode: venueId,
          playerId: pendingPayment.checkInPlayerId,
          headCount: clamped,
        });
        const pc = res.partyCount ?? clamped;
        setSessionPartyCount(pc);
        setPendingPayment((prev) => {
          if (!prev) return prev;
          const lvl = parseCourtPaySkillLevel(res.skillLevel ?? undefined);
          return {
            ...prev,
            id: res.pendingPaymentId ?? prev.id,
            amount: res.amount ?? prev.amount,
            paymentRef: res.paymentRef ?? prev.paymentRef,
            qrUrl: res.vietQR ?? prev.qrUrl,
            partyCount: pc,
            skillLevel: lvl ?? prev.skillLevel,
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("staff.courtPayCheckIn.paymentUpdateFailed"));
      } finally {
        setPartyAdjusting(false);
      }
    },
    [venueId, pendingPayment, sessionPartyCount, t]
  );

  const handleCashPayment = async () => {
    if (!pendingPayment) return;
    setCashSubmitting(true);
    try {
      await api.post("/api/courtpay/cash-payment", {
        pendingPaymentId: pendingPayment.id,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("staff.courtPayCheckIn.cashPaymentFailed"));
      setStep("error");
    } finally {
      setCashSubmitting(false);
    }
  };

  const canSubmitNewPlayer = useMemo(
    () =>
      !loading &&
      !!faceBase64 &&
      !capturedFacePresenceLoading &&
      capturedFacePresent === true &&
      !!name.trim() &&
      !!phone.trim() &&
      !!gender &&
      !!skillLevel,
    [
      capturedFacePresenceLoading,
      capturedFacePresent,
      faceBase64,
      gender,
      loading,
      name,
      phone,
      skillLevel,
    ]
  );

  const existingScannerHint = existingCameraStarted
    ? t("staff.courtPayCheckIn.checkInCaptureHintActive")
    : t("staff.courtPayCheckIn.checkInCaptureHintIdle");

  const payerName =
    pendingPayment?.playerName?.trim() ||
    existingPreview?.name?.trim() ||
    name.trim() ||
    "";

  if (step === "awaiting_payment" && pendingPayment) {
    return (
      <div className="mx-auto flex w-full max-w-md justify-center px-2 py-4">
        <CourtPayAwaitingPaymentStaff
          playerName={payerName}
          pending={{
            qrUrl: pendingPayment.qrUrl,
            amount: pendingPayment.amount,
            paymentRef: pendingPayment.paymentRef,
            skillLevel: pendingPayment.skillLevel,
          }}
          partyCount={sessionPartyCount}
          partyAdjusting={partyAdjusting}
          cashLoading={cashSubmitting}
          onPartyCountChange={handleSessionPartyCountChange}
          onCash={() => void handleCashPayment()}
          onCancel={resetForm}
        />
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 pb-32 pt-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-11 w-11 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{t("staff.courtPayCheckIn.checkInComplete")}</h2>
        <button
          type="button"
          onClick={resetForm}
          className="mt-2 w-full max-w-xs rounded-lg bg-client-primary py-3 text-[15px] font-bold text-neutral-950 hover:opacity-90"
        >
          {t("staff.courtPayCheckIn.checkInNextCheckIn")}
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 pb-32 pt-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{t("staff.courtPayCheckIn.checkInSomethingWrong")}</h2>
        {error ? <p className="max-w-sm text-sm text-red-400">{error}</p> : null}
        <button
          type="button"
          onClick={resetForm}
          className="mt-2 w-full max-w-xs rounded-lg bg-client-primary py-3 text-[15px] font-bold text-neutral-950 hover:opacity-90"
        >
          {t("staff.courtPayCheckIn.checkInStartOver")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg pb-[min(300px,calc(8rem+env(safe-area-inset-bottom)))] pt-2">
      <div className="flex flex-col gap-3 px-2">
        <div className="flex overflow-hidden rounded-lg border border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setMode("new");
              stopExistingCamera();
              stopNewCamera();
              setError("");
              setExistingPreview(null);
            }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors",
              mode === "new" ? "bg-client-primary text-neutral-950" : "bg-neutral-900/80 text-neutral-400"
            )}
          >
            {t("staff.courtPayCheckIn.checkInNewPlayer")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("existing");
              setError("");
              setExistingPreview(null);
              stopNewCamera();
              stopExistingCamera();
            }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors",
              mode === "existing" ? "bg-client-primary text-neutral-950" : "bg-neutral-900/80 text-neutral-400"
            )}
          >
            {t("staff.courtPayCheckIn.checkInExistingPlayer")}
          </button>
        </div>

        {mode === "existing" ? (
          <>
            <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
              <p className="text-[15px] font-bold text-white">{t("staff.courtPayCheckIn.checkInFaceCheckIn")}</p>
              <p className="text-xs text-neutral-400">{existingScannerHint}</p>
              {!existingCameraStarted ? (
                <button
                  type="button"
                  onClick={startExistingCamera}
                  className="flex h-11 items-center justify-center rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 hover:opacity-90"
                >
                  {t("staff.courtPayCheckIn.checkInStartCamera")}
                </button>
              ) : (
                <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
                  <div className="relative aspect-[4/3] w-full bg-black">
                    <CameraCapture
                      ref={existingCamRef}
                      active={existingCameraStarted && !!existingStream}
                      externalStream={existingStream}
                      facingMode={existingFacing}
                      onStreamReady={() => setExistingCameraReady(true)}
                      onError={(msg) => setError(msg)}
                      className="absolute inset-0"
                      videoClassName="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => void switchExistingFacing()}
                      disabled={existingCaptureBusy}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                      aria-label={t("staff.courtPayCheckIn.switchCamera")}
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      disabled={!existingCameraReady || existingCaptureBusy}
                      onClick={() => void handleExistingCapture()}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-client-primary font-bold text-neutral-950 disabled:opacity-50"
                    >
                      {existingCaptureBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-4 w-4" />
                          {t("staff.courtPayCheckIn.checkInCapture")}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={stopExistingCamera}
                      disabled={existingCaptureBusy}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                      aria-label={t("staff.courtPayCheckIn.closeCamera")}
                    >
                      <CameraOff className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="text-xs text-neutral-500">{t("staff.courtPayCheckIn.checkInOrPhoneFallback")}</span>
              <div className="h-px flex-1 bg-neutral-800" />
            </div>

            <input
              type="tel"
              className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3.5 text-[15px] text-white placeholder:text-neutral-600"
              placeholder={t("staff.courtPayCheckIn.phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              type="button"
              disabled={loading || !phone.trim()}
              onClick={() => void handleLookupByPhone()}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-client-primary bg-transparent text-sm font-semibold text-client-primary disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {t("staff.courtPayCheckIn.checkInLookupByPhone")}
            </button>

            {existingPreview ? (
              <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                {photoSrc(existingPreview.avatarPhotoPath ?? existingPreview.facePhotoPath) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoSrc(existingPreview.avatarPhotoPath ?? existingPreview.facePhotoPath)!}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
                    <User className="h-6 w-6 text-neutral-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{existingPreview.name}</p>
                  <p className="truncate text-sm text-neutral-400">{existingPreview.phone}</p>
                  <p className="text-[11px] font-bold text-client-primary">CourtPay</p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleExistingPhoneCheckIn()}
                  className="shrink-0 rounded-lg bg-client-primary px-3 py-2 text-sm font-bold text-neutral-950 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("staff.courtPayCheckIn.checkIn")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
              <p className="text-base font-bold text-white">{t("staff.courtPayCheckIn.checkInRegisterNewFace")}</p>
              <p className="text-xs text-neutral-400">{t("staff.courtPayCheckIn.checkInRegisterFaceHint")}</p>
              {!faceBase64 ? (
                !newCameraStarted ? (
                  <button
                    type="button"
                    onClick={() => void startNewCamera()}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 hover:opacity-90"
                  >
                    {t("staff.courtPayCheckIn.checkInStartCamera")}
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
                    <div className="relative mx-auto aspect-square w-full max-h-[min(90vw,360px)] bg-black">
                      <CameraCapture
                        ref={newCamRef}
                        active={newCameraLive}
                        externalStream={newStream}
                        facingMode={newFacing}
                        onStreamReady={() => setNewCameraReady(true)}
                        onError={(msg) => setError(msg)}
                        className="absolute inset-0"
                        videoClassName="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-2 p-2.5">
                      <button
                        type="button"
                        onClick={() => void switchNewFacing()}
                        disabled={newCaptureBusy}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                        aria-label={t("staff.courtPayCheckIn.switchCamera")}
                      >
                        <RefreshCw className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        disabled={!newCameraReady || newCaptureBusy}
                        onClick={() => void handleNewCapture()}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-client-primary font-bold text-neutral-950 disabled:opacity-50"
                      >
                        {newCaptureBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <Camera className="h-4 w-4" />
                            {t("staff.courtPayCheckIn.capture")}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={stopNewCamera}
                        disabled={newCaptureBusy}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                        aria-label={t("staff.courtPayCheckIn.closeCamera")}
                      >
                        <CameraOff className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/jpeg;base64,${faceBase64}`}
                    alt=""
                    className="aspect-square w-full max-h-[min(90vw,360px)] rounded-xl border border-neutral-700 object-cover mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      stopNewCamera();
                      setFaceBase64(null);
                      setCapturedFacePresent(null);
                      setCapturedFacePresenceLoading(false);
                      setRegistrationQualityMessage("");
                    }}
                    className="w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
                  >
                    {t("staff.courtPayCheckIn.retake")}
                  </button>
                </div>
              )}
            </div>

            {faceBase64 ? (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  capturedFacePresenceLoading && "border-neutral-700 bg-neutral-900/40",
                  !capturedFacePresenceLoading &&
                    capturedFacePresent === true &&
                    "border-neutral-600 bg-neutral-900/40",
                  !capturedFacePresenceLoading &&
                    capturedFacePresent === false &&
                    "border-red-500/50 bg-red-500/10"
                )}
              >
                {capturedFacePresenceLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-client-primary" />
                    <span className="text-sm text-neutral-300">
                      {t("staff.courtPayCheckIn.courtPayPreCaptureChecking")}
                    </span>
                  </div>
                ) : capturedFacePresent === true ? (
                  <p className="text-sm leading-snug text-neutral-200">
                    {t("staff.courtPayCheckIn.courtPayPreCaptureReady")}
                  </p>
                ) : capturedFacePresent === false ? (
                  <p className="text-sm font-medium leading-snug text-red-300">
                    {t("staff.courtPayCheckIn.courtPayPreCaptureNoFace")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {registrationQualityMessage ? (
              <div className="space-y-2 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3">
                <p className="text-sm leading-snug text-amber-50">{registrationQualityMessage}</p>
                {registrationQualityFailures >= 3 ? (
                  <p className="text-xs text-neutral-300">{t("staff.courtPayCheckIn.registerPhotoAskStaff")}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleRegistrationPhotoTryAgain()}
                  className="w-full rounded-lg bg-client-primary py-2.5 text-sm font-bold text-neutral-950 hover:opacity-90"
                >
                  {t("staff.courtPayCheckIn.registerPhotoTryAgain")}
                </button>
              </div>
            ) : null}

            <input
              className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3.5 text-[15px] text-white placeholder:text-neutral-600"
              placeholder={t("staff.courtPayCheckIn.checkInPlayerName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="tel"
              className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3.5 text-[15px] text-white placeholder:text-neutral-600"
              placeholder={t("staff.courtPayCheckIn.phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGender("male")}
                className={cn(
                  "h-9 flex-1 rounded-lg border text-sm font-semibold",
                  gender === "male"
                    ? "border-client-primary bg-client-primary-muted-strong text-white"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300"
                )}
              >
                {t("staff.courtPayCheckIn.regMale")}
              </button>
              <button
                type="button"
                onClick={() => setGender("female")}
                className={cn(
                  "h-9 flex-1 rounded-lg border text-sm font-semibold",
                  gender === "female"
                    ? "border-client-primary bg-client-primary-muted-strong text-white"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300"
                )}
              >
                {t("staff.courtPayCheckIn.regFemale")}
              </button>
            </div>
            <div className="flex gap-2">
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSkillLevel(lvl)}
                  className={cn(
                    "h-9 flex-1 rounded-lg border text-xs font-semibold sm:text-sm",
                    skillLevel === lvl
                      ? "border-client-primary bg-client-primary-muted-strong text-white"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300"
                  )}
                >
                  {lvl === "beginner"
                    ? t("staff.courtPayCheckIn.regBeginner")
                    : lvl === "intermediate"
                      ? t("staff.courtPayCheckIn.regIntermediate")
                      : t("staff.courtPayCheckIn.regAdvanced")}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!canSubmitNewPlayer}
              onClick={() => void handleNewRegistration()}
              className="flex h-11 items-center justify-center rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("staff.courtPayCheckIn.checkInRegisterBtn")}
            </button>
          </>
        )}

        {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
