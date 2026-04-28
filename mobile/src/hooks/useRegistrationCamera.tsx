import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { CameraView } from "expo-camera";
import { api } from "../lib/api-client";
import { ENV } from "../config/env";

interface RelativeBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseRegistrationCameraParams {
  active: boolean;
  permissionGranted: boolean;
  onPhotoCaptured: (base64: string) => void;
  onDebugMessage?: (message: string | null) => void;
}

interface UseRegistrationCameraResult {
  cameraRef: RefObject<CameraView | null>;
  onCameraReady: () => void;
  countdown: number | null;
  captureBusy: boolean;
  resetCamera: () => void;
}

export function useRegistrationCamera({
  active,
  permissionGranted,
  onPhotoCaptured,
  onDebugMessage,
}: UseRegistrationCameraParams): UseRegistrationCameraResult {
  const cameraRef = useRef<CameraView | null>(null);
  const cameraReadyRef = useRef(false);
  const captureInFlightRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureRetryKey, setCaptureRetryKey] = useState(0);
  const onPhotoCapturedRef = useRef(onPhotoCaptured);
  const onDebugMessageRef = useRef(onDebugMessage);

  useEffect(() => {
    onPhotoCapturedRef.current = onPhotoCaptured;
  }, [onPhotoCaptured]);

  useEffect(() => {
    onDebugMessageRef.current = onDebugMessage;
  }, [onDebugMessage]);

  const setDebug = useCallback((message: string | null) => {
    onDebugMessageRef.current?.(message);
  }, []);

  const resetCamera = useCallback(() => {
    cameraReadyRef.current = false;
    captureInFlightRef.current = false;
    setCountdown(null);
    setCaptureBusy(false);
    setCaptureRetryKey((n) => n + 1);
    setDebug(null);
  }, [setDebug]);

  const onCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
  }, []);

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || !cameraReadyRef.current || captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setCaptureBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.72,
        base64: true,
      });
      if (!photo?.base64) {
        setCaptureRetryKey((n) => n + 1);
        setDebug("capture=fallback reason=no_photo_data");
        return;
      }

      try {
        const preview = await api.post<{
          faceDetected?: boolean;
          boundingBox?: RelativeBoundingBox;
          processedImageBase64?: string;
          blurApplied?: boolean;
          blurRequested?: boolean;
          blurReason?: string;
        }>("/api/courtpay/preview-face-presence", {
          imageBase64: photo.base64,
          returnBoundingBox: true,
          blurBackground: true,
        });

        if (preview.faceDetected) {
          const finalImage =
            preview.blurApplied && preview.processedImageBase64
              ? preview.processedImageBase64
              : photo.base64;
          if (__DEV__) {
            console.log("[CourtPay capture] blur decision", {
              apiBaseUrl: ENV.API_BASE_URL,
              requestedBlur: true,
              blurRequestedByApi: preview.blurRequested === true,
              faceDetected: preview.faceDetected,
              blurApplied: preview.blurApplied === true,
              blurReason: preview.blurReason ?? null,
              hasProcessedImage: typeof preview.processedImageBase64 === "string",
              usedProcessedImage: finalImage !== photo.base64,
              originalLength: photo.base64.length,
              processedLength: preview.processedImageBase64?.length ?? null,
            });
          }
          setDebug(
            `capture=accepted face_detected=yes blur=${preview.blurApplied ? "applied" : "original"}`
          );
          onPhotoCapturedRef.current(finalImage);
        } else {
          setDebug("capture=rejected reason=no_face_detected");
          setCaptureRetryKey((n) => n + 1);
        }
      } catch (err) {
        // Do not block flow on preview errors; keep existing behavior.
        setDebug(
          `capture=fallback reason=preview_api_failed err=${err instanceof Error ? err.message : "unknown"}`
        );
        onPhotoCapturedRef.current(photo.base64);
      }
    } finally {
      captureInFlightRef.current = false;
      setCaptureBusy(false);
    }
  }, [setDebug]);

  useEffect(() => {
    if (!active || !permissionGranted) {
      setCountdown(null);
      return;
    }

    let cancelled = false;
    let waitIv: ReturnType<typeof setInterval> | null = null;
    let countIv: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (waitIv) clearInterval(waitIv);
      if (countIv) clearInterval(countIv);
      waitIv = null;
      countIv = null;
    };

    waitIv = setInterval(() => {
      if (cancelled) return;
      if (!cameraReadyRef.current) return;
      if (waitIv) clearInterval(waitIv);
      waitIv = null;

      let n = 3;
      setCountdown(n);
      countIv = setInterval(() => {
        if (cancelled) return;
        n -= 1;
        if (n <= 0) {
          if (countIv) clearInterval(countIv);
          countIv = null;
          setCountdown(null);
          if (!cancelled) void captureAndProcess();
        } else {
          setCountdown(n);
        }
      }, 1000);
    }, 50);

    return () => {
      cancelled = true;
      clearTimers();
      setCountdown(null);
    };
  }, [active, permissionGranted, captureRetryKey, captureAndProcess]);

  return {
    cameraRef,
    onCameraReady,
    countdown,
    captureBusy,
    resetCamera,
  };
}
