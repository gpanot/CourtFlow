"use client";

import { useState, useRef, useCallback } from "react";
import { Loader2, Camera, X } from "lucide-react";
import { CameraCapture, type CameraCaptureHandle } from "@/components/camera-capture";
import { cn } from "@/lib/cn";

export interface BalanceData {
  found: boolean;
  venueName: string;
  playerName: string;
  phone?: string;
  subscription: {
    packageName: string;
    sessionsTotal: number | null;
    sessionsRemaining: number | null;
    sessionsUsed: number;
    expiresAt: string;
    daysRemaining: number;
    isUnlimited: boolean;
    isExpiringSoon: boolean;
  } | null;
  lastCheckIn: string | null;
  totalSessions: number;
}

interface LandingStateProps {
  venueCode: string;
  venueName: string;
  onIdentified: (data: BalanceData, phone: string) => void;
}

export function LandingState({ venueCode, venueName, onIdentified }: LandingStateProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceError, setFaceError] = useState("");
  const cameraRef = useRef<CameraCaptureHandle>(null);

  const handlePhoneSubmit = useCallback(async () => {
    const trimmed = phone.trim();
    if (trimmed.length < 8) {
      setError("Please enter a valid phone number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ venueCode, phone: trimmed });
      const res = await fetch(`/api/balance/identify?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      if (data.found) {
        onIdentified(data as BalanceData, trimmed);
      } else {
        setError(`Phone number not found. Have you checked in at ${venueName} before?`);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [phone, venueCode, venueName, onIdentified]);

  const handleFaceScan = useCallback(async () => {
    if (faceScanning) return;
    const frame = cameraRef.current?.captureFrame();
    if (!frame) return;

    setFaceScanning(true);
    setFaceError("");
    try {
      const res = await fetch("/api/balance/identify-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueCode, imageBase64: frame }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaceError(data.error || "Something went wrong");
        return;
      }
      if (data.found && data.phone) {
        cameraRef.current?.stopCamera();
        setShowCamera(false);
        onIdentified(data as BalanceData, data.phone);
      } else {
        setFaceError("Face not recognised. Try entering your phone number.");
      }
    } catch {
      setFaceError("Connection error. Please try again.");
    } finally {
      setFaceScanning(false);
    }
  }, [faceScanning, venueCode, onIdentified]);

  const closeCamera = useCallback(() => {
    cameraRef.current?.stopCamera();
    setShowCamera(false);
    setFaceError("");
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#0e0e0e] px-6 py-10">
      <p className="text-sm text-neutral-500">{venueName}</p>
      <h1 className="mt-2 text-2xl font-bold text-white">Check your balance</h1>

      {showCamera ? (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-neutral-700">
            <CameraCapture
              ref={cameraRef}
              active={showCamera}
              className="h-full w-full"
              videoClassName="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {faceScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" />
              </div>
            )}
          </div>

          {faceError && (
            <p className="text-center text-sm text-red-400">{faceError}</p>
          )}

          <button
            onClick={handleFaceScan}
            disabled={faceScanning}
            className="w-full rounded-xl bg-fuchsia-600 py-3.5 text-base font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {faceScanning ? "Scanning..." : "Scan now"}
          </button>

          <button
            onClick={closeCamera}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
          >
            <X className="h-4 w-4" />
            Close camera
          </button>
        </div>
      ) : (
        <>
          {/* Phone input */}
          <div className="mt-8 w-full max-w-sm">
            <label className="mb-2 block text-sm text-neutral-400">
              Enter your phone number
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePhoneSubmit(); }}
              placeholder="0912345678"
              className={cn(
                "w-full rounded-xl border bg-neutral-950 px-4 py-3.5 text-lg text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2",
                error
                  ? "border-red-500/50 focus:ring-red-500/30"
                  : "border-neutral-700 focus:ring-fuchsia-500/30"
              )}
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
            <button
              onClick={handlePhoneSubmit}
              disabled={loading || phone.trim().length < 8}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 py-3.5 text-base font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Check my balance
            </button>
          </div>

          {/* Divider */}
          <div className="my-8 flex w-full max-w-sm items-center gap-3">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs text-neutral-600">or</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>

          {/* Face scan */}
          <div className="w-full max-w-sm text-center">
            <button
              onClick={() => { setShowCamera(true); setFaceError(""); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 text-base font-medium text-white hover:bg-neutral-800"
            >
              <Camera className="h-5 w-5 text-neutral-400" />
              Scan your face instead
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              Faster — no typing needed
            </p>
          </div>
        </>
      )}
    </div>
  );
}
