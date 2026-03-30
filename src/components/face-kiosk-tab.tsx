"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Camera,
  CameraOff,
  Loader2,
  User,
  AlertTriangle,
  RefreshCw,
  UserPlus,
  Smartphone,
  ArrowLeft,
} from "lucide-react";
import { KioskConfirmationScreen } from "@/components/kiosk-confirmation-screen";
import { CameraCapture, type CameraCaptureHandle } from "@/components/camera-capture";

type KioskState =
  | "idle"
  | "detecting"
  | "processing"
  | "confirmed"
  | "success"
  | "error"
  | "no_face"
  | "multi_face"
  | "already_checked_in"
  | "needs_registration";

interface FaceKioskTabProps {
  venueId: string;
}

const COOLDOWN_MS = 2000;
const PROCESSING_TIMEOUT_MS = 10000;
const CAMERA_REMOUNT_MS = 50;
const FACE_FAIL_THRESHOLD = 3;

type ProcessFaceResponse = {
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
};

type PhoneLookupResponse = {
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
  queuePosition?: number;
  totalSessions?: number;
};

function skillLabelFromKey(level: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    beginner: "staff.checkIn.skillBeginner",
    intermediate: "staff.checkIn.skillIntermediate",
    advanced: "staff.checkIn.skillAdvanced",
    pro: "staff.checkIn.skillPro",
  };
  const key = map[level];
  return key ? t(key) : level;
}

