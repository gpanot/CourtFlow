"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { signOutToIntro } from "../../lib/sign-out-to-intro";
import { useTheme } from "../../components/ThemeProvider";
import { AvatarPhotoCropper } from "@/components/avatar-photo-cropper";
import { BookScreenTopBar } from "../../components/BookScreenTopBar";
import { useTranslation } from "react-i18next";
import { BOOK_LANGUAGES, persistBookLanguage, type BookLanguageCode } from "@/i18n/book-i18n";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;
const THEME_OPTIONS = [
  { value: "light" as const, labelKey: "theme.light" },
  { value: "dark" as const, labelKey: "theme.dark" },
] as const;

type ProfileSnapshot = {
  name: string;
  phone: string;
  gender: string;
  skillLevel: string;
};

function segmentClass(selected: boolean) {
  return selected
    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
    : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]";
}

export default function EditProfilePage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { mode, resolved, setMode } = useTheme();
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState<ProfileSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"confirm" | "deleting" | "done">("confirm");

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
      skillLevel !== initialProfile.skillLevel
    );
  }, [initialProfile, name, phone, gender, skillLevel]);

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
          };
          setName(snapshot.name);
          setPhone(snapshot.phone);
          setGender(snapshot.gender);
          setSkillLevel(snapshot.skillLevel);
          setInitialProfile(snapshot);
          setEmail(p.email ?? "");
          setAvatarUrl(p.avatar ?? null);
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
        body: JSON.stringify({ name, phone, gender, skillLevel }),
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
      </div>

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
