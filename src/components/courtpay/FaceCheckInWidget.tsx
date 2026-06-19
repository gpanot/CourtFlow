"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  User,
  XCircle,
} from "lucide-react";
import {
  CameraCapture,
  type CameraCaptureHandle,
  mapCameraError,
} from "@/components/camera-capture";
import { acquireBrowserCameraStream, stopMediaStream } from "@/lib/browser-camera";
import { api, ApiRequestError } from "@/lib/api-client";

export interface FaceCheckInResult {
  resultType: "matched" | "no_face" | "multi_face" | "needs_registration" | "error";
  player?: { id: string; name: string; phone: string } | null;
  error?: string;
}

export interface FaceCheckInWidgetProps {
  /** CourtPay venue ID — required for the face-checkin API call. */
  venueId: string;
  /** Called when the scan produces a conclusive result. */
  onResult: (result: FaceCheckInResult) => void;
  /** Which camera to start with. Defaults to "environment" (back). Pass "user" for selfie / front camera. */
  initialFacing?: "user" | "environment";
  /** Labels / copy — callers provide translated strings. */
  labels?: {
    title?: string;
    hint?: string;
    startCamera?: string;
    capture?: string;
    switchCamera?: string;
    closeCamera?: string;
    scanning?: string;
    noFace?: string;
    notRecognized?: string;
    somethingWrong?: string;
  };
}

export function FaceCheckInWidget({ venueId, onResult, initialFacing = "environment", labels = {} }: FaceCheckInWidgetProps) {
  const {
    title = "Face Check-In",
    hint = "Start the camera and capture your face to verify identity.",
    startCamera: startCameraLabel = "Start Camera",
    capture: captureLabel = "Capture",
    switchCamera: switchCameraLabel = "Switch Camera",
    closeCamera: closeCameraLabel = "Close Camera",
    scanning = "Scanning…",
    noFace = "No face detected — adjust position and try again.",
    notRecognized = "Face not recognized.",
    somethingWrong = "Something went wrong.",
  } = labels;

  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const camRef = useRef<CameraCaptureHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    if (!cameraStarted || !stream) setCameraReady(false);
  }, [cameraStarted, stream, facing]);

  const stopCamera = useCallback(() => {
    setStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    setCameraStarted(false);
    setCameraReady(false);
    setBusy(false);
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
    const next = facing === "environment" ? "user" : "environment";
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
    if (!camRef.current || !cameraReady || busy || !venueId) return;
    setBusy(true);
    setError("");
    try {
      const imageBase64 = camRef.current.captureFrame();
      if (!imageBase64) {
        setError(noFace);
        return;
      }
      const data = await api.post<{
        resultType?: string;
        error?: string;
        player?: { id: string; name: string; phone: string };
      }>("/api/courtpay/face-checkin", { venueId, imageBase64 });

      const rt = data.resultType ?? "error";
      if (rt === "matched" && data.player) {
        stopCamera();
        onResult({ resultType: "matched", player: data.player });
        return;
      }
      if (rt === "no_face" || rt === "multi_face") {
        setError(noFace);
        onResult({ resultType: rt as "no_face" | "multi_face" });
        return;
      }
      if (rt === "needs_registration") {
        setError(notRecognized);
        onResult({ resultType: "needs_registration" });
        return;
      }
      if (rt === "already_paid") {
        stopCamera();
        onResult({ resultType: "matched", player: null });
        return;
      }
      setError(data.error ?? somethingWrong);
      onResult({ resultType: "error", error: data.error ?? somethingWrong });
    } catch (err) {
      const msg =
        err instanceof ApiRequestError || err instanceof Error ? err.message : somethingWrong;
      setError(msg);
      onResult({ resultType: "error", error: msg });
    } finally {
      setBusy(false);
    }
  }, [camRef, cameraReady, busy, venueId, noFace, notRecognized, somethingWrong, stopCamera, onResult]);

  const cameraLive = cameraStarted && !!stream;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
        <p className="text-[15px] font-bold text-white">{title}</p>
        <p className="text-xs text-neutral-400">{hint}</p>

        {!cameraStarted ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="flex h-11 items-center justify-center rounded-lg bg-client-primary text-[15px] font-bold text-neutral-950 hover:opacity-90"
          >
            {startCameraLabel}
          </button>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
            <div className="relative aspect-[4/3] w-full bg-black">
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
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                aria-label={switchCameraLabel}
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={!cameraReady || busy}
                onClick={() => void handleCapture()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-client-primary font-bold text-neutral-950 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {scanning}
                  </>
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
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-50"
                aria-label={closeCameraLabel}
              >
                <CameraOff className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Small read-only card shown after a successful match. */
export function FaceCheckInResultCard({
  player,
  label = "Identity verified",
  onClose,
}: {
  player: { id: string; name: string; phone: string } | null | undefined;
  label?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
        {player ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <User className="h-5 w-5 text-emerald-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-300">{label}</p>
        {player ? (
          <>
            <p className="truncate text-[13px] text-white">{player.name}</p>
            <p className="truncate text-[11px] text-neutral-400">{player.phone}</p>
          </>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <XCircle className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Small neutral card shown when face is not recognized (needs registration). */
export function FaceCheckInNotFoundCard({
  label = "Face not recognized",
  hint,
  onClose,
}: {
  label?: string;
  hint?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
        <User className="h-5 w-5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-300">{label}</p>
        {hint ? <p className="mt-0.5 text-[12px] text-neutral-400">{hint}</p> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <XCircle className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

