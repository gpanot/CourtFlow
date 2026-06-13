"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { signOutToIntro } from "../../lib/sign-out-to-intro";
import { useTheme } from "../../components/ThemeProvider";

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const GENDERS = ["male", "female"] as const;
const THEME_OPTIONS = [
  { value: "dark" as const, label: "Dark" },
  { value: "light" as const, label: "Light" },
  { value: "system" as const, label: "System" },
];

export default function EditProfilePage() {
  const { status } = useSession();
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"confirm" | "deleting" | "done">("confirm");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated") {
      fetch("/api/public/account")
        .then((r) => r.json())
        .then((p) => {
          setName(p.name ?? "");
          setPhone(p.phone ?? "");
          setGender(p.gender ?? "");
          setSkillLevel(p.skillLevel ?? "");
          setEmail(p.email ?? "");
          setLoaded(true);
        });
    }
  }, [status, router]);

  async function handleDelete() {
    setDeleteStep("deleting");
    try {
      const res = await fetch("/api/public/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Deletion failed");
      setDeleteStep("done");
      setTimeout(() => signOutToIntro(), 1500);
    } catch {
      setDeleteStep("confirm");
      setError("Account deletion failed. Please try again.");
      setShowDeleteConfirm(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, gender, skillLevel }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save");
      }
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;
  }

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← Back
      </button>
      <h1 className="text-xl font-bold mb-6 text-[var(--cm-text)]">Edit Profile</h1>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm mb-5 outline-none focus:border-[var(--cm-accent)] text-[var(--cm-text)]"
      />

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">Email</label>
      <input
        value={email}
        disabled
        className="w-full px-4 py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm mb-5 text-[var(--cm-text-muted)]"
      />

      <label className="block text-sm font-medium mb-1.5 text-[var(--cm-text)]">Phone</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm mb-5 outline-none focus:border-[var(--cm-accent)] text-[var(--cm-text)]"
      />

      <label className="block text-sm font-medium mb-2 text-[var(--cm-text)]">Gender</label>
      <div className="flex gap-3 mb-5">
        {GENDERS.map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              gender === g
                ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
            }`}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-2 text-[var(--cm-text)]">Skill Level</label>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {SKILL_LEVELS.map((s) => (
          <button
            key={s}
            onClick={() => setSkillLevel(s)}
            className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              skillLevel === s
                ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Theme */}
      <label className="block text-sm font-medium mb-2 text-[var(--cm-text)]">Theme</label>
      <div className="flex gap-3 mb-8">
        {THEME_OPTIONS.map((t) => (
          <button
            key={t.value}
            onClick={() => setMode(t.value)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              mode === t.value
                ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                : "bg-[var(--cm-bg-input)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>

      <div className="mt-10 pt-6 border-t border-[var(--cm-border)]">
        <button
          onClick={() => { setShowDeleteConfirm(true); setDeleteStep("confirm"); }}
          className="w-full py-3 bg-transparent border border-[var(--cm-red)]/30 text-[var(--cm-red)] rounded-xl font-medium text-sm hover:bg-[var(--cm-red)]/10 transition-colors"
        >
          Delete my account and data
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--cm-overlay)] p-4">
          <div className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-2xl p-6 pb-8 border border-[var(--cm-border)]">
            {deleteStep === "done" ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✓</div>
                <p className="font-semibold text-[var(--cm-text)]">Account deleted</p>
                <p className="text-sm text-[var(--cm-text-sec)] mt-1">Signing you out…</p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-2 text-[var(--cm-red)]">Delete account?</h2>
                <p className="text-sm text-[var(--cm-text-sec)] mb-1">
                  This will permanently remove your account and personal data. Your booking and payment history will be anonymised and retained for financial records.
                </p>
                <p className="text-sm font-medium text-[var(--cm-text)] mb-6">
                  This action cannot be undone.
                </p>
                <button
                  onClick={handleDelete}
                  disabled={deleteStep === "deleting"}
                  className="w-full py-3 bg-[var(--cm-red)] text-white rounded-xl font-medium text-sm mb-3 disabled:opacity-50"
                >
                  {deleteStep === "deleting" ? "Deleting…" : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteStep === "deleting"}
                  className="w-full py-3 bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm border border-[var(--cm-border)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
