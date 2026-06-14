"use client";
export const dynamic = "force-dynamic";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getPlayerToken, getPlayerFromToken } from "@/lib/player-token";

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
  const { t } = useTranslation();

  // Resolve auth header for both credentials and OAuth paths
  const authHeader: Record<string, string> = getPlayerToken()
    ? { Authorization: `Bearer ${getPlayerToken()}` }
    : {};
  const isCredentialsAuth = !!getPlayerFromToken();

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

  // Redirect if not authenticated at all
  useEffect(() => {
    console.log("[onboarding] auth check — isCredentialsAuth:", isCredentialsAuth, "status:", status, "onboardingComplete:", session?.onboardingComplete);
    if (isCredentialsAuth) return; // credentials user is always "authenticated"
    if (status === "unauthenticated") { console.log("[onboarding] unauthenticated → /book/login"); router.replace("/book/login"); }
    if (status === "authenticated" && session?.onboardingComplete) {
      console.log("[onboarding] already complete → /book");
      router.replace("/book");
    }
  }, [status, session, router, isCredentialsAuth]);

  // If the player already has a real phone but no venue, skip to venue step
  useEffect(() => {
    const ready = isCredentialsAuth || status === "authenticated";
    console.log("[onboarding] profile-check effect — ready:", ready, "initialCheckDone:", initialCheckDone);
    if (!ready || initialCheckDone) return;
    setInitialCheckDone(true);
    console.log("[onboarding] fetching /api/public/account...");
    fetch("/api/public/account", { headers: authHeader })
      .then((r) => r.json())
      .then((profile) => {
        console.log("[onboarding] profile:", { phone: profile.phone, gender: profile.gender, skillLevel: profile.skillLevel, venue: profile.venue });
        const hasRealPhone = profile.phone && !profile.phone.startsWith("oauth_") && !profile.phone.startsWith("email_");
        console.log("[onboarding] hasRealPhone:", hasRealPhone, "hasVenue:", !!profile.venue);
        if (hasRealPhone && !profile.venue) {
          const profileGender = profile.gender || "";
          const profileSkillLevel = profile.skillLevel || "";
          console.log("[onboarding] has real phone, no venue — pre-filling gender:", profileGender, "skillLevel:", profileSkillLevel);
          setPhone(profile.phone);
          setGender(profileGender);
          setSkillLevel(profileSkillLevel);
          setVenuesLoading(true);
          fetch("/api/public/venues")
            .then((r) => r.json())
            .then((data: PortalVenue[]) => {
              console.log("[onboarding] venues count:", data.length);
              if (data.length === 0) {
                console.log("[onboarding] 0 venues → submitOnboarding(null, ...)");
                submitOnboarding(null, profile.phone, profileGender, profileSkillLevel);
              } else if (data.length === 1) {
                console.log("[onboarding] 1 venue → submitOnboarding auto");
                submitOnboarding(data[0].id, profile.phone, profileGender, profileSkillLevel);
              } else {
                console.log("[onboarding] multiple venues → show picker");
                setVenues(data);
                setStep("venue");
                setVenuesLoading(false);
              }
            })
            .catch((e) => { console.error("[onboarding] venues fetch error", e); setVenuesLoading(false); });
        } else {
          console.log("[onboarding] no auto-submit: hasRealPhone=", hasRealPhone, "venue=", profile.venue);
        }
      })
      .catch((e) => { console.error("[onboarding] /account fetch error", e); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, initialCheckDone, isCredentialsAuth]);

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
    if (!phone || phone.trim().length < 8) {
      setError(t("onboarding.errors.phoneRequired"));
      return;
    }
    if (!gender) { setError(t("onboarding.errors.genderRequired")); return; }
    if (!skillLevel) { setError(t("onboarding.errors.skillRequired")); return; }
    if (!canContinue) {
      console.log("[onboarding] canContinue=false", { phone: phone.length, phoneStatus, gender, skillLevel, saving });
      return;
    }
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

  async function submitOnboarding(venueId: string | null, overridePhone?: string, overrideGender?: string, overrideSkillLevel?: string) {
    const phoneToSend = (overridePhone || phone).trim();
    const genderToSend = overrideGender ?? gender;
    const skillLevelToSend = overrideSkillLevel ?? skillLevel;
    const authHdr = getPlayerToken() ? { Authorization: `Bearer ${getPlayerToken()}` } : undefined;
    setSaving(true);
    setError(null);
    const payload = { phone: phoneToSend, gender: genderToSend, skillLevel: skillLevelToSend, venueId };
    console.log("[onboarding] submitOnboarding — payload:", payload, "authHeader keys:", Object.keys(authHdr ?? {}));
    try {
      const res = await fetch("/api/public/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHdr ?? {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[onboarding] onboarding API response:", res.status, data);
      if (!res.ok) {
        if (data.existingPlayerId) {
          setLinkPrompt({ existingPlayerId: data.existingPlayerId, phone: phoneToSend });
          setSaving(false);
          setVenuesLoading(false);
          setStep("profile");
          return;
        }
        throw new Error(data.error || t("onboarding.errors.saveFailed"));
      }
      if (!isCredentialsAuth) {
        await update({ playerId: data.playerId });
      }
      console.log("[onboarding] success → /book");
      router.replace("/book");
    } catch (e) {
      console.error("[onboarding] submitOnboarding error", e);
      setError((e as Error).message);
      setSaving(false);
      setVenuesLoading(false);
    }
  }

  async function handleVenueSelect(venueId: string) {
    setSelectedVenueId(venueId);
    await submitOnboarding(venueId, phone);
  }

  async function handleLink(link: boolean) {
    if (!linkPrompt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          existingPlayerId: linkPrompt.existingPlayerId,
          link,
          phone,
          gender,
          skillLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("onboarding.errors.genericFailed"));
      if (!isCredentialsAuth) {
        await update({ playerId: data.playerId });
      }
      setLinkPrompt(null);
      router.replace("/book");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-dvh text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
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
          ← {t("common.back")}
        </button>

        <h1 className="text-xl font-bold mb-1">{t("onboarding.chooseVenue")}</h1>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">{t("onboarding.chooseVenueSubtitle")}</p>

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
        ← {t("common.back")}
      </button>

      <h1 className="text-xl font-bold mb-1">{t("onboarding.completeProfile")}</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">{t("onboarding.profileSubtitle")}</p>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <label className="block text-sm font-medium mb-1.5">{t("onboarding.phoneNumber")}</label>
      <div className="relative mb-1.5">
        <input
          type="tel"
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder={t("onboarding.phonePlaceholder")}
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
          {t("onboarding.phoneTaken")}
        </p>
      )}
      {phoneStatus !== "taken" && <div className="mb-5" />}

      <label className="block text-sm font-medium mb-2">{t("onboarding.gender")}</label>
      <div className="flex gap-3 mb-5">
        {GENDERS.map((g) => (
          <button key={g} onClick={() => setGender(g)} className={chipCls(gender === g)}>
            {t(`gender.${g}`)}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-2">{t("onboarding.skillLevel")}</label>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {SKILL_LEVELS.map((s) => (
          <button key={s} onClick={() => setSkillLevel(s)} className={chipCls(skillLevel === s)}>
            {t(`skillLevels.${s}`)}
          </button>
        ))}
      </div>

      <button
        onClick={handleProfileContinue}
        disabled={!canContinue || venuesLoading}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40 transition-opacity"
      >
        {venuesLoading ? t("common.loading") : saving ? t("common.saving") : t("common.continue")}
      </button>

      {linkPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)]">
          <div className="w-full max-w-lg bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] rounded-t-2xl p-6 pb-8">
            <h2 className="text-lg font-bold mb-2">{t("onboarding.accountFound")}</h2>
            <p className="text-sm text-[var(--cm-text-sec)] mb-6">
              {t("onboarding.accountFoundBody", { phone: linkPrompt.phone })}
            </p>
            <button
              onClick={() => handleLink(true)}
              disabled={saving}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
            >
              {t("onboarding.yesLinkAccounts")}
            </button>
            <button
              onClick={() => handleLink(false)}
              disabled={saving}
              className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] border border-[var(--cm-border)] rounded-xl font-medium text-sm disabled:opacity-40"
            >
              {t("onboarding.noCreateNew")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
