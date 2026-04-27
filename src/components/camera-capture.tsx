"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";

const CAMERA_REMOUNT_MS = 50;

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
  /** Fires when the video stream has loaded (first frame). */
  onStreamReady?: () => void;
}

export const CameraCapture = forwardRef<CameraCaptureHandle, CameraCaptureProps>(
  function CameraCapture({ active, onError, className, videoClassName, facingMode = "user", onStreamReady }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async (): Promise<boolean> => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available in this browser.");
        }
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode },
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
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Camera access failed";
        if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
          onError?.("Camera access denied. Please allow camera access in your browser settings.");
        } else if (msg.includes("NotFound")) {
          onError?.("No camera found. Please connect a camera and try again.");
        } else {
          onError?.(msg);
        }
        return false;
      }
    }, [onError, facingMode]);

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

    useImperativeHandle(ref, () => ({ startCamera, stopCamera, captureFrame }), [
      startCamera,
      stopCamera,
      captureFrame,
    ]);

    useEffect(() => {
      if (!active) {
        stopCamera();
        return;
      }
      const timer = setTimeout(async () => {
        await startCamera();
      }, CAMERA_REMOUNT_MS);
      return () => clearTimeout(timer);
    }, [active, facingMode, startCamera, stopCamera]);

    useEffect(() => {
      return () => stopCamera();
    }, [stopCamera]);

    return (
      <div className={className}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={videoClassName ?? "w-full h-full object-cover"}
          onLoadedData={() => onStreamReady?.()}
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }
);
