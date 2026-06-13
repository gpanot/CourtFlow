"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;

interface PortalVenue {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
}

export default function OnboardingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<"profile" | "venue">("profile");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<"idle" | "checking" | "taken" | "ok">("idle");
  const [linkPrompt, setLinkPrompt] = useState<{
    existingPlayerId: string;
    phone: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [venues, setVenues] = useState<PortalVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated" && session?.onboardingComplete) {
      router.replace("/book");
    }
  }, [status, session, router]);

  // If the player already has a real phone but no venue, skip to venue step
  useEffect(() => {
    if (status !== "authenticated" || initialCheckDone) return;
    setInitialCheckDone(true);
    fetch("/api/public/account")
      .then((r) => r.json())
      .then((profile) => {
        const hasRealPhone = profile.phone && !profile.phone.startsWith("oauth_") && !profile.phone.startsWith("email_");
        if (hasRealPhone && !profile.venue) {
          setPhone(profile.phone);
          setGender(profile.gender || "");
          setSkillLevel(profile.skillLevel || "");
          setVenuesLoading(true);
          fetch("/api/public/venues")
            .then((r) => r.json())
            .then((data: PortalVenue[]) => {
              if (data.length === 0) {
                submitOnboarding(null);
              } else if (data.length === 1) {
                submitOnboarding(data[0].id);
              } else {
                setVenues(data);
                setStep("venue");
                setVenuesLoading(false);
              }
            })
            .catch(() => setVenuesLoading(false));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, initialCheckDone]);

  const checkPhone = useCallback(async (value: string) => {
    const normalized = value.replace(/\s+/g, "");
    if (normalized.length < 5) { setPhoneStatus("idle"); return; }
    setPhoneStatus("checking");
    try {
      const res = await fetch(`/api/public/account/check-phone?phone=${encodeURIComponent(normalized)}`);
      const data = await res.json();
      setPhoneStatus(data.exists ? "taken" : "ok");
    } catch {
      setPhoneStatus("idle");
    }
  }, []);

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.replace(/\s+/g, "").length >= 5) {
      setPhoneStatus("checking");
      debounceRef.current = setTimeout(() => checkPhone(value), 500);
    } else {
      setPhoneStatus("idle");
    }
  }

  const canContinue = phone.length >= 8 && phoneStatus !== "taken" && phoneStatus !== "checking" && gender && skillLevel && !saving;

  async function handleProfileContinue() {
    if (!canContinue) return;
    setError(null);
    setVenuesLoading(true);
    try {
      const res = await fetch("/api/public/venues");
      const data: PortalVenue[] = await res.json();
      if (data.length === 0) {
        await submitOnboarding(null);
      } else if (data.length === 1) {
        await submitOnboarding(data[0].id);
      } else {
        setVenues(data);
        setStep("venue");
        setVenuesLoading(false);
      }
    } catch {
      await submitOnboarding(null);
    }
  }

  async function submitOnboarding(venueId: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, gender, skillLevel, venueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingPlayerId) {
          setLinkPrompt({ existingPlayerId: data.existingPlayerId, phone });
          setSaving(false);
          setVenuesLoading(false);
          setStep("profile");
          return;
        }
        throw new Error(data.error || "Failed to save profile");
      }
      await update({ playerId: data.playerId });
      router.replace("/book");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      setVenuesLoading(false);
    }
  }

  async function handleVenueSelect(venueId: string) {
    setSelectedVenueId(venueId);
    await submitOnboarding(venueId);
  }

  async function handleLink(link: boolean) {
    if (!linkPrompt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingPlayerId: linkPrompt.existingPlayerId,
          link,
          phone,
          gender,
          skillLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await update({ playerId: data.playerId });
      setLinkPrompt(null);
      router.replace("/book");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-dvh text-[var(--cm-text-muted)]">Loading...</div>;
  }

  const chipCls = (active: boolean) =>
    `flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
      active
        ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
        : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
    }`;

  if (step === "venue") {
    return (
      <div className="px-6 pt-12 pb-8">
        <button onClick={() => setStep("profile")} className="text-sm text-[var(--cm-text-sec)] mb-6">
          ← Back
        </button>

        <h1 className="text-xl font-bold mb-1">Choose your venue</h1>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">Select the venue you&apos;ll be playing at</p>

        {error && (
          <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
        )}

        <div className="space-y-3">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => handleVenueSelect(v.id)}
              disabled={saving}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                selectedVenueId === v.id
                  ? "border-[var(--cm-accent)] bg-[var(--cm-accent)]/10"
                  : "border-[var(--cm-border)] bg-[var(--cm-bg-card)] hover:border-[var(--cm-accent)]/50"
              }`}
            >
              {v.logoUrl ? (
                <img src={v.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[var(--cm-accent-bg)] flex items-center justify-center shrink-0">
                  <span className="text-lg">🏟</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--cm-text)] truncate">{v.name}</p>
                {v.location && (
                  <p className="text-xs text-[var(--cm-text-sec)] truncate mt-0.5">📍 {v.location}</p>
                )}
              </div>
              {saving && selectedVenueId === v.id && (
                <svg className="animate-spin h-5 w-5 text-[var(--cm-accent)] shrink-0" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← Back
      </button>

      <h1 className="text-xl font-bold mb-1">Complete your profile</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">Just a few details to get started</p>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <label className="block text-sm font-medium mb-1.5">Phone number</label>
      <div className="relative mb-1.5">
        <input
          type="tel"
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="0901 234 567"
          className={`w-full px-4 py-3 bg-[var(--cm-bg-input)] border rounded-xl text-sm outline-none transition-colors pr-10 text-[var(--cm-text)] ${
            phoneStatus === "taken"
              ? "border-[var(--cm-red)] focus:border-[var(--cm-red)]"
              : phoneStatus === "ok"
              ? "border-[var(--cm-green)] focus:border-[var(--cm-green)]"
              : "border-[var(--cm-border)] focus:border-[var(--cm-accent)]"
          }`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
          {phoneStatus === "checking" && (
            <svg className="animate-spin h-4 w-4 text-[var(--cm-text-muted)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {phoneStatus === "ok" && <span className="text-[var(--cm-green)]">✓</span>}
          {phoneStatus === "taken" && <span className="text-[var(--cm-red)]">✕</span>}
        </div>
      </div>
      {phoneStatus === "taken" && (
        <p className="text-xs text-[var(--cm-red)] mb-4">
          This phone number is already registered. You&apos;ll be prompted to link accounts on submit.
        </p>
      )}
      {phoneStatus !== "taken" && <div className="mb-5" />}

      <label className="block text-sm font-medium mb-2">Gender</label>
      <div className="flex gap-3 mb-5">
        {GENDERS.map((g) => (
          <button key={g} onClick={() => setGender(g)} className={chipCls(gender === g)}>
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-2">Skill level</label>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {SKILL_LEVELS.map((s) => (
          <button key={s} onClick={() => setSkillLevel(s)} className={chipCls(skillLevel === s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <button
        onClick={handleProfileContinue}
        disabled={!canContinue || venuesLoading}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40 transition-opacity"
      >
        {venuesLoading ? "Loading..." : saving ? "Saving..." : "Continue"}
      </button>

      {linkPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)]">
          <div className="w-full max-w-lg bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] rounded-t-2xl p-6 pb-8">
            <h2 className="text-lg font-bold mb-2">Account found</h2>
            <p className="text-sm text-[var(--cm-text-sec)] mb-6">
              A player account with phone <span className="font-medium">{linkPrompt.phone}</span> already
              exists. Would you like to link your account to it?
            </p>
            <button
              onClick={() => handleLink(true)}
              disabled={saving}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
            >
              Yes, link accounts
            </button>
            <button
              onClick={() => handleLink(false)}
              disabled={saving}
              className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] border border-[var(--cm-border)] rounded-xl font-medium text-sm disabled:opacity-40"
            >
              No, create new
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
