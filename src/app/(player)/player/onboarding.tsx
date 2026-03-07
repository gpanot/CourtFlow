"use client";

import { useState } from "react";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType } from "@/lib/constants";
import { cn } from "@/lib/cn";

type Step = "phone" | "otp" | "profile";

export function OnboardingFlow() {
  const { setAuth } = useSessionStore();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [skill, setSkill] = useState<SkillLevelType | "">("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

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
        setAuth({ token: res.token, playerId: res.player.id, role: "player", playerName: res.player.name });
      } else if (res.isNew) {
        setStep("profile");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-lg text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
            autoFocus
          />
          <button
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

      <Link href="/" className="mt-6 block text-center text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
    </div>
  );
}
