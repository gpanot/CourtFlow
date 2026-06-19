"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { signOutToIntro } from "../../lib/sign-out-to-intro";
import { useTheme, type ThemePalette } from "../../components/ThemeProvider";
import { AvatarPhotoCropper } from "@/components/avatar-photo-cropper";
import { BookScreenTopBar } from "../../components/BookScreenTopBar";
import { useTranslation } from "react-i18next";
import { BOOK_LANGUAGES, persistBookLanguage, type BookLanguageCode } from "@/i18n/book-i18n";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import {
  FaceCheckInWidget,
  FaceCheckInResultCard,
  FaceCheckInNotFoundCard,
  type FaceCheckInResult,
} from "@/components/courtpay/FaceCheckInWidget";
import { FaceRegisterWidget } from "@/components/courtpay/FaceRegisterWidget";
import { ScanFace } from "lucide-react";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;

const COUNTRIES = [
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
];
const THEME_OPTIONS = [
  { value: "light" as const, labelKey: "theme.light" },
  { value: "dark" as const, labelKey: "theme.dark" },
] as const;

const PALETTE_OPTIONS: { value: ThemePalette; labelKey: string; color: string }[] = [
  { value: "green",      labelKey: "editProfile.paletteGreen",      color: "#22c55e" },
  { value: "terracotta", labelKey: "editProfile.paletteTerracotta",  color: "#C4714A" },
  { value: "sage",       labelKey: "editProfile.paletteSage",        color: "#5A7A57" },
];

type ProfileSnapshot = {
  name: string;
  phone: string;
  gender: string;
  skillLevel: string;
  country: string;
};

function segmentClass(selected: boolean) {
  return selected
    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
    : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]";
}

