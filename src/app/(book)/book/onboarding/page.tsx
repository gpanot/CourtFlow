"use client";
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../components/usePlayerSession";
import { signOutToIntro } from "@/app/(book)/book/lib/sign-out-to-intro";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;

interface PortalVenue {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
}

function OnboardingContent() {
  const { session, status, authHeader, refresh } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();

  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<"idle" | "checking" | "taken" | "ok">("idle");
  const [linkPrompt, setLinkPrompt] = useState<{
    existingPlayerId: string;
    phone: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Auth gate
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/book/login");
    }
    // No redirect when onboardingComplete — user may arrive here via back-navigation
  }, [status, router]);

  // Pre-fill profile fields if the player already has a real phone (e.g. resuming after interruption)
  // Also handle the legacy case: real phone but no venue — fast-forward to venue step
  useEffect(() => {
    if (status !== "authenticated" || initialCheckDone) return;
    setInitialCheckDone(true);
    fetch("/api/public/account", { headers: authHeader, credentials: "include" })
      .then((r) => r.json())
      .then((profile) => {
        const hasRealPhone =
          profile.phone &&
          !profile.phone.startsWith("oauth_") &&
          !profile.phone.startsWith("email_");
        if (hasRealPhone && profile.venue) {
          // Fully onboarded — skip onboarding entirely
          router.replace("/book/bookings");
          return;
        }

        if (hasRealPhone) {
          setPhone(profile.phone);
          setGender(profile.gender || "");
          setSkillLevel(profile.skillLevel || "");

          if (!profile.venue) {
            // Phone saved but no venue yet — skip to venue step
            setVenuesLoading(true);
            fetch("/api/public/venues")
              .then((r) => r.json())
              .then((data: PortalVenue[]) => {
                if (data.length === 0) {
                  // No venues available — complete without one
                  saveVenueAndNavigate(null, profile.phone, profile.gender || "", profile.skillLevel || "");
                } else if (data.length === 1) {
                  saveVenueAndNavigate(data[0].id, profile.phone, profile.gender || "", profile.skillLevel || "");
                } else {
                  router.replace("/book/onboarding/venue");
                }
                setVenuesLoading(false);
              })
              .catch(() => setVenuesLoading(false));
          }
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

  const canContinue =
    phone.length >= 8 &&
    phoneStatus !== "taken" &&
    phoneStatus !== "checking" &&
    !!gender &&
    !!skillLevel &&
    !saving;

  async function handleProfileContinue() {
    if (!phone || phone.trim().length < 8) {
      setError(t("onboarding.errors.phoneRequired")); return;
    }
    if (!gender) { setError(t("onboarding.errors.genderRequired")); return; }
    if (!skillLevel) { setError(t("onboarding.errors.skillRequired")); return; }
    if (!canContinue) return;
    setError(null);
    setSaving(true);

    // Immediately save phone/gender/skillLevel (no venue yet — account is created now)
    const phoneToSend = phone.trim();
    try {
      const res = await fetch("/api/public/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        credentials: "include",
        body: JSON.stringify({ phone: phoneToSend, gender, skillLevel, venueId: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingPlayerId) {
          setLinkPrompt({ existingPlayerId: data.existingPlayerId, phone: phoneToSend });
          setSaving(false);
          return;
        }
        throw new Error(data.error || t("onboarding.errors.saveFailed"));
      }
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      return;
    }
    setSaving(false);

    // Now load venues and decide where to go
    setVenuesLoading(true);
    try {
      const res = await fetch("/api/public/venues");
      const data: PortalVenue[] = await res.json();
      if (data.length === 0) {
        // No venues — complete without one
        refresh();
        router.push("/book/bookings");
      } else if (data.length === 1) {
        // Single venue — auto-select and navigate
        await saveVenueAndNavigate(data[0].id, phoneToSend, gender, skillLevel);
      } else {
        // Multiple venues — go to dedicated venue selection page (separate route = reliable back button)
        router.push("/book/onboarding/venue");
      }
    } catch {
      refresh();
      router.push("/book/bookings");
    } finally {
      setVenuesLoading(false);
    }
  }

  async function saveVenueAndNavigate(
    venueId: string | null,
    overridePhone: string,
    overrideGender: string,
    overrideSkillLevel: string
  ) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        credentials: "include",
        body: JSON.stringify({
          phone: overridePhone.trim(),
          gender: overrideGender,
          skillLevel: overrideSkillLevel,
          venueId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("onboarding.errors.saveFailed"));
      refresh();
      router.push("/book/bookings");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      setVenuesLoading(false);
    }
  }

  async function handleLink(link: boolean) {
    if (!linkPrompt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        credentials: "include",
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
      setLinkPrompt(null);
      refresh();
      router.push("/book/bookings");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-dvh text-[var(--cm-text-muted)]">
        {t("common.loading")}
      </div>
    );
  }

  const chipCls = (active: boolean) =>
    `flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
      active
        ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
        : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
    }`;

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => void signOutToIntro()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← {t("account.signOut")}
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
        <p className="text-xs text-[var(--cm-red)] mb-4">{t("onboarding.phoneTaken")}</p>
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

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