export function FaceKioskTab({ venueId }: FaceKioskTabProps) {
  const { t } = useTranslation();

  const cameraRef = useRef<CameraCaptureHandle>(null);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [state, setState] = useState<KioskState>("idle");
  const [error, setError] = useState<string>("");
  const [resultData, setResultData] = useState<{
    displayName?: string;
    queueNumber?: number;
    queuePosition?: number;
    skillLevel?: string;
    totalSessions?: number;
    isReturning?: boolean;
    alreadyCheckedIn?: boolean;
  }>({});
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [phoneFlow, setPhoneFlow] = useState<null | "enter" | "preview">(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [phoneConfirmLoading, setPhoneConfirmLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<PhoneLookupResponse | null>(null);
  const [phoneFormError, setPhoneFormError] = useState("");

  const handleCameraError = useCallback((msg: string) => {
    setError(msg);
    setState("error");
    setConsecutiveFailures((c) => c + 1);
  }, []);

  const processFace = useCallback(async (imageBase64: string) => {
    setState("processing");
    setError("");

    processingTimeoutRef.current = setTimeout(() => {
      setState("error");
      setError("Processing timed out. Please try again.");
      setConsecutiveFailures((c) => c + 1);
      cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
    }, PROCESSING_TIMEOUT_MS);

    const scheduleCooldownReset = () => {
      cooldownRef.current = setTimeout(() => {
        setState("idle");
        setResultData({});
      }, COOLDOWN_MS);
    };

    const bumpFailure = () => {
      setConsecutiveFailures((c) => c + 1);
    };

    try {
      const response = await api.post<ProcessFaceResponse>("/api/kiosk/process-face", {
        venueId,
        imageBase64,
      });

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

      if (response.success) {
        if (response.resultType === "matched" || response.resultType === "checked_in") {
          setConsecutiveFailures(0);
          setResultData({
            displayName: response.displayName,
            queueNumber: response.queueNumber,
            skillLevel: response.skillLevel,
            totalSessions: response.totalSessions,
            isReturning: response.isReturning ?? true,
            alreadyCheckedIn: false,
          });
          setState("confirmed");
          cameraRef.current?.stopCamera();
          return;
        }

        if (response.resultType === "already_checked_in") {
          setConsecutiveFailures(0);
          setResultData({
            displayName: response.displayName,
            queueNumber: response.queueNumber,
            queuePosition: response.queuePosition,
            skillLevel: response.skillLevel,
            totalSessions: response.totalSessions,
            isReturning: response.isReturning ?? true,
            alreadyCheckedIn: true,
          });
          setState("confirmed");
          cameraRef.current?.stopCamera();
          return;
        }

        setResultData({
          displayName: response.displayName,
          queueNumber: response.queueNumber,
        });

        bumpFailure();
        switch (response.resultType) {
          case "needs_registration":
            setState("needs_registration");
            break;
          case "no_face":
            setState("no_face");
            break;
          case "multi_face":
            setState("multi_face");
            break;
          case "needs_review":
            setState("error");
            setError(response.error ?? t("staff.checkIn.faceNeedsReview"));
            break;
          default:
            setState("error");
            setError(response.error ?? "Unknown result type");
        }
      } else {
        bumpFailure();
        setState("error");
        setError(response.error ?? "Face recognition failed");
      }
    } catch (err) {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      bumpFailure();
      setState("error");
      setError(err instanceof Error ? err.message : "Network error");
    }

    scheduleCooldownReset();
  }, [venueId, t]);

  const openPhoneCheckIn = useCallback(() => {
    setPhoneFlow("enter");
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneFormError("");
    cameraRef.current?.stopCamera();
    setState("idle");
    setError("");
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, []);

  const closePhoneCheckIn = useCallback(() => {
    setPhoneFlow(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneFormError("");
    setState("idle");
  }, []);

  const retryFaceFromGate = useCallback(() => {
    setConsecutiveFailures(0);
    setPhoneFlow(null);
    setPhoneInput("");
    setPhonePreview(null);
    setPhoneFormError("");
    setState("idle");
    setError("");
  }, []);

  const handlePhoneLookup = useCallback(async () => {
    setPhoneFormError("");
    const raw = phoneInput.trim();
    if (!raw) {
      setPhoneFormError(t("staff.kiosk.phoneLookupError"));
      return;
    }
    setPhoneLookupLoading(true);
    try {
      const res = await api.post<PhoneLookupResponse>("/api/kiosk/phone-check-in", {
        venueId,
        phase: "lookup",
        phone: raw,
      });
      setPhonePreview(res);
      setPhoneFlow("preview");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("staff.kiosk.phoneLookupError");
      setPhoneFormError(msg);
    } finally {
      setPhoneLookupLoading(false);
    }
  }, [phoneInput, venueId, t]);

  const handlePhoneConfirm = useCallback(async () => {
    const pid = phonePreview?.player?.id;
    if (!pid) return;
    setPhoneFormError("");
    setPhoneConfirmLoading(true);
    try {
      const response = await api.post<ProcessFaceResponse>("/api/kiosk/phone-check-in", {
        venueId,
        phase: "confirm",
        playerId: pid,
      });

      if ((response.resultType === "matched" || response.resultType === "checked_in") && response.success) {
        setConsecutiveFailures(0);
        setPhoneFlow(null);
        setPhonePreview(null);
        setPhoneInput("");
        setResultData({
          displayName: response.displayName,
          queueNumber: response.queueNumber,
          skillLevel: response.skillLevel,
          totalSessions: response.totalSessions,
          isReturning: response.isReturning ?? true,
          alreadyCheckedIn: false,
        });
        setState("confirmed");
        return;
      }

      if (response.resultType === "already_checked_in" && response.success) {
        setConsecutiveFailures(0);
        setPhoneFlow(null);
        setPhonePreview(null);
        setPhoneInput("");
        setResultData({
          displayName: response.displayName,
          queueNumber: response.queueNumber,
          queuePosition: response.queuePosition,
          skillLevel: response.skillLevel,
          totalSessions: response.totalSessions,
          isReturning: response.isReturning ?? true,
          alreadyCheckedIn: true,
        });
        setState("confirmed");
        return;
      }

      setPhoneFormError(t("staff.kiosk.phoneConfirmError"));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("staff.kiosk.phoneConfirmError");
      setPhoneFormError(msg);
    } finally {
      setPhoneConfirmLoading(false);
    }
  }, [phonePreview, venueId, t]);

  const handleScanNext = useCallback(async () => {
    setResultData({});
    setConsecutiveFailures(0);
    setPhoneFlow(null);
    setPhonePreview(null);
    setPhoneInput("");
    setPhoneFormError("");
    setState("idle");
    await new Promise((r) => setTimeout(r, CAMERA_REMOUNT_MS));
    const ok = await cameraRef.current?.startCamera();
    if (!ok) setIsKioskActive(false);
  }, []);

  const startFaceDetection = useCallback(() => {
    setState("detecting");
    const tryCapture = (attempts = 0) => {
      const imageBase64 = cameraRef.current?.captureFrame();
      if (imageBase64) {
        processFace(imageBase64);
        return;
      }
      if (attempts > 20) {
        setState("error");
        setError("Camera stream not available");
        setConsecutiveFailures((c) => c + 1);
        cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
        return;
      }
      setTimeout(() => tryCapture(attempts + 1), 500);
    };
    setTimeout(() => tryCapture(), 800);
  }, [processFace]);

  const toggleKiosk = useCallback(() => {
    if (isKioskActive) {
      setIsKioskActive(false);
      cameraRef.current?.stopCamera();
      setState("idle");
      setResultData({});
      setConsecutiveFailures(0);
      setPhoneFlow(null);
      setPhonePreview(null);
      setPhoneInput("");
      setPhoneFormError("");
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    } else {
      setIsKioskActive(true);
      setState("idle");
      setConsecutiveFailures(0);
      setPhoneFlow(null);
    }
  }, [isKioskActive]);

  useEffect(() => {
    if (!isKioskActive || state !== "idle" || phoneFlow !== null) return;
    if (consecutiveFailures >= FACE_FAIL_THRESHOLD) return;
    const timer = setTimeout(startFaceDetection, 1000);
    return () => clearTimeout(timer);
  }, [isKioskActive, state, startFaceDetection, consecutiveFailures, phoneFlow]);

  useEffect(() => {
    return () => {
      cameraRef.current?.stopCamera();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, []);

  const getStateMessage = () => {
    switch (state) {
      case "idle":
        return consecutiveFailures >= FACE_FAIL_THRESHOLD
          ? t("staff.kiosk.phoneNotRecognizedIdle")
          : t("staff.kiosk.lookAtCamera");
      case "detecting":
        return t("staff.kiosk.detectingFace");
      case "processing":
        return t("staff.kiosk.checkingIn");
      case "confirmed":
        return "";
      case "success":
        return resultData.displayName
          ? t("staff.kiosk.welcomeBack", { name: resultData.displayName })
          : t("staff.kiosk.welcome");
      case "already_checked_in":
        return t("staff.kiosk.alreadyCheckedIn", { name: resultData.displayName });
      case "needs_registration":
        return t("staff.kiosk.needsRegistration");
      case "no_face":
        return t("staff.kiosk.noFaceDetected") ?? "No face detected — look at the camera";
      case "multi_face":
        return t("staff.kiosk.multipleFaces") ?? "Multiple faces detected — one at a time";
      case "error":
        return error || t("staff.kiosk.tryAgain");
      default:
        return "";
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "idle":
        return consecutiveFailures >= FACE_FAIL_THRESHOLD ? "text-amber-300" : "text-blue-400";
      case "detecting":
        return "text-yellow-400";
      case "processing":
        return "text-blue-300";
      case "confirmed":
        return "text-neutral-400";
      case "success":
        return "text-green-400";
      case "already_checked_in":
        return "text-amber-400";
      case "needs_registration":
        return "text-sky-300";
      case "no_face":
      case "multi_face":
        return "text-yellow-400";
      case "error":
        return "text-red-400";
      default:
        return "text-neutral-400";
    }
  };

  const showOverlay = [
    "processing",
    "success",
    "error",
    "no_face",
    "multi_face",
    "already_checked_in",
    "needs_registration",
  ].includes(state);

  const showPhoneFallback =
    consecutiveFailures >= FACE_FAIL_THRESHOLD &&
    ["error", "no_face", "multi_face", "needs_registration"].includes(state);

  const phoneFallbackIdleGate =
    isKioskActive &&
    phoneFlow === null &&
    state === "idle" &&
    consecutiveFailures >= FACE_FAIL_THRESHOLD &&
    !showOverlay;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <h2 className="text-xl font-bold text-white">{t("staff.kiosk.title")}</h2>
        <button
          type="button"
          onClick={toggleKiosk}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors",
            isKioskActive
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-green-600 text-white hover:bg-green-500"
          )}
        >
          {isKioskActive ? (
            <>
              <CameraOff className="h-4 w-4" />
              {t("staff.kiosk.stopKiosk")}
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              {t("staff.kiosk.startKiosk")}
            </>
          )}
        </button>
      </div>

      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col",
          isKioskActive && state === "confirmed"
            ? "p-2 sm:p-4"
            : "items-center justify-center gap-6 p-4"
        )}
      >
        {!isKioskActive && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-neutral-800">
              <Camera className="h-16 w-16 text-neutral-600" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-white">{t("staff.kiosk.readyToStart")}</h3>
            <p className="mb-4 max-w-md text-neutral-400">{t("staff.kiosk.startDescription")}</p>
            <p className="mb-4 max-w-md text-sm text-neutral-500">{t("staff.kiosk.existingPlayersOnly")}</p>
            <div className="max-w-md rounded-lg bg-neutral-800/50 p-3 text-sm text-neutral-300">
              <p className="mb-1 font-medium">💡 Camera Setup Tips:</p>
              <ul className="space-y-1 text-left text-xs">
                <li>• Use Chrome or Safari for best camera support</li>
                <li>• Allow camera permissions when prompted</li>
                <li>• Position your face clearly in the camera view</li>
              </ul>
            </div>
          </div>
        )}

        {isKioskActive && (
          <>
            {state === "confirmed" ? (
              <div className="flex min-h-0 w-full max-w-2xl flex-1 self-center sm:self-auto">
                <KioskConfirmationScreen
                  displayName={resultData.displayName ?? "Player"}
                  queueNumber={resultData.queueNumber}
                  queuePosition={resultData.queuePosition}
                  skillLevel={resultData.skillLevel}
                  totalSessions={resultData.totalSessions}
                  isReturning={resultData.isReturning}
                  alreadyCheckedIn={resultData.alreadyCheckedIn}
                  onScanNext={handleScanNext}
                />
              </div>
            ) : phoneFlow !== null ? (
              <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                {phoneFlow === "enter" && (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closePhoneCheckIn}
                        className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        aria-label={t("staff.kiosk.phoneBackToCamera")}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      <h3 className="text-lg font-semibold text-white">{t("staff.kiosk.phoneCheckInTitle")}</h3>
                    </div>
                    <p className="text-sm text-neutral-400">{t("staff.kiosk.phoneCheckInHint")}</p>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder={t("staff.kiosk.phonePlaceholder")}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-lg text-white placeholder:text-neutral-600"
                    />
                    {phoneFormError ? (
                      <p className="text-sm text-red-400">{phoneFormError}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={phoneLookupLoading}
                      onClick={() => void handlePhoneLookup()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {phoneLookupLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : null}
                      {t("staff.kiosk.phoneLookUp")}
                    </button>
                  </>
                )}
                {phoneFlow === "preview" && phonePreview?.player && (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneFlow("enter");
                          setPhoneFormError("");
                        }}
                        className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        aria-label={t("staff.kiosk.phoneBackToCamera")}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      <h3 className="text-lg font-semibold text-white">{phonePreview.player.name}</h3>
                    </div>
                    <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                      <p>
                        <span className="text-neutral-500">{t("staff.kiosk.phonePlayerPhone")}: </span>
                        <span className="font-medium text-white">{phonePreview.player.phone}</span>
                      </p>
                      <p>
                        <span className="text-neutral-500">{t("staff.kiosk.confirmLevel")}: </span>
                        {skillLabelFromKey(phonePreview.player.skillLevel, t)}
                      </p>
                      <p>
                        <span className="text-neutral-500">{t("staff.checkIn.gender")}: </span>
                        {phonePreview.player.gender === "male"
                          ? t("staff.checkIn.genderMale")
                          : phonePreview.player.gender === "female"
                            ? t("staff.checkIn.genderFemale")
                            : t("staff.sessionSummary.genderOther")}
                      </p>
                      {phonePreview.totalSessions != null ? (
                        <p>
                          <span className="text-neutral-500">{t("staff.kiosk.confirmSessions")}: </span>
                          {phonePreview.totalSessions}
                        </p>
                      ) : null}
                    </div>
                    {phonePreview.alreadyCheckedIn ? (
                      <p className="text-center text-sm text-amber-400">
                        {t("staff.kiosk.confirmAlreadyCheckedIn")}
                        {phonePreview.queueNumber != null && phonePreview.queueNumber > 0 ? (
                          <span className="mt-1 block font-mono text-lg text-white">
                            #{phonePreview.queueNumber}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {phoneFormError ? (
                      <p className="text-sm text-red-400">{phoneFormError}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={phoneConfirmLoading}
                      onClick={() => void handlePhoneConfirm()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-500 disabled:opacity-50"
                    >
                      {phoneConfirmLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : null}
                      {t("staff.kiosk.phoneConfirmCheckIn")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="relative aspect-video w-full max-w-2xl shrink-0 overflow-hidden rounded-lg bg-black">
                <CameraCapture
                  ref={cameraRef}
                  active={isKioskActive && phoneFlow === null}
                  onError={handleCameraError}
                  className="h-full w-full"
                  videoClassName="h-full w-full object-cover"
                />

                <div className="absolute right-4 top-4">
                  <div
                    className={cn(
                      "h-3 w-3 rounded-full",
                      state === "detecting" ? "animate-pulse bg-yellow-500" : "bg-green-500"
                    )}
                  />
                </div>

                {!showOverlay && (
                  <div className="absolute left-4 right-12 top-4">
                    <div className="rounded-lg bg-black/60 p-3 backdrop-blur-sm">
                      <p className="text-center text-sm text-white">{getStateMessage()}</p>
                    </div>
                  </div>
                )}

                {!showOverlay && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-48 w-48 animate-pulse rounded-full border-4 border-green-400 opacity-50" />
                  </div>
                )}

                {phoneFallbackIdleGate && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-black/80 p-4">
                    <button
                      type="button"
                      onClick={openPhoneCheckIn}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500"
                    >
                      <Smartphone className="h-5 w-5" />
                      {t("staff.kiosk.phoneCheckIn")}
                    </button>
                    <button
                      type="button"
                      onClick={retryFaceFromGate}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-600 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("staff.kiosk.phoneRetryFace")}
                    </button>
                  </div>
                )}

                {showOverlay && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="px-6 text-center">
                      {state === "processing" && (
                        <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-blue-300" />
                      )}
                      {state === "success" && (
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
                          <User className="h-8 w-8 text-white" />
                        </div>
                      )}
                      {state === "already_checked_in" && (
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-600">
                          <span className="text-xl text-white">✓</span>
                        </div>
                      )}
                      {state === "needs_registration" && (
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-700">
                          <UserPlus className="h-8 w-8 text-white" />
                        </div>
                      )}
                      {state === "no_face" && (
                        <CameraOff className="mx-auto mb-4 h-16 w-16 text-yellow-300" />
                      )}
                      {state === "multi_face" && (
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-600">
                          <span className="text-2xl font-bold text-white">2+</span>
                        </div>
                      )}
                      {state === "error" && (
                        <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-300" />
                      )}

                      <p className={cn("text-lg font-medium", getStateColor())}>{getStateMessage()}</p>
                      {state === "needs_registration" && (
                        <p className="mx-auto mt-3 max-w-sm text-sm text-neutral-300">
                          {t("staff.kiosk.needsRegistrationHint")}
                        </p>
                      )}
                      {state === "success" && resultData.queueNumber && (
                        <p className="mt-3 text-6xl font-bold text-green-400">#{resultData.queueNumber}</p>
                      )}
                      {state === "error" && error && (
                        <p className="mt-2 text-sm text-red-300">{error}</p>
                      )}
                      <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                        {state === "error" && (
                          <button
                            type="button"
                            onClick={() => {
                              setState("idle");
                              setError("");
                            }}
                            className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-neutral-700 hover:text-blue-300"
                          >
                            <RefreshCw className="h-4 w-4" />
                            {t("staff.kiosk.retry")}
                          </button>
                        )}
                        {showPhoneFallback && (
                          <button
                            type="button"
                            onClick={openPhoneCheckIn}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                          >
                            <Smartphone className="h-4 w-4" />
                            {t("staff.kiosk.phoneCheckIn")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
