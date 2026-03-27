"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Camera, CameraOff, Loader2, User, AlertTriangle, RefreshCw } from "lucide-react";

type KioskState =
  | "idle" | "detecting" | "processing" | "success"
  | "error" | "no_face" | "multi_face" | "already_checked_in";

interface FaceKioskTabProps { venueId: string; }

const COOLDOWN_MS = 2000;
const PROCESSING_TIMEOUT_MS = 10000;

export function FaceKioskTab({ venueId }: FaceKioskTabProps) {
  const { t } = useTranslation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<KioskState>("idle");
  const [error, setError] = useState<string>("");
  const [resultData, setResultData] = useState<{
    displayName?: string;
    queueNumber?: number;
  }>({});
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  /** Last AWS SearchFaces debug payload (dev only — server sends when debug: true) */
  const [faceDebug, setFaceDebug] = useState<Record<string, unknown> | null>(null);

  const showFlash = useCallback((message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage(message);
    flashTimerRef.current = setTimeout(() => setFlashMessage(null), 3000);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available in this browser.");
      }
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (!videoRef.current) {
        mediaStream.getTracks().forEach((t) => t.stop());
        throw new Error("Video element not mounted.");
      }
      videoRef.current.srcObject = mediaStream;
      streamRef.current = mediaStream;
      setError("");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera access failed";
      if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
        setError("Camera access denied. Please allow camera access in your browser settings.");
      } else if (msg.includes("NotFound")) {
        setError("No camera found. Please connect a camera and try again.");
      } else {
        setError(msg);
      }
      setState("error");
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }, []);

  const processFace = useCallback(async (imageBase64: string) => {
    setState("processing");
    setError("");

    processingTimeoutRef.current = setTimeout(() => {
      setState("error");
      setError("Processing timed out. Please try again.");
      cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
    }, PROCESSING_TIMEOUT_MS);

    try {
      const response = await api.post<{
        success: boolean;
        resultType: string;
        displayName?: string;
        queueNumber?: number;
        error?: string;
        faceDebug?: Record<string, unknown>;
      }>("/api/kiosk/process-face", {
        venueId,
        imageBase64,
        ...(process.env.NODE_ENV === "development" ? { debug: true } : {}),
      });

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

      if (process.env.NODE_ENV === "development" && response.faceDebug) {
        setFaceDebug(response.faceDebug);
        console.log("[Kiosk UI] faceDebug:", response.faceDebug);
      } else {
        setFaceDebug(null);
      }

      if (response.success) {
        setResultData({ displayName: response.displayName, queueNumber: response.queueNumber });
        switch (response.resultType) {
          case "matched":
          case "new_player":       setState("success"); break;
          case "already_checked_in": setState("already_checked_in"); break;
          case "no_face":          setState("no_face"); break;
          case "multi_face":       setState("multi_face"); break;
          default:
            setState("error");
            setError(response.error ?? "Unknown result type");
        }
      } else {
        setState("error");
        setError(response.error ?? "Face recognition failed");
      }
    } catch (err) {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setFaceDebug(null);
      setState("error");
      setError(err instanceof Error ? err.message : "Network error");
    }

    cooldownRef.current = setTimeout(() => {
      setState("idle");
      setResultData({});
      setFaceDebug(null);
    }, COOLDOWN_MS);
  }, [venueId]);

  const startFaceDetection = useCallback(() => {
    setState("detecting");
    const tryCapture = (attempts = 0) => {
      const video = videoRef.current;
      if (!video) {
        setState("error");
        setError("Camera not ready");
        cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) {
        if (attempts > 20) {
          setState("error");
          setError("Camera stream not available");
          cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
          return;
        }
        setTimeout(() => tryCapture(attempts + 1), 500);
        return;
      }
      const imageBase64 = captureFrame();
      if (imageBase64) {
        processFace(imageBase64);
      } else {
        setState("error");
        setError("Failed to capture image");
        cooldownRef.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
      }
    };
    setTimeout(() => tryCapture(), 800);
  }, [captureFrame, processFace]);

  const toggleKiosk = useCallback(() => {
    if (isKioskActive) {
      setIsKioskActive(false);
      stopCamera();
      setState("idle");
      setResultData({});
      setFaceDebug(null);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    } else {
      // ✅ Set active first → video element renders → useEffect starts camera
      setIsKioskActive(true);
      setState("idle");
    }
  }, [isKioskActive, stopCamera]);

  // ✅ FIX: start camera AFTER video element is in the DOM
  useEffect(() => {
    if (!isKioskActive) return;
    const timer = setTimeout(async () => {
      const ok = await startCamera();
      if (!ok) setIsKioskActive(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [isKioskActive, startCamera]);

  // Auto-detection loop
  useEffect(() => {
    if (isKioskActive && state === "idle") {
      const timer = setTimeout(startFaceDetection, 1000);
      return () => clearTimeout(timer);
    }
  }, [isKioskActive, state, startFaceDetection]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [stopCamera]);

  const getStateMessage = () => {
    switch (state) {
      case "idle":               return t("staff.kiosk.lookAtCamera");
      case "detecting":          return t("staff.kiosk.detectingFace");
      case "processing":         return t("staff.kiosk.checkingIn");
      case "success":
        return resultData.displayName
          ? t("staff.kiosk.welcomeBack", { name: resultData.displayName })
          : t("staff.kiosk.welcome");
      case "already_checked_in": return t("staff.kiosk.alreadyCheckedIn", { name: resultData.displayName });
      case "no_face":            return t("staff.kiosk.noFaceDetected") ?? "No face detected — look at the camera";
      case "multi_face":         return t("staff.kiosk.multipleFaces") ?? "Multiple faces detected — one at a time";
      case "error":              return error || t("staff.kiosk.tryAgain");
      default:                   return "";
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "idle":               return "text-blue-400";
      case "detecting":          return "text-yellow-400";
      case "processing":         return "text-blue-300";
      case "success":            return "text-green-400";
      case "already_checked_in": return "text-amber-400";
      case "no_face":
      case "multi_face":         return "text-yellow-400";
      case "error":              return "text-red-400";
      default:                   return "text-neutral-400";
    }
  };

  const showOverlay = ["processing","success","error","no_face","multi_face","already_checked_in"]
    .includes(state);

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <h2 className="text-xl font-bold text-white">{t("staff.kiosk.title")}</h2>
        <button
          onClick={toggleKiosk}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            isKioskActive
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-green-600 text-white hover:bg-green-500"
          )}
        >
          {isKioskActive
            ? <><CameraOff className="h-4 w-4" />{t("staff.kiosk.stopKiosk")}</>
            : <><Camera className="h-4 w-4" />{t("staff.kiosk.startKiosk")}</>
          }
        </button>
      </div>

      {flashMessage && (
        <div className="bg-blue-600/20 border border-blue-500/50 text-blue-300 px-4 py-2 text-center text-sm">
          {flashMessage}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">

        {/* Inactive splash */}
        {!isKioskActive && (
          <div className="text-center">
            <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-neutral-800 flex items-center justify-center">
              <Camera className="h-16 w-16 text-neutral-600" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{t("staff.kiosk.readyToStart")}</h3>
            <p className="text-neutral-400 max-w-md mb-4">{t("staff.kiosk.startDescription")}</p>
            <div className="bg-neutral-800/50 rounded-lg p-3 max-w-md text-sm text-neutral-300">
              <p className="font-medium mb-1">💡 Camera Setup Tips:</p>
              <ul className="text-left space-y-1 text-xs">
                <li>• Use Chrome or Safari for best camera support</li>
                <li>• Allow camera permissions when prompted</li>
                <li>• Position your face clearly in the camera view</li>
              </ul>
            </div>
          </div>
        )}

        {/* ✅ Active: ONE camera view, ONE video element, ONE canvas */}
        {isKioskActive && (
          <>
            <div className="relative w-full max-w-2xl aspect-video bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {/* Status dot */}
              <div className="absolute top-4 right-4">
                <div className={cn("w-3 h-3 rounded-full",
                  state === "detecting" ? "bg-yellow-500 animate-pulse" : "bg-green-500"
                )} />
              </div>

              {/* Instruction banner */}
              {!showOverlay && (
                <div className="absolute top-4 left-4 right-12">
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3">
                    <p className="text-white text-sm text-center">
                      {state === "idle" ? t("staff.kiosk.positionFace") : t("staff.kiosk.holdStill")}
                    </p>
                  </div>
                </div>
              )}

              {/* Face circle */}
              {!showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-4 border-green-400 rounded-full opacity-50 animate-pulse" />
                </div>
              )}

              {/* Result overlay */}
              {showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="text-center px-6">
                    {state === "processing" && <Loader2 className="h-16 w-16 animate-spin mx-auto mb-4 text-blue-300" />}
                    {state === "success" && (
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-600 flex items-center justify-center">
                        <User className="h-8 w-8 text-white" />
                      </div>
                    )}
                    {state === "already_checked_in" && (
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-600 flex items-center justify-center">
                        <span className="text-white text-xl">✓</span>
                      </div>
                    )}
                    {state === "no_face" && <CameraOff className="h-16 w-16 mx-auto mb-4 text-yellow-300" />}
                    {state === "multi_face" && (
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-600 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">2+</span>
                      </div>
                    )}
                    {state === "error" && <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-red-300" />}

                    <p className={cn("text-lg font-medium", getStateColor())}>{getStateMessage()}</p>
                    {state === "success" && resultData.queueNumber && (
                      <p className="text-6xl font-bold text-green-400 mt-3">#{resultData.queueNumber}</p>
                    )}
                    {state === "error" && error && <p className="text-red-300 text-sm mt-2">{error}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="w-full max-w-2xl bg-neutral-900 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-neutral-300">{t("staff.kiosk.kioskActive")}</span>
              </div>
              {state === "error" && (
                <button
                  onClick={() => { setState("idle"); setError(""); }}
                  className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                >
                  <RefreshCw className="h-3 w-3" />{t("staff.kiosk.retry")}
                </button>
              )}
            </div>

            {process.env.NODE_ENV === "development" && faceDebug && (
              <div className="w-full max-w-2xl rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-left">
                <p className="text-amber-200 text-xs font-semibold mb-1">
                  Face debug (dev) — AWS SearchFacesByImage summary
                </p>
                <pre className="text-[10px] leading-relaxed text-amber-100/90 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {JSON.stringify(faceDebug, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}