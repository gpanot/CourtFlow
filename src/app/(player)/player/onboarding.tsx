"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType } from "@/lib/constants";
import { cn } from "@/lib/cn";
import {
  isBiometricSupported,
  requestBiometricVerification,
  authenticateWithBiometric,
  getBiometricPlayer,
  storeBiometricPlayer,
  clearBiometricData,
} from "@/lib/biometric";

type Step = "phone" | "otp" | "biometric" | "profile";

interface PendingAuth {
  token: string;
  player: { id: string; name: string };
}

export function OnboardingFlow() {
  const { setAuth, clearAuth } = useSessionStore();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [skill, setSkill] = useState<SkillLevelType | "">("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<"idle" | "verifying" | "success" | "failed">("idle");
  const [canQuickLogin, setCanQuickLogin] = useState(false);
  const [quickLoginName, setQuickLoginName] = useState("");
  const [quickLoginStatus, setQuickLoginStatus] = useState<"idle" | "verifying" | "success" | "failed">("idle");
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCanQuickLogin(true);
    const player = getBiometricPlayer();
    if (player) setQuickLoginName(player.playerName);
  }, []);

  const handleQuickLogin = async () => {
    setQuickLoginStatus("verifying");
    setErr("");
    const result = await authenticateWithBiometric();
    if (!result.success) {
      setQuickLoginStatus("failed");
      setErr("Biometric verification failed. Try again or use your phone number.");
      return;
    }

    const playerId = result.userId ?? getBiometricPlayer()?.playerId;
    if (!playerId) {
      setQuickLoginStatus("failed");
      setErr("No account found for this passkey. Please log in with your phone number.");
      return;
    }

    try {
      const res = await api.post<{ token: string; player: { id: string; name: string } }>(
        "/api/auth/biometric-login",
        { playerId }
      );
      setQuickLoginStatus("success");
      storeBiometricPlayer({ playerId: res.player.id, playerName: res.player.name, phone: "" });
      clearAuth();
      setAuth({
        token: res.token,
        playerId: res.player.id,
        role: "player",
        playerName: res.player.name,
      });
    } catch {
      setQuickLoginStatus("failed");
      setErr("Login failed. Please log in with your phone number.");
      clearBiometricData();
    }
  };

  const sendOtp = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; code?: string }>("/api/auth/send-otp", { phone });
      if (res.code) setDevCode(res.code);
      setStep("otp");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await api.post<{
        token?: string;
        player?: { id: string; name: string };
        isNew: boolean;
        verified?: boolean;
      }>("/api/auth/verify-otp", { phone, code: otp });

      if (res.token && res.player) {
        setPendingAuth({ token: res.token, player: res.player });
      }
      setStep("biometric");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finishBiometric = useCallback(() => {
    if (pendingAuth) {
      storeBiometricPlayer({
        playerId: pendingAuth.player.id,
        playerName: pendingAuth.player.name,
        phone,
      });
      clearAuth();
      setAuth({
        token: pendingAuth.token,
        playerId: pendingAuth.player.id,
        role: "player",
        playerName: pendingAuth.player.name,
      });
    } else {
      setStep("profile");
    }
  }, [pendingAuth, phone, setAuth, clearAuth]);

  const handleBiometric = useCallback(async () => {
    setBiometricStatus("verifying");
    setErr("");
    const identifier = pendingAuth?.player.id ?? phone;
    const ok = await requestBiometricVerification(identifier);
    if (ok) {
      setBiometricStatus("success");
      setTimeout(finishBiometric, 600);
    } else {
      setBiometricStatus("failed");
      setErr("Biometric verification failed. You can try again or skip.");
    }
  }, [pendingAuth, phone, finishBiometric]);

  useEffect(() => {
    if (step === "biometric") {
      setBiometricStatus("idle");
      setErr("");
      isBiometricSupported().then((supported) => {
        setBiometricAvailable(supported);
        if (!supported) {
          setTimeout(finishBiometric, 1200);
        }
      });
    }
  }, [step, finishBiometric]);

  const register = async () => {
    if (!name || !gender || !skill) {
      setErr("All fields are required");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const res = await api.post<{ token: string; player: { id: string; name: string } }>("/api/auth/register", {
        phone,
        name,
        gender,
        skillLevel: skill,
      });
      storeBiometricPlayer({
        playerId: res.player.id,
        playerName: res.player.name,
        phone,
      });
      clearAuth();
      setAuth({ token: res.token, playerId: res.player.id, role: "player", playerName: res.player.name });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-green-500">CourtFlow</h1>
        <p className="mt-1 text-neutral-400">Get on the court</p>
      </div>

      {err && <p className="mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{err}</p>}

      {step === "phone" && (
        <div className="space-y-4">
          {canQuickLogin && (
            <div className="space-y-3">
              {quickLoginStatus === "verifying" ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-green-600/20 ring-2 ring-green-500/50">
                    <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-1.26 7.584M12 10.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm-5.684 7.59a47.5 47.5 0 0 1-.192-3.59 5.25 5.25 0 0 1 10.5 0 48.22 48.22 0 0 1-.472 6.932M9.016 18.87a47.074 47.074 0 0 1-.397-4.37 3 3 0 0 1 6 0c0 1.528-.085 3.04-.248 4.525" />
                    </svg>
                  </div>
                  <p className="text-neutral-400">Verifying...</p>
                </div>
              ) : quickLoginStatus === "success" ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600/20 ring-2 ring-green-500">
                    <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="font-medium text-green-400">Welcome back!</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleQuickLogin}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-1.26 7.584M12 10.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm-5.684 7.59a47.5 47.5 0 0 1-.192-3.59 5.25 5.25 0 0 1 10.5 0 48.22 48.22 0 0 1-.472 6.932M9.016 18.87a47.074 47.074 0 0 1-.397-4.37 3 3 0 0 1 6 0c0 1.528-.085 3.04-.248 4.525" />
                    </svg>
                    {quickLoginName ? `Log in as ${quickLoginName}` : "Log in with Biometric"}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-neutral-800" />
                    <span className="text-xs text-neutral-500">or use phone number</span>
                    <div className="h-px flex-1 bg-neutral-800" />
                  </div>
                </>
              )}
            </div>
          )}
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onFocus={() => {
              setTimeout(() => {
                sendBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 350);
            }}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-lg text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
            autoFocus={!canQuickLogin}
          />
          <button
            ref={sendBtnRef}
            onClick={sendOtp}
            disabled={loading || !phone}
            className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-4">
          <p className="text-center text-neutral-400">
            Enter the 6-digit code sent to {phone}
          </p>
          {devCode && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
              <p className="text-xs text-amber-400/70 mb-1">Demo mode — no SMS sent</p>
              <p className="text-amber-300 font-mono text-2xl font-bold tracking-widest">{devCode}</p>
            </div>
          )}
          <input
            type="text"
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-center text-2xl tracking-[0.5em] text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={verifyOtp}
            disabled={loading || otp.length !== 6}
            className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            onClick={() => { setStep("phone"); setOtp(""); }}
            className="w-full py-2 text-sm text-neutral-400 hover:text-white"
          >
            Change number
          </button>
        </div>
      )}

      {step === "biometric" && (
        <div className="space-y-6 text-center">
          {biometricAvailable === null && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-16 w-16 animate-pulse rounded-full bg-neutral-800" />
              <p className="text-neutral-400">Checking device capabilities...</p>
            </div>
          )}

          {biometricAvailable === false && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
                <svg className="h-8 w-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p className="text-neutral-400">Biometric not available on this device</p>
              <p className="text-sm text-neutral-500">Continuing automatically...</p>
            </div>
          )}

          {biometricAvailable && biometricStatus === "idle" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-600/20 ring-2 ring-green-500/30">
                <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-1.26 7.584M12 10.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm-5.684 7.59a47.5 47.5 0 0 1-.192-3.59 5.25 5.25 0 0 1 10.5 0 48.22 48.22 0 0 1-.472 6.932M9.016 18.87a47.074 47.074 0 0 1-.397-4.37 3 3 0 0 1 6 0c0 1.528-.085 3.04-.248 4.525" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Verify your identity</h2>
                <p className="mt-1 text-neutral-400">Use Face ID, Touch ID, or your device PIN</p>
              </div>
              <button
                onClick={handleBiometric}
                className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500"
              >
                Verify with Biometric
              </button>
              <button
                onClick={finishBiometric}
                className="w-full py-2 text-sm text-neutral-500 hover:text-neutral-300"
              >
                Skip for now
              </button>
            </div>
          )}

          {biometricAvailable && biometricStatus === "verifying" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-green-600/20 ring-2 ring-green-500/50">
                <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-1.26 7.584M12 10.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm-5.684 7.59a47.5 47.5 0 0 1-.192-3.59 5.25 5.25 0 0 1 10.5 0 48.22 48.22 0 0 1-.472 6.932M9.016 18.87a47.074 47.074 0 0 1-.397-4.37 3 3 0 0 1 6 0c0 1.528-.085 3.04-.248 4.525" />
                </svg>
              </div>
              <p className="text-neutral-400">Waiting for biometric verification...</p>
            </div>
          )}

          {biometricAvailable && biometricStatus === "success" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-600/20 ring-2 ring-green-500">
                <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="font-medium text-green-400">Identity verified</p>
            </div>
          )}

          {biometricAvailable && biometricStatus === "failed" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600/20 ring-2 ring-red-500/30">
                <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-1.26 7.584M12 10.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm-5.684 7.59a47.5 47.5 0 0 1-.192-3.59 5.25 5.25 0 0 1 10.5 0 48.22 48.22 0 0 1-.472 6.932M9.016 18.87a47.074 47.074 0 0 1-.397-4.37 3 3 0 0 1 6 0c0 1.528-.085 3.04-.248 4.525" />
                </svg>
              </div>
              <button
                onClick={handleBiometric}
                className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500"
              >
                Try Again
              </button>
              <button
                onClick={finishBiometric}
                className="w-full py-2 text-sm text-neutral-500 hover:text-neutral-300"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      )}

      {step === "profile" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Set up your profile</h2>

          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
            autoFocus
          />

          <div>
            <p className="mb-2 text-sm text-neutral-400">Gender</p>
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={cn(
                    "rounded-xl border-2 py-3 font-medium capitalize transition-colors",
                    gender === g
                      ? "border-green-500 bg-green-600/20 text-green-400"
                      : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-neutral-400">Skill level</p>
            <div className="space-y-2">
              {SKILL_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setSkill(level)}
                  className={cn(
                    "w-full rounded-xl border-2 p-3 text-left transition-colors",
                    skill === level
                      ? "border-green-500 bg-green-600/20"
                      : "border-neutral-700 hover:border-neutral-500"
                  )}
                >
                  <span className="font-medium capitalize text-white">{level}</span>
                  <p className="text-sm text-neutral-400">{SKILL_DESCRIPTIONS[level]}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={register}
            disabled={loading || !name || !gender || !skill}
            className="w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "Creating profile..." : "Let's Play"}
          </button>
        </div>
      )}

      <Link href="/" className="mt-6 block text-center text-sm text-black">
        ← Home
      </Link>
    </div>
  );
}
