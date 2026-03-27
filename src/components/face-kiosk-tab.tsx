"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Camera, CameraOff, Loader2, User, AlertTriangle, RefreshCw, Play } from "lucide-react";

type KioskState = "idle" | "detecting" | "processing" | "success" | "error" | "no_face" | "multi_face" | "already_checked_in";

interface FaceKioskTabProps {
  venueId: string;
}

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
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const showFlash = (message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage(message);
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
      flashTimerRef.current = null;
    }, 3000);
  };

  const [state, setState] = useState<KioskState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const [resultData, setResultData] = useState<{
    displayName?: string;
    queueNumber?: number;
    alreadyCheckedIn?: boolean;
  }>({});
  const [isKioskActive, setIsKioskActive] = useState(false);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      // Debug logging
      console.log('Kiosk camera check - navigator.mediaDevices:', !!navigator.mediaDevices);
      console.log('Kiosk camera check - getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
      
      // Check if camera is available
      if (!navigator.mediaDevices) {
        throw new Error("Camera API not available. Your browser may not support camera access or it may be disabled.");
      }

      if (!navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera getUserMedia not available. Please try a different browser or enable camera permissions.");
      }

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
            aspectRatio: { ideal: 16/9 },
            frameRate: { ideal: 30 }
          },
          audio: false,
        });
      } catch (mediaError) {
        console.log('Kiosk primary camera request failed, trying fallback:', mediaError);
        // Try with minimal constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setError("");
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Camera access failed";
      
      // Provide more helpful error messages
      if (errorMessage.includes("Permission denied") || errorMessage.includes("NotAllowed")) {
        setError("Camera access denied. Please allow camera access in your browser settings.");
      } else if (errorMessage.includes("NotFound")) {
        setError("No camera found. Please connect a camera and try again.");
      } else if (errorMessage.includes("HTTPS")) {
        setError("Camera access requires HTTPS. Please use a secure connection or localhost.");
      } else {
        setError(`Camera error: ${errorMessage}`);
      }
      
      setState("error");
      return false;
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  }, []);

  // Capture frame from video
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }, []);

  // Process face recognition
  const processFace = useCallback(async (imageBase64: string) => {
    setState("processing");
    setError("");

    // Set processing timeout
    processingTimeoutRef.current = setTimeout(() => {
      setState("error");
      setError("Processing timed out. Please try again.");
      setTimeout(() => setState("idle"), COOLDOWN_MS);
    }, PROCESSING_TIMEOUT_MS);

    try {
      const response = await api.post<{
        success: boolean;
        resultType: string;
        playerId?: string;
        displayName?: string;
        queueNumber?: number;
        alreadyCheckedIn?: boolean;
        error?: string;
      }>("/api/kiosk/process-face", {
        venueId,
        imageBase64,
      });

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

      if (response.success) {
        setResultData({
          displayName: response.displayName,
          queueNumber: response.queueNumber,
          alreadyCheckedIn: response.alreadyCheckedIn,
        });

        if (response.resultType === "matched") {
          setState("success");
        } else if (response.resultType === "new_player") {
          setState("success");
        } else if (response.resultType === "already_checked_in") {
          setState("already_checked_in");
        } else if (response.resultType === "needs_review") {
          setState("error");
          setError("Face needs staff review");
        } else {
          setState("error");
          setError("Unknown result type");
        }
      } else {
        setState("error");
        setError(response.error || "Face recognition failed");
      }
    } catch (err) {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Network error");
    }

    // Return to idle after cooldown
    cooldownRef.current = setTimeout(() => {
      setState("idle");
      setResultData({});
    }, COOLDOWN_MS);
  }, [venueId]);

  // Auto-detect and capture faces
  const startFaceDetection = useCallback(() => {
    if (!isKioskActive) return;
    
    setState("detecting");

    // Simulate face detection - in real implementation, you'd use a face detection library
    // For now, we'll capture after a short delay to simulate detection
    setTimeout(() => {
      const imageBase64 = captureFrame();
      if (imageBase64) {
        processFace(imageBase64);
      } else {
        setState("error");
        setError("Failed to capture image");
        setTimeout(() => setState("idle"), COOLDOWN_MS);
      }
    }, 1500);
  }, [isKioskActive, captureFrame, processFace]);

  // Start/stop kiosk
  const toggleKiosk = useCallback(async () => {
    if (isKioskActive) {
      setIsKioskActive(false);
      stopCamera();
      setState("idle");
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    } else {
      const cameraStarted = await startCamera();
      if (cameraStarted) {
        setIsKioskActive(true);
        setState("idle");
      }
    }
  }, [isKioskActive, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [stopCamera]);

  // Auto-detect loop when kiosk is active and idle
  useEffect(() => {
    if (isKioskActive && state === "idle") {
      const timer = setTimeout(() => {
        startFaceDetection();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isKioskActive, state, startFaceDetection]);

  const getStateMessage = () => {
    switch (state) {
      case "idle":
        return t("staff.kiosk.lookAtCamera");
      case "detecting":
        return t("staff.kiosk.detectingFace");
      case "processing":
        return t("staff.kiosk.checkingIn");
      case "success":
        if (resultData.displayName) {
          return t("staff.kiosk.welcomeBack", { name: resultData.displayName });
        }
        return t("staff.kiosk.welcome");
      case "already_checked_in":
        return t("staff.kiosk.alreadyCheckedIn", { name: resultData.displayName });
      case "error":
        return error || t("staff.kiosk.tryAgain");
      default:
        return "";
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "idle":
        return "text-blue-400";
      case "detecting":
        return "text-yellow-400";
      case "processing":
        return "text-blue-300";
      case "success":
        return "text-green-400";
      case "already_checked_in":
        return "text-amber-400";
      case "error":
        return "text-red-400";
      default:
        return "text-neutral-400";
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <h2 className="text-xl font-bold text-white">{t("staff.kiosk.title")}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleKiosk}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
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
      </div>

      {/* Flash Message */}
      {flashMessage && (
        <div className="bg-blue-600/20 border border-blue-500/50 text-blue-300 px-4 py-2 text-center text-sm">
          {flashMessage}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {!isKioskActive ? (
          <div className="text-center">
            <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-neutral-800 flex items-center justify-center">
              <Camera className="h-16 w-16 text-neutral-600" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {t("staff.kiosk.readyToStart")}
            </h3>
            <p className="text-neutral-400 max-w-md mb-4">
              {t("staff.kiosk.startDescription")}
            </p>
            <div className="bg-neutral-800/50 rounded-lg p-3 max-w-md text-sm text-neutral-300">
              <p className="font-medium mb-1">💡 Camera Setup Tips:</p>
              <ul className="text-left space-y-1 text-xs">
                <li>• Use Chrome or Safari for best camera support</li>
                <li>• Allow camera permissions when prompted</li>
                <li>• Ensure your built-in camera is connected</li>
                <li>• Position your face clearly in the camera view</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {/* Camera View */}
            <div className="relative w-full max-w-2xl aspect-video bg-black rounded-lg overflow-hidden mb-6">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* State Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  {state === "processing" && (
                    <Loader2 className="h-16 w-16 animate-spin mx-auto mb-4 text-blue-300" />
                  )}
                  {state === "success" && (
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-600 flex items-center justify-center">
                      <User className="h-8 w-8 text-white" />
                    </div>
                  )}
                  {state === "error" && (
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-600 flex items-center justify-center">
                      <AlertTriangle className="h-8 w-8 text-white" />
                    </div>
                  )}
                  {(state === "idle" || state === "detecting") && (
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
                  )}
                  
                  <p className={cn("text-3xl font-bold", getStateColor())}>
                    {getStateMessage()}
                  </p>
                  
                  {state === "success" && resultData.queueNumber && (
                    <p className="text-5xl font-bold text-green-400 mt-2">
                      #{resultData.queueNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* Face Detection Guide */}
              {(state === "idle" || state === "detecting") && (
                <div className="absolute top-4 left-4 right-4">
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3">
                    <p className="text-white text-sm text-center">
                      {state === "idle" 
                        ? t("staff.kiosk.positionFace")
                        : t("staff.kiosk.holdStill")
                      }
                    </p>
                  </div>
                </div>
              )}
              
              {/* Face Frame Overlay */}
              {(state === "idle" || state === "detecting") && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-4 border-green-400 rounded-full opacity-50 animate-pulse" />
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div className="w-full max-w-2xl">
              <div className="bg-neutral-900 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      isKioskActive ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className="text-sm text-neutral-300">
                      {isKioskActive ? t("staff.kiosk.kioskActive") : t("staff.kiosk.kioskInactive")}
                    </span>
                  </div>
                  {state === "error" && (
                    <button
                      onClick={() => setState("idle")}
                      className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t("staff.kiosk.retry")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
