"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { acquireBrowserCameraStream, stopMediaStream } from "@/lib/browser-camera";
import { attachStreamToVideo } from "@/lib/attach-video-stream";

export interface CameraCaptureHandle {
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  captureFrame: () => string | null;
}

export interface CameraCaptureProps {
  active: boolean;
  onError?: (msg: string) => void;
  /** Extra classes on the <video> wrapper */
  className?: string;
  /** Classes on the <video> element itself */
  videoClassName?: string;
  /** Camera facing — restarts stream when changed while `active`. Default `user` (selfie). */
  facingMode?: "user" | "environment";
  /** Fires when the video stream has loaded and playback started. */
  onStreamReady?: () => void;
  /**
   * Parent-owned stream (e.g. from getUserMedia inside a click handler).
   * When this prop is passed (including `null`), internal getUserMedia is disabled.
   */
  externalStream?: MediaStream | null;
}

export function mapCameraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Permission denied|NotAllowed|not allowed/i.test(msg)) {
    return "Camera access denied. Please allow camera access in your browser settings.";
  }
  if (/NotFound|DevicesNotFound/i.test(msg)) {
    return "No camera found. Please connect a camera and try again.";
  }
  return msg || "Camera access failed";
}

export const CameraCapture = forwardRef<CameraCaptureHandle, CameraCaptureProps>(
  function CameraCapture(
    { active, onError, className, videoClassName, facingMode = "user", onStreamReady, externalStream },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const useExternal = externalStream !== undefined;

    const stopInternalStream = useCallback(() => {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const detachVideoOnly = useCallback(() => {
      if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const startCamera = useCallback(async (): Promise<boolean> => {
      if (useExternal) {
        const video = videoRef.current;
        if (!video || !externalStream) return false;
        try {
          await attachStreamToVideo(video, externalStream);
          onStreamReady?.();
          return true;
        } catch (err) {
          onError?.(mapCameraError(err));
          return false;
        }
      }
      stopInternalStream();
      try {
        const mediaStream = await acquireBrowserCameraStream(facingMode);
        const video = videoRef.current;
        if (!video) {
          stopMediaStream(mediaStream);
          throw new Error("Video element not mounted.");
        }
        streamRef.current = mediaStream;
        await attachStreamToVideo(video, mediaStream);
        onStreamReady?.();
        return true;
      } catch (err) {
        stopInternalStream();
        onError?.(mapCameraError(err));
        return false;
      }
    }, [onError, facingMode, onStreamReady, stopInternalStream, useExternal, externalStream]);

    const stopCamera = useCallback(() => {
      if (useExternal) {
        detachVideoOnly();
        return;
      }
      stopInternalStream();
    }, [detachVideoOnly, stopInternalStream, useExternal]);

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

    useImperativeHandle(ref, () => ({ startCamera, stopCamera, captureFrame }), [
      startCamera,
      stopCamera,
      captureFrame,
    ]);

    /** Internal mode: acquire camera when active (no artificial delay — still may lose gesture; prefer externalStream from parent for check-in). */
    useEffect(() => {
      if (useExternal) return;
      if (!active) {
        stopInternalStream();
        return;
      }
      let cancelled = false;
      void (async () => {
        const ok = await startCamera();
        if (!cancelled && ok) {
          /* onStreamReady fired from startCamera */
        }
      })();
      return () => {
        cancelled = true;
        stopInternalStream();
      };
    }, [active, facingMode, startCamera, stopInternalStream, useExternal]);

    /** External mode: mirror parent stream into &lt;video&gt; with play(). */
    useEffect(() => {
      if (!useExternal) return;
      const video = videoRef.current;
      if (!active || !externalStream) {
        detachVideoOnly();
        return;
      }
      let cancelled = false;
      void (async () => {
        if (!video) return;
        try {
          await attachStreamToVideo(video, externalStream);
          if (!cancelled) onStreamReady?.();
        } catch (err) {
          if (!cancelled) onError?.(mapCameraError(err));
        }
      })();
      return () => {
        cancelled = true;
        detachVideoOnly();
      };
    }, [active, externalStream, detachVideoOnly, onError, onStreamReady, useExternal]);

    return (
      <div className={className}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={videoClassName ?? "w-full h-full object-cover"}
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }
);
