"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { CameraCapture, type CameraCaptureHandle } from "@/components/camera-capture";
import { Loader2 } from "lucide-react";
import { PlayerLanguageToggle } from "./player-language-toggle";

type Step = "wristband" | "face_scan";

interface FaceLoginResponse {
  success: boolean;
  playerId?: string;
  playerName?: string;
  queueNumber?: number | null;
  sessionToken?: string;
  resultType?: string;
  error?: string;
}

interface WristbandLoginResponse {
  success: boolean;
  playerId?: string;
  playerName?: string;
  queueNumber?: number | null;
  sessionToken?: string;
  error?: string;
  _debug?: Record<string, unknown>;
}

export function OnboardingFlow() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { setAuth, clearAuth } = useSessionStore();
  const [step, setStep] = useState<Step>("wristband");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [wristbandNumber, setWristbandNumber] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  /** True when user landed on wristband after face scan failed — show "Try face scan again". */
  const [afterFaceFailure, setAfterFaceFailure] = useState(false);
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const debugOn = searchParams.get("debug") === "1";
  const [wristbandDebugText, setWristbandDebugText] = useState("");

  const handleAuth = useCallback(
    (data: { playerId: string; playerName: string; sessionToken?: string }) => {
      clearAuth();
      setAuth({
        token: data.sessionToken || "",
        playerId: data.playerId,
        role: "player",
        playerName: data.playerName,
      });
    },
    [clearAuth, setAuth]
  );

  const attemptFaceCapture = useCallback(async () => {
    if (!cameraRef.current || loading) return;
    setErr("");
    setLoading(true);

    const waitForReady = (attempts = 0): Promise<string | null> => {
      return new Promise((resolve) => {
        const frame = cameraRef.current?.captureFrame();
        if (frame) {
          resolve(frame);
          return;
        }
        if (attempts > 15) {
          resolve(null);
          return;
        }
        setTimeout(() => resolve(waitForReady(attempts + 1)), 400);
      });
    };

    const imageBase64 = await waitForReady();
    if (!imageBase64) {
      setErr(t("faceLogin.cameraNotReady"));
      setLoading(false);
      return;
    }

    try {
      const res = await api.post<FaceLoginResponse>("/api/player/face-login", {
        imageBase64,
        mode: "pwa",
      });

      if (res.success && res.playerId && res.playerName) {
        handleAuth({
          playerId: res.playerId,
          playerName: res.playerName,
          sessionToken: res.sessionToken,
        });
      } else {
        setErr(t("faceLogin.notRecognized"));
        setCameraActive(false);
        setAfterFaceFailure(true);
        setStep("wristband");
      }
    } catch (e) {
      setErr((e as Error).message || t("faceLogin.error"));
      setCameraActive(false);
      setAfterFaceFailure(true);
      setStep("wristband");
    } finally {
      setLoading(false);
    }
  }, [loading, handleAuth, t]);

  useEffect(() => {
    if (step !== "face_scan" || !cameraActive) return;

    setCaptureCountdown(3);
    let count = 3;

    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCaptureCountdown(null);
        attemptFaceCapture();
      } else {
        setCaptureCountdown(count);
      }
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [step, cameraActive, attemptFaceCapture]);

  const handleWristbandLogin = async () => {
    const num = parseInt(wristbandNumber, 10);
    if (!num || isNaN(num)) {
      setErr(t("faceLogin.invalidNumber"));
      return;
    }
    setErr("");
    setAfterFaceFailure(false);
    setLoading(true);
    const venueId = searchParams.get("venueId") || undefined;
    const payload = {
      queueNumber: num,
      ...(venueId ? { venueId } : {}),
      ...(debugOn ? { debug: true } : {}),
    };

    const logDebug = (label: string, data: unknown) => {
      const line = `${new Date().toISOString()} ${label}\n${JSON.stringify(data, null, 2)}`;
      console.log("[CourtFlow wristband]", label, data);
      if (debugOn) setWristbandDebugText((prev) => (prev ? `${prev}\n\n---\n\n` : "") + line);
    };

    logDebug("request", payload);

    try {
      const res = await api.post<WristbandLoginResponse>("/api/player/wristband-login", payload);
      logDebug("response", {
        success: res.success,
        hasSessionToken: !!res.sessionToken,
        sessionTokenLength: res.sessionToken?.length ?? 0,
        playerId: res.playerId,
        error: res.error,
        _debug: res._debug,
      });

      if (res.success && res.playerId && res.playerName) {
        handleAuth({
          playerId: res.playerId,
          playerName: res.playerName,
          sessionToken: res.sessionToken,
        });
      } else {
        setErr(res.error || t("faceLogin.numberNotFound"));
      }
    } catch (e) {
      const msg = (e as Error).message;
      logDebug("throw", { message: msg, name: (e as Error).name });
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraError = useCallback(
    (msg: string) => {
      setErr(msg);
      setCameraActive(false);
      setAfterFaceFailure(true);
      setStep("wristband");
    },
    []
  );

  if (step === "face_scan") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-black p-6">
        <div className="relative mb-6 h-64 w-64 overflow-hidden rounded-full border-4 border-green-500/50">
          <CameraCapture
            ref={cameraRef}
            active={cameraActive}
            onError={handleCameraError}
            className="h-full w-full"
            videoClassName="h-full w-full object-cover scale-125"
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-10 w-10 animate-spin text-green-400" />
            </div>
          )}
          {captureCountdown !== null && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-white drop-shadow-lg">{captureCountdown}</span>
            </div>
          )}
        </div>

        <p className="text-lg font-medium text-white">
          {loading ? t("faceLogin.processing") : t("faceLogin.lookAtCamera")}
        </p>
        <p className="mt-1 text-sm text-neutral-400">{t("faceLogin.usedHereToday")}</p>

        {err && <p className="mt-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{err}</p>}

        <button
          onClick={() => {
            setCameraActive(false);
            setStep("wristband");
            setErr("");
          }}
          className="mt-6 text-sm text-neutral-500 hover:text-neutral-300"
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="pointer-events-none absolute right-5 top-5 z-10">
        <div className="pointer-events-auto">
          <PlayerLanguageToggle />
        </div>
      </div>

      <div className="mb-8 w-full max-w-xs text-center">
        <h1 className="text-4xl font-bold text-green-500">CourtFlow</h1>
        {err && <p className="mt-3 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{err}</p>}
      </div>

      <p className="mb-6 text-center text-lg text-neutral-100">{t("faceLogin.enterWristband")}</p>

      <input
        type="number"
        inputMode="numeric"
        placeholder="#"
        value={wristbandNumber}
        onChange={(e) => setWristbandNumber(e.target.value)}
        className="w-full max-w-xs rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-center text-3xl font-bold text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        autoFocus
      />

      <button
        onClick={handleWristbandLogin}
        disabled={loading || !wristbandNumber}
        className="mt-4 w-full max-w-xs rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
      >
        {loading ? t("faceLogin.verifying") : t("faceLogin.confirm")}
      </button>

      <button
        type="button"
        onClick={() => {
          setErr("");
          setAfterFaceFailure(false);
          setStep("face_scan");
          setCameraActive(true);
        }}
        className="mt-4 text-sm text-neutral-500 hover:text-neutral-300"
      >
        {afterFaceFailure ? t("faceLogin.tryFaceAgain") : t("faceLogin.tryFaceScan")}
      </button>

      <Link href="/" className="mt-2 text-sm text-neutral-600 hover:text-neutral-400">
        {t("common.back")}
      </Link>

      {debugOn && (
        <div className="mt-6 w-full max-w-md rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-left">
          <p className="mb-1 text-xs font-semibold text-amber-400">Debug (?debug=1)</p>
          <p className="mb-2 text-[10px] text-amber-200/80">
            Server logs tag <code className="text-amber-300">[player/wristband-login]</code>. Check the terminal running{" "}
            <code className="text-amber-300">npm run dev</code>.
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-tight text-neutral-300">
            {wristbandDebugText || "Tap Confirm to log request/response here."}
          </pre>
        </div>
      )}
    </div>
  );
}
