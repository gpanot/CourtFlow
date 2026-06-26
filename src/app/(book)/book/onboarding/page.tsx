"use client";
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../components/usePlayerSession";
import { signOutToIntro } from "@/app/(book)/book/lib/sign-out-to-intro";
import { ScanFace } from "lucide-react";
import {
  FaceCheckInWidget,
  FaceCheckInNotFoundCard,
  type FaceCheckInResult,
} from "@/components/courtpay/FaceCheckInWidget";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;

const COUNTRY_CODES = [
  { code: "+54",  label: "Argentina",          flag: "🇦🇷" },
  { code: "+61",  label: "Australia",          flag: "🇦🇺" },
  { code: "+32",  label: "Belgium",            flag: "🇧🇪" },
  { code: "+880", label: "Bangladesh",         flag: "🇧🇩" },
  { code: "+55",  label: "Brazil",             flag: "🇧🇷" },
  { code: "+855", label: "Cambodia",           flag: "🇰🇭" },
  { code: "+1",   label: "Canada",             flag: "🇨🇦" },
  { code: "+86",  label: "China",              flag: "🇨🇳" },
  { code: "+45",  label: "Denmark",            flag: "🇩🇰" },
  { code: "+358", label: "Finland",            flag: "🇫🇮" },
  { code: "+33",  label: "France",             flag: "🇫🇷" },
  { code: "+49",  label: "Germany",            flag: "🇩🇪" },
  { code: "+852", label: "Hong Kong",          flag: "🇭🇰" },
  { code: "+91",  label: "India",              flag: "🇮🇳" },
  { code: "+62",  label: "Indonesia",          flag: "🇮🇩" },
  { code: "+39",  label: "Italy",              flag: "🇮🇹" },
  { code: "+81",  label: "Japan",              flag: "🇯🇵" },
  { code: "+254", label: "Kenya",              flag: "🇰🇪" },
  { code: "+82",  label: "South Korea",        flag: "🇰🇷" },
  { code: "+965", label: "Kuwait",             flag: "🇰🇼" },
  { code: "+856", label: "Laos",               flag: "🇱🇦" },
  { code: "+60",  label: "Malaysia",           flag: "🇲🇾" },
  { code: "+52",  label: "Mexico",             flag: "🇲🇽" },
  { code: "+95",  label: "Myanmar",            flag: "🇲🇲" },
  { code: "+31",  label: "Netherlands",        flag: "🇳🇱" },
  { code: "+64",  label: "New Zealand",        flag: "🇳🇿" },
  { code: "+234", label: "Nigeria",            flag: "🇳🇬" },
  { code: "+47",  label: "Norway",             flag: "🇳🇴" },
  { code: "+92",  label: "Pakistan",           flag: "🇵🇰" },
  { code: "+63",  label: "Philippines",        flag: "🇵🇭" },
  { code: "+974", label: "Qatar",              flag: "🇶🇦" },
  { code: "+966", label: "Saudi Arabia",       flag: "🇸🇦" },
  { code: "+65",  label: "Singapore",          flag: "🇸🇬" },
  { code: "+27",  label: "South Africa",       flag: "🇿🇦" },
  { code: "+34",  label: "Spain",              flag: "🇪🇸" },
  { code: "+94",  label: "Sri Lanka",          flag: "🇱🇰" },
  { code: "+46",  label: "Sweden",             flag: "🇸🇪" },
  { code: "+41",  label: "Switzerland",        flag: "🇨🇭" },
  { code: "+886", label: "Taiwan",             flag: "🇹🇼" },
  { code: "+66",  label: "Thailand",           flag: "🇹🇭" },
  { code: "+971", label: "UAE",                flag: "🇦🇪" },
  { code: "+44",  label: "United Kingdom",     flag: "🇬🇧" },
  { code: "+1",   label: "United States",      flag: "🇺🇸" },
  { code: "+84",  label: "Vietnam",            flag: "🇻🇳" },
];

