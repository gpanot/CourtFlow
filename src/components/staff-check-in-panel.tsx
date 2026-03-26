"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType } from "@/lib/constants";
import { Loader2, UserPlus } from "lucide-react";

const GENDERS = ["male", "female"] as const;

export interface StaffCheckInRecent {
  id: string;
  name: string;
  gender: string;
  skillLevel: string;
}

interface StaffCheckInPanelProps {
  venueId: string;
  /** Lowercased display names already in this session queue (waiting / on court / break). */
  queueNamesLower: string[];
  onAdded: () => void;
}

const FLASH_MS = 3200;

export function StaffCheckInPanel({ venueId, queueNamesLower, onAdded }: StaffCheckInPanelProps) {
  const { t } = useTranslation();

  const skillLabel = (level: SkillLevelType) => {
    const keys = {
      beginner: "staff.checkIn.skillBeginner",
      intermediate: "staff.checkIn.skillIntermediate",
      advanced: "staff.checkIn.skillAdvanced",
      pro: "staff.checkIn.skillPro",
    } as const;
    return t(keys[level]);
  };

  const genderLabel = (g: (typeof GENDERS)[number]) =>
    g === "male" ? t("staff.checkIn.genderMale") : t("staff.checkIn.genderFemale");

  const duplicateNameMsg = t("staff.checkIn.duplicateName");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<(typeof GENDERS)[number] | "">("");
  const [skill, setSkill] = useState<SkillLevelType | "">("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [testSeedLoading, setTestSeedLoading] = useState(false);
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<StaffCheckInRecent[]>([]);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const showFlash = (message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage(message);
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
      flashTimerRef.current = null;
    }, FLASH_MS);
  };

  const trimmedName = name.trim();
  const nameIsDuplicate =
    trimmedName.length > 0 && queueNamesLower.includes(trimmedName.toLowerCase());
  /** After name + gender, surface duplicate immediately (no need to tap Add). */
  const showDuplicateWarning = nameIsDuplicate && gender !== "";

  const submit = async () => {
    setErr("");
    const trimmed = name.trim();
    if (!trimmed || !gender || !skill) {
      setErr(t("staff.checkIn.requiredFields"));
      return;
    }
    if (queueNamesLower.includes(trimmed.toLowerCase())) {
      setErr(duplicateNameMsg);
      return;
    }
    setLoading(true);
    try {
      const phoneTrimmed = phone.trim();
      const res = await api.post<{
        success: boolean;
        player: { id: string; name: string; gender: string; skillLevel: string };
      }>("/api/queue/staff-add-walk-in", {
        venueId,
        name: trimmed,
        gender,
        skillLevel: skill,
        ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
      });
      if (res.player) {
        showFlash(t("staff.checkIn.addedFlash", { name: res.player.name }));
        setRecent((prev) => {
          const next = [
            {
              id: res.player.id,
              name: res.player.name,
              gender: res.player.gender,
              skillLevel: res.player.skillLevel,
            },
            ...prev.filter((p) => p.id !== res.player.id),
          ];
          return next.slice(0, 5);
        });
      }
      setName("");
      setGender("");
      setSkill("");
      setPhone("");
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addFiveTestPlayers = async () => {
    setErr("");
    setTestSeedLoading(true);
    const added: StaffCheckInRecent[] = [];
    try {
      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        const suffix = `${base}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const testName = `Test ${suffix}`;
        const g: (typeof GENDERS)[number] = Math.random() < 0.5 ? "male" : "female";
        const s = SKILL_LEVELS[Math.floor(Math.random() * SKILL_LEVELS.length)];
        const res = await api.post<{
          success: boolean;
          player: { id: string; name: string; gender: string; skillLevel: string };
        }>("/api/queue/staff-add-walk-in", {
          venueId,
          name: testName,
          gender: g,
          skillLevel: s,
        });
        if (res.player) {
          added.push({
            id: res.player.id,
            name: res.player.name,
            gender: res.player.gender,
            skillLevel: res.player.skillLevel,
          });
        }
      }
      if (added.length > 0) {
        showFlash(t("staff.checkIn.testCreate5Flash"));
        setRecent((prev) => {
          const next = [...added, ...prev.filter((p) => !added.some((a) => a.id === p.id))];
          return next.slice(0, 5);
        });
      }
      onAdded();
    } catch (e) {
      if (added.length > 0) onAdded();
      setErr((e as Error).message);
    } finally {
      setTestSeedLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6 max-sm:space-y-2">
      <div
        className={cn(
          "flex h-[5.25rem] items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 max-sm:h-[4.5rem] max-sm:gap-2 max-sm:rounded-lg max-sm:px-3 max-sm:py-2",
          flashMessage ? "border-green-500/50 bg-green-600/15" : "border-green-500/25 bg-green-600/10"
        )}
      >
        <UserPlus className="h-6 w-6 shrink-0 text-green-400 max-sm:h-5 max-sm:w-5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-green-300 max-sm:text-sm">{t("staff.checkIn.title")}</p>
          {flashMessage ? (
            <p
              className="line-clamp-2 text-sm font-medium leading-snug text-green-200 max-sm:text-xs"
              role="status"
              aria-live="polite"
              title={flashMessage}
            >
              {flashMessage}
            </p>
          ) : (
            <p className="line-clamp-2 text-xs leading-snug text-neutral-400 max-sm:text-[11px]">
              {t("staff.checkIn.subtitle")}
            </p>
          )}
        </div>
      </div>

      {showDuplicateWarning && (
        <div
          id="checkin-duplicate-name"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-xs"
          role="alert"
          aria-live="polite"
        >
          {duplicateNameMsg}
        </div>
      )}
      {err && !showDuplicateWarning && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-xs">
          {err}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 max-sm:space-y-2.5 max-sm:rounded-lg max-sm:p-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-400 max-sm:mb-1">
            {t("staff.checkIn.name")}
          </label>
          <input
            type="text"
            placeholder={t("staff.checkIn.playerNamePlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            className={cn(
              "w-full rounded-xl border bg-neutral-950 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:outline-none max-sm:rounded-lg max-sm:px-3 max-sm:py-2",
              showDuplicateWarning ? "border-red-500/50 focus:border-red-500" : "border-neutral-700 focus:border-green-500"
            )}
            aria-invalid={showDuplicateWarning}
            aria-describedby={showDuplicateWarning ? "checkin-duplicate-name" : undefined}
            autoComplete="off"
            autoCapitalize="words"
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400 max-sm:mb-1">{t("staff.checkIn.gender")}</p>
          <div className="grid grid-cols-2 gap-2 max-sm:gap-1.5">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={cn(
                  "rounded-xl border-2 py-3 text-sm font-medium capitalize transition-colors max-sm:rounded-lg max-sm:py-2",
                  gender === g
                    ? "border-green-500 bg-green-600/20 text-green-400"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                )}
              >
                {genderLabel(g)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400 max-sm:mb-1">{t("staff.checkIn.skillLevel")}</p>
          <div className="space-y-2 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-sm:space-y-0">
            {SKILL_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSkill(level)}
                className={cn(
                  "w-full rounded-xl border-2 p-3 text-left transition-colors max-sm:rounded-lg max-sm:p-2.5 max-sm:text-center",
                  skill === level ? "border-green-500 bg-green-600/20" : "border-neutral-700 hover:border-neutral-500"
                )}
              >
                <span className="font-medium capitalize text-white max-sm:text-sm">{skillLabel(level)}</span>
                <p className="text-sm text-neutral-400 max-sm:hidden">{SKILL_DESCRIPTIONS[level]}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-400 max-sm:mb-1">
            {t("staff.checkIn.phoneOptional")}
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("staff.checkIn.phonePlaceholder")}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErr("");
            }}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none max-sm:rounded-lg max-sm:px-3 max-sm:py-2"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={loading || testSeedLoading || !name.trim() || !gender || !skill || showDuplicateWarning}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5 max-sm:text-base"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin max-sm:h-4 max-sm:w-4" />
              {t("staff.checkIn.adding")}
            </>
          ) : (
            t("staff.checkIn.addToQueue")
          )}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 max-sm:rounded-lg max-sm:p-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 max-sm:mb-1 max-sm:text-[10px]">
            {t("staff.checkIn.recentlyAdded")}
          </p>
          <ul className="space-y-2 max-sm:space-y-1">
            {recent.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-sm max-sm:px-2 max-sm:py-1 max-sm:text-xs"
              >
                <span className="min-w-0 truncate font-medium text-white">{p.name}</span>
                <span className="shrink-0 text-neutral-400">
                  {(p.gender === "male" || p.gender === "female" ? genderLabel(p.gender) : p.gender)} ·{" "}
                  {(["beginner", "intermediate", "advanced", "pro"] as const).includes(p.skillLevel as SkillLevelType)
                    ? skillLabel(p.skillLevel as SkillLevelType)
                    : p.skillLevel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center pt-1">
        <button
          type="button"
          onClick={addFiveTestPlayers}
          disabled={loading || testSeedLoading}
          className="text-[11px] text-neutral-500 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-400 disabled:opacity-40 max-sm:text-[10px]"
        >
          {testSeedLoading ? (
            <span className="inline-flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("staff.checkIn.adding")}
            </span>
          ) : (
            t("staff.checkIn.testCreate5")
          )}
        </button>
      </p>
    </div>
  );
}
