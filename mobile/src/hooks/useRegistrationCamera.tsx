import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { CameraView } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "../lib/api-client";

const MAX_SIDE_PX = 2000;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

async function compressToUnder1MB(uri: string): Promise<string> {
  console.info("[CourtPay][Registration][Capture] resize_compress_start", {
    uri,
    targetMaxSidePx: MAX_SIDE_PX,
    targetMaxBytes: MAX_BYTES,
    quality: JPEG_QUALITY,
  });
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_SIDE_PX } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  const firstPassBytes = result.base64 ? result.base64.length * 0.75 : 0;
  console.info("[CourtPay][Registration][Capture] resize_compress_first_pass", {
    bytes: Math.round(firstPassBytes),
    withinLimit: firstPassBytes <= MAX_BYTES,
  });
  if (result.base64 && result.base64.length * 0.75 > MAX_BYTES) {
    const harder = await ImageManipulator.manipulateAsync(
      result.uri,
      [],
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    const secondPassBytes = harder.base64 ? harder.base64.length * 0.75 : firstPassBytes;
    console.info("[CourtPay][Registration][Capture] resize_compress_second_pass", {
      bytes: Math.round(secondPassBytes),
      withinLimit: secondPassBytes <= MAX_BYTES,
      quality: 0.65,
    });
    return harder.base64 ?? result.base64;
  }
  return result.base64 ?? "";
}

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
  startBlurInBackground: (originalBase64: string) => void;
  getImageForEnrollment: (originalBase64: string | null) => string | null;
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
  const blurredImageRef = useRef<string | null>(null);
  const blurInProgressRef = useRef(false);

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
    blurredImageRef.current = null;
    blurInProgressRef.current = false;
    setCountdown(null);
    setCaptureBusy(false);
    setCaptureRetryKey((n) => n + 1);
    setDebug(null);
  }, [setDebug]);

  const onCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
  }, []);

  const blurInBackground = useCallback(
    async (originalBase64: string): Promise<void> => {
      if (blurInProgressRef.current) return;
      blurInProgressRef.current = true;
      try {
        console.info("[CourtPay][Registration][Capture] blur_check_and_blur_start", {
          imageBytes: Math.round(originalBase64.length * 0.75),
        });
        const preview = await api.post<{
          faceDetected?: boolean;
          boundingBox?: RelativeBoundingBox;
          processedImageBase64?: string;
          blurApplied?: boolean;
          blurRequested?: boolean;
          blurReason?: string;
        }>("/api/courtpay/preview-face-presence", {
          imageBase64: originalBase64,
          returnBoundingBox: true,
          blurBackground: true,
        });

        if (preview.blurApplied && preview.processedImageBase64) {
          blurredImageRef.current = preview.processedImageBase64;
        }

        console.info("[CourtPay][Registration][Capture] blur_check_and_blur_result", {
          requestedBlur: true,
          blurRequestedByApi: preview.blurRequested === true,
          faceDetected: preview.faceDetected,
          blurApplied: preview.blurApplied === true,
          blurReason: preview.blurReason ?? null,
          hasProcessedImage: typeof preview.processedImageBase64 === "string",
          originalBytes: Math.round(originalBase64.length * 0.75),
          processedBytes: preview.processedImageBase64
            ? Math.round(preview.processedImageBase64.length * 0.75)
            : null,
        });
      } catch (err) {
        console.warn("[CourtPay][Registration][Capture] blur_check_and_blur_failed", err);
      } finally {
        blurInProgressRef.current = false;
      }
    },
    []
  );

  const startBlurInBackground = useCallback((originalBase64: string) => {
    if (!originalBase64?.trim()) return;
    void blurInBackground(originalBase64);
  }, [blurInBackground]);

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || !cameraReadyRef.current || captureInFlightRef.current) return;
    captureInFlightRef.current = true;
    setCaptureBusy(true);
    try {
      console.info("[CourtPay][Registration][Capture] camera_capture_start");
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
      });
      if (!photo?.uri) {
        setCaptureRetryKey((n) => n + 1);
        setDebug("capture=fallback reason=no_photo_data");
        return;
      }
      const compressed = await compressToUnder1MB(photo.uri);
      if (!compressed) {
        setCaptureRetryKey((n) => n + 1);
        setDebug("capture=fallback reason=compression_failed");
        return;
      }
      const approxKB = Math.round((compressed.length * 0.75) / 1024);
      console.info("[CourtPay][Registration][Capture] camera_capture_ready", {
        compressedKb: approxKB,
      });
      // Show preview immediately; blur can be started later from the "Looks good" step.
      blurredImageRef.current = null;
      onPhotoCapturedRef.current(compressed);
      setDebug("capture=accepted face_detected=unknown blur=deferred");
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
    startBlurInBackground,
    getImageForEnrollment: (originalBase64: string | null) =>
      blurredImageRef.current ?? originalBase64,
  };
}