export default function EditProfilePage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { mode, resolved, setMode, palette, setPalette } = useTheme();
  const { t, i18n } = useTranslation();
  const { venueId } = usePlayerVenue();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [venueTimezone, setVenueTimezone] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState<ProfileSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"confirm" | "deleting" | "done">("confirm");

  // Face modals
  const [faceModal, setFaceModal] = useState<"verify" | "register" | null>(null);
  const [faceCheckInResult, setFaceCheckInResult] = useState<FaceCheckInResult | null>(null);
  const [faceRegisterCapture, setFaceRegisterCapture] = useState<string | null>(null);
  const [linkingState, setLinkingState] = useState<"idle" | "linking" | "linked" | "error">("idle");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeLang = (i18n.language?.slice(0, 2) ?? "vi") as BookLanguageCode;
  const activeTheme = mode === "system" ? resolved : mode;

  function handleLanguageChange(code: BookLanguageCode) {
    void persistBookLanguage(code);
  }

  const hasChanges = useMemo(() => {
    if (!initialProfile) return false;
    return (
      name !== initialProfile.name ||
      phone !== initialProfile.phone ||
      gender !== initialProfile.gender ||
      skillLevel !== initialProfile.skillLevel ||
      country !== initialProfile.country
    );
  }, [initialProfile, name, phone, gender, skillLevel, country]);

  useEffect(() => {
    if (linkingState === "linked") {
      const t = setTimeout(() => setFaceModal(null), 1500);
      return () => clearTimeout(t);
    }
  }, [linkingState]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated") {
      portalFetch("/api/public/account")
        .then((r) => r.json())
        .then((p) => {
          const snapshot: ProfileSnapshot = {
            name: p.name ?? "",
            phone: p.phone ?? "",
            gender: p.gender ?? "",
            skillLevel: p.skillLevel ?? "",
            country: p.country ?? "",
          };
          setName(snapshot.name);
          setPhone(snapshot.phone);
          setGender(snapshot.gender);
          setSkillLevel(snapshot.skillLevel);
          setCountry(snapshot.country);
          setInitialProfile(snapshot);
          setEmail(p.email ?? "");
          setVenueTimezone(p.venue?.timezone ?? null);
          setAvatarUrl(p.avatar ?? null);
          if (p.playerIdentityId) setLinkingState("linked");
          setLoaded(true);
        });
    }
  }, [status, router]);

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    e.target.value = "";
  }

  async function handleCropped(blob: Blob) {
    setCropFile(null);
    try {
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");
      const res = await portalFetch("/api/public/account/avatar", { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || t("editProfile.errors.uploadFailed")); }
      const data = await res.json();
      setAvatarUrl(data.avatarPhotoPath);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    setDeleteStep("deleting");
    try {
      const res = await portalFetch("/api/public/account", { method: "DELETE" });
      if (!res.ok) throw new Error(t("editProfile.errors.deletionFailed"));
      setDeleteStep("done");
      setTimeout(() => signOutToIntro(), 1500);
    } catch {
      setDeleteStep("confirm");
      setError(t("editProfile.errors.deleteRetry"));
      setShowDeleteConfirm(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await portalFetch("/api/public/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, gender, skillLevel, country }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || t("editProfile.errors.saveFailed"));
      }
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function handleLinkCourtPay() {
    if (!faceCheckInResult?.player?.id) return;
    setLinkingState("linking");
    setLinkError(null);
    try {
      const res = await portalFetch("/api/public/account/link-courtpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkInPlayerId: faceCheckInResult.player.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Link failed");
      }
      setLinkingState("linked");
    } catch (e) {
      setLinkError((e as Error).message);
      setLinkingState("error");
    }
  }

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  return (
    <div className="px-6 pt-4 pb-8">
      <BookScreenTopBar
        title={t("editProfile.title")}
        onBack={() => router.back()}
        action={
          hasChanges
            ? {
                label: t("common.saveChanges"),
                onClick: handleSave,
                disabled: saving,
                loading: saving,
              }
            : undefined
        }
      />

      {/* Avatar */}
      <div className="flex flex-col items-center mb-5">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--cm-border)] hover:border-[var(--cm-accent)] transition-colors"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-xl">🏓</div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </button>
        <p className="text-[10px] text-[var(--cm-text-muted)] mt-1">{t("editProfile.tapChangePhoto")}</p>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">{t("common.name")}</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm mb-4 outline-none focus:border-[var(--cm-accent)] text-[var(--cm-text)]"
      />

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">{t("editProfile.email")}</label>
      <input
        value={email}
        disabled
        className="w-full px-4 py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm mb-4 text-[var(--cm-text-muted)]"
      />

      {venueTimezone && (
        <>
          <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">{t("editProfile.venueTimezone")}</label>
          <input
            value={venueTimezone}
            disabled
            className="w-full px-4 py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm mb-4 text-[var(--cm-text-muted)]"
          />
        </>
      )}

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">{t("editProfile.phone")}</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm mb-4 outline-none focus:border-[var(--cm-accent)] text-[var(--cm-text)]"
      />

      <div className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] p-3 mb-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-1.5">{t("editProfile.gender")}</p>
          <div className="flex gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${segmentClass(gender === g)}`}
              >
                {t(`gender.${g}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-1.5">{t("editProfile.skillLevel")}</p>
          <div className="grid grid-cols-2 gap-2">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSkillLevel(s)}
                className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${segmentClass(skillLevel === s)}`}
              >
                {t(`skillLevels.${s}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-1.5">{t("editProfile.country")}</p>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg text-xs border border-[var(--cm-border)] bg-[var(--cm-bg-input)] text-[var(--cm-text)] focus:border-[var(--cm-accent)] outline-none"
          >
            <option value="">{t("editProfile.countryNone")}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-[var(--cm-text-muted)] mt-1">
            {t("editProfile.countryHint")}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-1.5">{t("language.label")}</p>
          <div className="grid grid-cols-3 gap-2">
            {BOOK_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${segmentClass(activeLang === lang.code)}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-1.5">{t("theme.label")}</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${segmentClass(activeTheme === opt.value)}`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--cm-text-sec)] mb-2">{t("editProfile.colorPalette")}</p>
          <div className="flex gap-2">
            {PALETTE_OPTIONS.map((opt) => {
              const active = palette === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPalette(opt.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? "border-[var(--cm-accent)] bg-[var(--cm-accent-bg)] text-[var(--cm-text)]"
                      : "border-[var(--cm-border)] bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)]"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0 ring-1 ring-black/10"
                    style={{ backgroundColor: opt.color }}
                  />
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Face Check-in section */}
      {venueId ? (
        <div className="rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] p-3 mb-4 space-y-2">
          <p className="text-xs font-medium text-[var(--cm-text-sec)]">{t("editProfile.faceSection")}</p>
          {linkingState === "linked" ? (
            <p className="text-sm text-[var(--cm-accent)] font-medium">Your CourtPay account is linked.</p>
          ) : (
            <button
              type="button"
              onClick={() => { setFaceCheckInResult(null); setLinkingState("idle"); setLinkError(null); setFaceModal("verify"); }}
              className="flex w-full items-center justify-center gap-2 py-2 rounded-lg border border-[var(--cm-border)] bg-[var(--cm-bg-input)] text-xs font-medium text-[var(--cm-text)] hover:border-[var(--cm-accent)] transition-colors"
            >
              <ScanFace className="h-4 w-4" />
              {t("editProfile.verifyFace")}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-8 pt-6 border-t border-[var(--cm-border)]">
        <button
          onClick={() => { setShowDeleteConfirm(true); setDeleteStep("confirm"); }}
          className="w-full py-3 bg-transparent border border-[var(--cm-red)]/30 text-[var(--cm-red)] rounded-xl font-medium text-sm hover:bg-[var(--cm-red)]/10 transition-colors"
        >
          {t("editProfile.deleteAccount")}
        </button>
      </div>

      {cropFile && (
        <AvatarPhotoCropper
          file={cropFile}
          onCropped={handleCropped}
          onCancel={() => setCropFile(null)}
          outputSize={500}
          maxFileBytes={500 * 1024}
        />
      )}

      {/* Face Verify Modal */}
      {faceModal === "verify" && venueId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)] px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]"
          onClick={() => { setFaceModal(null); setLinkingState("idle"); setLinkError(null); }}
        >
          <div
            className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-2xl p-5 pb-10 border border-[var(--cm-border)] space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--cm-text)]">{t("editProfile.faceVerifyTitle")}</h2>
              <button
                type="button"
                onClick={() => { setFaceModal(null); setLinkingState("idle"); setLinkError(null); }}
                className="text-xs text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]"
              >
                {t("editProfile.close")}
              </button>
            </div>

            {faceCheckInResult ? (
              faceCheckInResult.resultType === "matched" ? (
                <div className="space-y-3">
                  {linkingState === "linked" ? (
                    <div className="text-center py-4 space-y-2">
                      <div className="text-3xl">✓</div>
                      <p className="font-semibold text-[var(--cm-text)]">Accounts linked</p>
                      <p className="text-sm text-[var(--cm-text-sec)]">Your CourtPay check-in history and subscriptions are now connected to your CourtPass profile.</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-sm font-semibold text-[var(--cm-accent)] shrink-0">
                          {faceCheckInResult.player?.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--cm-text)]">{faceCheckInResult.player?.name}</p>
                          <p className="text-xs text-[var(--cm-text-sec)]">{faceCheckInResult.player?.phone}</p>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--cm-text-sec)]">CourtPay profile found. Link it to your CourtPass account to see your check-in history and subscriptions in one place.</p>
                      {linkError && <p className="text-xs text-[var(--cm-red)]">{linkError}</p>}
                      <button
                        type="button"
                        onClick={handleLinkCourtPay}
                        disabled={linkingState === "linking"}
                        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-50"
                      >
                        {linkingState === "linking" ? "Linking..." : "Link accounts"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFaceCheckInResult(null); setLinkingState("idle"); setLinkError(null); }}
                        className="w-full py-2 text-xs text-[var(--cm-text-muted)]"
                      >
                        Not me, try again
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <FaceCheckInNotFoundCard
                  label={t("editProfile.faceVerifyNotFound")}
                  hint={
                    faceCheckInResult.resultType === "no_face" || faceCheckInResult.resultType === "multi_face"
                      ? t("editProfile.faceVerifyNoFace")
                      : t("editProfile.faceVerifyNotFoundHint")
                  }
                  onClose={() => setFaceCheckInResult(null)}
                />
              )
            ) : (
              <FaceCheckInWidget
                venueId={venueId}
                initialFacing="user"
                onResult={(result) => setFaceCheckInResult(result)}
                labels={{
                  title: t("editProfile.faceVerifyTitle"),
                  hint: t("editProfile.faceVerifyHint"),
                  noFace: t("editProfile.faceVerifyNoFace"),
                  notRecognized: t("editProfile.faceVerifyNotFound"),
                }}
              />
            )}

            <button
              type="button"
              onClick={() => { setFaceModal(null); setLinkingState("idle"); setLinkError(null); }}
              className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm border border-[var(--cm-border)]"
            >
              {t("editProfile.close")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Face Register Modal */}
      {faceModal === "register" ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)] p-4"
          onClick={() => setFaceModal(null)}
        >
          <div
            className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-2xl p-5 pb-8 border border-[var(--cm-border)] space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--cm-text)]">{t("editProfile.faceRegisterTitle")}</h2>
              <button
                type="button"
                onClick={() => setFaceModal(null)}
                className="text-xs text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]"
              >
                {t("editProfile.close")}
              </button>
            </div>

            {faceRegisterCapture ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-emerald-400">{t("editProfile.faceRegisterCaptured")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${faceRegisterCapture}`}
                  alt=""
                  className="mx-auto aspect-square w-full max-h-64 rounded-xl border border-neutral-700 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFaceRegisterCapture(null)}
                  className="w-full py-2.5 rounded-xl border border-[var(--cm-border)] text-sm text-[var(--cm-text-sec)]"
                >
                  {t("editProfile.faceRegisterRetake")}
                </button>
              </div>
            ) : (
              <FaceRegisterWidget
                onCapture={(b64) => setFaceRegisterCapture(b64)}
                labels={{
                  title: t("editProfile.faceRegisterTitle"),
                  hint: t("editProfile.faceRegisterHint"),
                  retake: t("editProfile.faceRegisterRetake"),
                  checking: t("editProfile.faceRegisterChecking"),
                  faceReady: t("editProfile.faceRegisterReady"),
                  noFaceDetected: t("editProfile.faceRegisterNoFace"),
                  useThisPhoto: t("editProfile.faceRegisterUsePhoto"),
                }}
              />
            )}

            <button
              type="button"
              onClick={() => setFaceModal(null)}
              className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm border border-[var(--cm-border)]"
            >
              {t("editProfile.close")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)] p-4">
          <div className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-2xl p-6 pb-8 border border-[var(--cm-border)]">
            {deleteStep === "done" ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✓</div>
                <p className="font-semibold text-[var(--cm-text)]">{t("editProfile.deletedTitle")}</p>
                <p className="text-sm text-[var(--cm-text-sec)] mt-1">{t("editProfile.signingOut")}</p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-2 text-[var(--cm-red)]">{t("editProfile.deleteTitle")}</h2>
                <p className="text-sm text-[var(--cm-text-sec)] mb-1">
                  {t("editProfile.deleteBody")}
                </p>
                <p className="text-sm font-medium text-[var(--cm-text)] mb-6">
                  {t("editProfile.deleteWarning")}
                </p>
                <button
                  onClick={handleDelete}
                  disabled={deleteStep === "deleting"}
                  className="w-full py-3 bg-[var(--cm-red)] text-white rounded-xl font-medium text-sm mb-3 disabled:opacity-50"
                >
                  {deleteStep === "deleting" ? t("editProfile.deleting") : t("editProfile.yesDelete")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteStep === "deleting"}
                  className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm border border-[var(--cm-border)] disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
