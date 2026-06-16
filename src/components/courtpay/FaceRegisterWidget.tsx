"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  CameraCapture,
  type CameraCaptureHandle,
  mapCameraError,
} from "@/components/camera-capture";
import { acquireBrowserCameraStream, stopMediaStream } from "@/lib/browser-camera";
import { api } from "@/lib/api-client";
import {
  blurBackgroundKeepFaceSharp,
  type RelativeFaceBoundingBox,
} from "@/lib/courtpay-face-blur";

export interface FaceRegisterWidgetProps {
  /** Called with the processed (blur-applied) base64 image once the user is happy with the shot. */
  onCapture: (faceBase64: string) => void;
  /** Labels / copy — callers provide translated strings. */
  labels?: {
    title?: string;
    hint?: string;
    startCamera?: string;
    capture?: string;
    switchCamera?: string;
    closeCamera?: string;
    retake?: string;
    checking?: string;
    faceReady?: string;
    noFaceDetected?: string;
    useThisPhoto?: string;
  };
}

export function FaceRegisterWidget({ onCapture, labels = {} }: FaceRegisterWidgetProps) {
  const {
    title = "Register Face",
    hint = "Position your face clearly, then capture.",
    startCamera: startCameraLabel = "Start Camera",
    capture: captureLabel = "Capture",
    switchCamera: switchCameraLabel = "Switch Camera",
    closeCamera: closeCameraLabel = "Close Camera",
    retake = "Retake",
    checking = "Checking…",
    faceReady = "Face detected — ready to use.",
    noFaceDetected = "No face detected. Please retake.",
    useThisPhoto = "Use This Photo",
  } = labels;

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  /** null = not checked yet; true/false = result */
  const [facePresent, setFacePresent] = useState<boolean | null>(null);
  const [faceCheckLoading, setFaceCheckLoading] = useState(false);
  const [error, setError] = useState("");
  const camRef = useRef<CameraCaptureHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    if (!cameraStarted || !stream) setCameraReady(false);
  }, [cameraStarted, stream, facing]);

  // Run face presence check every time a new photo is captured.
  useEffect(() => {
    let cancelled = false;
    if (!faceBase64) {
      setFacePresent(null);
      setFaceCheckLoading(false);
      return;
    }
    setFacePresent(null);
    setFaceCheckLoading(true);
    void api
      .post<{ faceDetected?: boolean }>("/api/courtpay/preview-face-presence", {
        imageBase64: faceBase64,
      })
      .then((res) => {
        if (!cancelled) setFacePresent(res.faceDetected === true);
      })
      .catch(() => {
        if (!cancelled) setFacePresent(true); // fallback permissive
      })
      .finally(() => {
        if (!cancelled) setFaceCheckLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [faceBase64]);

  const stopCamera = useCallback(() => {
    setStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    setCameraStarted(false);
    setCameraReady(false);
    setCaptureBusy(false);
  }, []);

  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current);
    };
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setCameraReady(false);
    try {
      const s = await acquireBrowserCameraStream(facing);
      setStream(s);
      setCameraStarted(true);
    } catch (err) {
      setError(mapCameraError(err));
    }
  }, [facing]);

  const switchFacing = useCallback(async () => {
    setCameraReady(false);
    const next = facing === "user" ? "environment" : "user";
    setStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    try {
      const s = await acquireBrowserCameraStream(next);
      setFacing(next);
      setStream(s);
    } catch (err) {
      setError(mapCameraError(err));
      stopCamera();
    }
  }, [facing, stopCamera]);

  const handleCapture = useCallback(async () => {
    if (!camRef.current || !cameraReady || captureBusy) return;
    setCaptureBusy(true);
    setError("");
    try {
      const b64 = camRef.current.captureFrame();
      if (!b64) {
        setError("Could not capture frame. Try again.");
        return;
      }

      // Apply background blur (same pipeline as CheckInCourtPay "new" mode).
      let processed = b64;
      try {
        const preview = await api.post<{
          faceDetected?: boolean;
          boundingBox?: RelativeFaceBoundingBox;
        }>("/api/courtpay/preview-face-presence", {
          imageBase64: b64,
          returnBoundingBox: true,
        });
        if (preview.faceDetected && preview.boundingBox) {
          processed = await blurBackgroundKeepFaceSharp(b64, preview.boundingBox, {
            blurPx: 8,
            facePaddingRatio: 0.2,
          });
        }
      } catch {
        // Fallback to original if blur fails — non-blocking.
      }

      setFaceBase64(processed);
      stopCamera();
    } finally {
      setCaptureBusy(false);
    }
  }, [cameraReady, captureBusy, stopCamera]);

  const handleRetake = useCallback(() => {
    setFaceBase64(null);
    setFacePresent(null);
    setFaceCheckLoading(false);
    setError("");
  }, []);

  const handleUsePhoto = useCallback(() => {
    if (!faceBase64) return;
    onCapture(faceBase64);
  }, [faceBase64, onCapture]);

  const cameraLive = cameraStarted && !!stream;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
        <p className="text-[15px] font-bold text-white">{title}</p>
        <p className="text-xs text-neutral-400">{hint}</p>

        {!faceBase64 ? (
          !cameraStarted ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 hover:opacity-90"
            >
              {startCameraLabel}
            </button>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
              <div className="relative mx-auto aspect-square w-full max-h-[min(90vw,360px)] bg-black">
                <CameraCapture
                  ref={camRef}
                  active={cameraLive}
                  externalStream={stream}
                  facingMode={facing}
                  onStreamReady={() => setCameraReady(true)}
                  onError={(msg) => setError(msg)}
                  className="absolute inset-0"
                  videoClassName="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center gap-2 p-2.5">
                <button
                  type="button"
                  onClick={() => void switchFacing()}
                  disabled={captureBusy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                  aria-label={switchCameraLabel}
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  disabled={!cameraReady || captureBusy}
                  onClick={() => void handleCapture()}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-client-primary font-bold text-neutral-950 disabled:opacity-50"
                >
                  {captureBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      {captureLabel}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  disabled={captureBusy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                  aria-label={closeCameraLabel}
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
              className="mx-auto aspect-square w-full max-h-[min(90vw,360px)] rounded-xl border border-neutral-700 object-cover"
            />
            <button
              type="button"
              onClick={handleRetake}
              className="w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              {retake}
            </button>
          </div>
        )}
      </div>

      {/* Face presence indicator */}
      {faceBase64 ? (
        <div
          className={
            faceCheckLoading
              ? "rounded-lg border border-neutral-700 bg-neutral-900/40 px-3 py-2.5"
              : facePresent === true
                ? "rounded-lg border border-neutral-600 bg-neutral-900/40 px-3 py-2.5"
                : "rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2.5"
          }
        >
          {faceCheckLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-client-primary" />
              <span className="text-sm text-neutral-300">{checking}</span>
            </div>
          ) : facePresent === true ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-sm text-neutral-200">{faceReady}</p>
            </div>
          ) : facePresent === false ? (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm font-medium text-red-300">{noFaceDetected}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* "Use this photo" confirm button */}
      {faceBase64 && !faceCheckLoading && facePresent === true ? (
        <button
          type="button"
          onClick={handleUsePhoto}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 hover:opacity-90"
        >
          <CheckCircle2 className="h-4 w-4" />
          {useThisPhoto}
        </button>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