function buildE164(countryCode: string, localNum: string): string {
  const digits = localNum.replace(/\D/g, "");
  const core = digits.startsWith("0") ? digits.slice(1) : digits;
  return `${countryCode}${core}`;
}

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
  const [countryCode, setCountryCode] = useState<string>("+84");
  const [gender, setGender] = useState<string>("");
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<"idle" | "checking" | "taken" | "ok">("idle");
  const [takenPlayerId, setTakenPlayerId] = useState<string | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{
    existingPlayerId: string;
    phone: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  // First available venue ID, fetched on mount so the face widget has a venueId even before onboarding completes
  const [faceVenueId, setFaceVenueId] = useState<string | null>(null);

  // Face linking state (inline in "phoneTaken" section)
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [faceResult, setFaceResult] = useState<FaceCheckInResult | null>(null);
  const [faceLinked, setFaceLinked] = useState(false);

  // Auth gate
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/book/login");
    }
  }, [status, router]);

  // Fetch a venue ID for the face widget early (even before venue selection step)
  useEffect(() => {
    fetch("/api/public/venues")
      .then((r) => r.json())
      .then((data: PortalVenue[]) => {
        if (data.length > 0) setFaceVenueId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Pre-fill profile fields if the player already has a real phone (e.g. resuming after interruption)
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
          router.replace("/book");
          return;
        }

        if (hasRealPhone) {
          // Decompose E.164 back to local digits for the input field
          if (profile.phone.startsWith("+84")) {
            setPhone(profile.phone.slice(3));
          } else {
            setPhone(profile.phone); // legacy non-E.164 — show as-is
          }
          setGender(profile.gender || "");
          setSkillLevel(profile.skillLevel || "");

          if (!profile.venue) {
            // Phone saved but no venue yet — skip to venue step
            setVenuesLoading(true);
            fetch("/api/public/venues")
              .then((r) => r.json())
              .then((data: PortalVenue[]) => {
                if (data.length === 0) {
                  saveVenueAndNavigate(null, buildE164(countryCode, profile.phone.startsWith("+84") ? profile.phone.slice(3) : profile.phone), profile.gender || "", profile.skillLevel || "");
                } else if (data.length === 1) {
                  saveVenueAndNavigate(data[0].id, buildE164(countryCode, profile.phone.startsWith("+84") ? profile.phone.slice(3) : profile.phone), profile.gender || "", profile.skillLevel || "");
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
    const digits = value.replace(/\D/g, "");
    if (digits.length < 5) { setPhoneStatus("idle"); return; }
    const e164 = buildE164(countryCode, value);
    setPhoneStatus("checking");
    try {
      const res = await fetch(`/api/public/account/check-phone?phone=${encodeURIComponent(e164)}`);
      const data = await res.json();
      setPhoneStatus(data.exists ? "taken" : "ok");
      setTakenPlayerId(data.existingPlayerId ?? null);
      // Reset face state when phone changes
      setFaceResult(null);
      setFaceLinked(false);
      setFaceModalOpen(false);
    } catch {
      setPhoneStatus("idle");
    }
  }, [countryCode]);

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.replace(/\D/g, "").length >= 5) {
      setPhoneStatus("checking");
      debounceRef.current = setTimeout(() => checkPhone(value), 500);
    } else {
      setPhoneStatus("idle");
    }
  }

  async function handleFaceResult(result: FaceCheckInResult) {
    setFaceResult(result);
    if (result.resultType === "matched" && result.player?.id && takenPlayerId) {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/public/account/relink", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          credentials: "include",
          body: JSON.stringify({
            existingPlayerId: takenPlayerId,
            link: true,
            phone: buildE164(countryCode, phone),
            gender,
            skillLevel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("onboarding.errors.genericFailed"));
        setFaceLinked(true);
        setSaving(false);
        // Give the user a moment to see "Account linked" then proceed
        setTimeout(() => {
          refresh();
          router.push("/book");
        }, 2000);
      } catch (e) {
        setError((e as Error).message);
        setSaving(false);
      }
    }
  }

  const canContinue =
    phone.replace(/\D/g, "").length >= 8 &&
    (phoneStatus !== "taken" || faceLinked) &&
    phoneStatus !== "checking" &&
    !!gender &&
    !!skillLevel &&
    !saving;

  async function handleProfileContinue() {
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      setError(t("onboarding.errors.phoneRequired")); return;
    }
    if (!gender) { setError(t("onboarding.errors.genderRequired")); return; }
    if (!skillLevel) { setError(t("onboarding.errors.skillRequired")); return; }
    if (!canContinue) return;
    setError(null);
    setSaving(true);

    const phoneToSend = buildE164(countryCode, phone);
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
        refresh();
        router.push("/book");
      } else if (data.length === 1) {
        await saveVenueAndNavigate(data[0].id, phoneToSend, gender, skillLevel);
      } else {
        router.push("/book/onboarding/venue");
      }
    } catch {
      refresh();
      router.push("/book");
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
      router.push("/book");
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
          phone: buildE164(countryCode, phone),
          gender,
          skillLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("onboarding.errors.genericFailed"));
      setLinkPrompt(null);
      refresh();
      router.push("/book");
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
      <div className={`flex items-stretch border rounded-xl overflow-hidden mb-1.5 bg-[var(--cm-bg-input)] transition-colors ${
        phoneStatus === "taken"
          ? "border-[var(--cm-red)]"
          : phoneStatus === "ok"
          ? "border-[var(--cm-green)]"
          : "border-[var(--cm-border)] focus-within:border-[var(--cm-accent)]"
      }`}>
        <select
          value={countryCode}
          onChange={(e) => { setCountryCode(e.target.value); setPhoneStatus("idle"); }}
          className="bg-transparent text-sm font-medium text-[var(--cm-text)] pl-3 pr-1 py-3 border-r border-[var(--cm-border)] outline-none shrink-0 cursor-pointer"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.label} value={c.code}>{c.flag} {c.label} ({c.code})</option>
          ))}
        </select>
        <div className="relative flex-1">
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="912 345 678"
            className="w-full px-3 py-3 bg-transparent text-sm outline-none text-[var(--cm-text)] pr-8"
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
      </div>
      {phoneStatus === "taken" && !faceLinked && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-[var(--cm-red)]">{t("onboarding.phoneTaken")}</p>
          {faceVenueId && (
            <button
              type="button"
              onClick={() => { setFaceResult(null); setFaceModalOpen(true); }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[var(--cm-accent)] text-[var(--cm-accent)] text-xs font-medium hover:bg-[var(--cm-accent-bg)] transition-colors"
            >
              <ScanFace className="h-4 w-4" />
              {t("onboarding.verifyWithFace")}
            </button>
          )}
        </div>
      )}
      {phoneStatus === "taken" && faceLinked && (
        <div className="mb-4 p-3 bg-[var(--cm-green)]/10 text-[var(--cm-green)] text-sm rounded-xl font-medium text-center">
          ✓ {t("onboarding.faceLinkedTitle")}
        </div>
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

      {/* Face verify modal — shown when phone is taken and user clicks "Verify with Face" */}
      {faceModalOpen && faceVenueId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)] px-4 pt-4 pb-8"
          onClick={() => { setFaceModalOpen(false); setFaceResult(null); }}
        >
          <div
            className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-2xl p-5 pb-8 border border-[var(--cm-border)] space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--cm-text)]">{t("editProfile.faceVerifyTitle")}</h2>
              <button
                type="button"
                onClick={() => { setFaceModalOpen(false); setFaceResult(null); }}
                className="text-xs text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]"
              >
                {t("editProfile.close")}
              </button>
            </div>

            {faceLinked ? (
              <div className="text-center py-6 space-y-2">
                <div className="text-3xl">✓</div>
                <p className="font-semibold text-[var(--cm-text)]">{t("onboarding.faceLinkedTitle")}</p>
                <p className="text-sm text-[var(--cm-text-sec)]">{t("onboarding.faceLinkedBody")}</p>
              </div>
            ) : faceResult ? (
              faceResult.resultType === "matched" ? (
                <div className="text-center py-4 space-y-2">
                  <div className="text-3xl">✓</div>
                  <p className="font-semibold text-[var(--cm-text)]">{t("onboarding.faceLinkedTitle")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <FaceCheckInNotFoundCard
                    label={t("editProfile.faceVerifyNotFound")}
                    hint={t("onboarding.faceNotRecognized")}
                    onClose={() => setFaceResult(null)}
                  />
                  <p className="text-xs text-[var(--cm-text-sec)] text-center">{t("onboarding.faceNotRecognized")}</p>
                </div>
              )
            ) : (
              <FaceCheckInWidget
                venueId={faceVenueId}
                initialFacing="user"
                onResult={handleFaceResult}
                labels={{
                  title: t("editProfile.faceVerifyTitle"),
                  hint: t("onboarding.faceVerifyHint"),
                  noFace: t("editProfile.faceVerifyNoFace"),
                  notRecognized: t("editProfile.faceVerifyNotFound"),
                }}
              />
            )}

            <button
              type="button"
              onClick={() => { setFaceModalOpen(false); setFaceResult(null); }}
              className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm border border-[var(--cm-border)]"
            >
              {t("editProfile.close")}
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
