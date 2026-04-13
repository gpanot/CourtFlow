"use client";

import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Monitor, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";

export interface KioskConfirmationScreenProps {
  displayName: string;
  queueNumber?: number;
  queuePosition?: number;
  skillLevel?: string;
  totalSessions?: number;
  isReturning?: boolean;
  alreadyCheckedIn?: boolean;
  onScanNext: () => void;
  /** Staff walk-in with face: layout matches check-in confirmation (wristband + TV cues). */
  mode?: "kiosk" | "staff";
  /** Required for `mode="staff"` middle pill. */
  gender?: "male" | "female" | string;
  /** Shown under pills on staff flow when AWS enrollment failed. */
  enrollmentWarning?: string | null;
}

const BG = "#0e0e0e";
const PILL_BG = "#1a1a1a";
const GREEN = "#22c55e";
const BTN_BG = "#1a3a2a";
const AMBER_WRISTBAND = "#fbbf24";

/** Scales with viewport so mobile fits one screen; still reads large on tablet/desktop */
const SESSION_NUMBER_CLASS =
  "font-bold tabular-nums leading-none text-[clamp(2.75rem,min(28vmin,18svh),6rem)]";

function skillLabelKey(level: string): string | null {
  const map: Record<string, string> = {
    beginner: "staff.checkIn.skillBeginner",
    intermediate: "staff.checkIn.skillIntermediate",
    advanced: "staff.checkIn.skillAdvanced",
    pro: "staff.checkIn.skillPro",
  };
  return map[level] ?? null;
}

export function KioskConfirmationScreen({
  displayName,
  queueNumber,
  queuePosition,
  skillLevel,
  totalSessions,
  isReturning = true,
  alreadyCheckedIn = false,
  onScanNext,
  mode = "kiosk",
  gender,
  enrollmentWarning,
}: KioskConfirmationScreenProps) {
  const { t } = useTranslation();
  const isStaff = mode === "staff";

  const skillDisplay =
    skillLevel && skillLabelKey(skillLevel)
      ? t(skillLabelKey(skillLevel)!)
      : skillLevel
        ? skillLevel
        : "—";

  const queuePill = t("staff.kiosk.confirmHeadToTv");

  const sessionsDisplay =
    totalSessions != null && totalSessions >= 0 ? String(totalSessions) : "—";

  const headerLabel = alreadyCheckedIn
    ? t("staff.kiosk.confirmAlreadyCheckedIn")
    : isReturning
      ? t("staff.kiosk.confirmWelcomeBack")
      : t("staff.kiosk.confirmWelcome");

  const showSessionNumber =
    !alreadyCheckedIn && queueNumber != null && queueNumber > 0;

  const genderLabel =
    gender === "male"
      ? t("staff.checkIn.genderMale")
      : gender === "female"
        ? t("staff.checkIn.genderFemale")
        : gender
          ? String(gender)
          : "—";

  return (
    <div
      className="flex h-full min-h-0 w-full max-w-2xl flex-col rounded-lg overflow-hidden"
      style={{ backgroundColor: BG }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-5">
        {isStaff ? (
          <div className="flex min-h-min flex-col gap-3 sm:gap-5">
            {queueNumber != null && queueNumber > 0 && (
              <div className="flex shrink-0 flex-col items-center py-1 text-center sm:py-2">
                <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-500 sm:text-xs sm:tracking-[0.2em]">
                  {t("staff.kiosk.confirmSessionNumberLabel")}
                </p>
                <p className={cn(SESSION_NUMBER_CLASS, "text-white")}>{queueNumber}</p>
              </div>
            )}
            <p className="text-center text-xl font-bold leading-tight text-white sm:text-3xl">
              {displayName}
            </p>

            <div className="grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-3">
              <div
                className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-3"
                style={{ backgroundColor: PILL_BG }}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                  {t("staff.kiosk.confirmLevel")}
                </span>
                <span className="px-0.5 text-[10px] font-semibold leading-tight text-white sm:text-sm">
                  {skillDisplay}
                </span>
              </div>
              <div
                className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-3"
                style={{ backgroundColor: PILL_BG }}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                  {t("staff.checkIn.gender")}
                </span>
                <span className="px-0.5 text-[10px] font-semibold leading-tight text-sky-300 sm:text-sm">
                  {genderLabel}
                </span>
              </div>
              <div
                className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-3"
                style={{ backgroundColor: PILL_BG }}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                  {t("staff.kiosk.confirmQueue")}
                </span>
                <span
                  className={cn(
                    "px-0.5 text-[10px] font-semibold leading-tight sm:text-sm",
                    queuePosition != null && queuePosition > 0 ? "text-green-500" : "text-neutral-200"
                  )}
                >
                  {queuePill}
                </span>
              </div>
            </div>

            {queueNumber != null && queueNumber > 0 && (
              <>
                <div className="rounded-xl border border-dashed border-neutral-500 px-3 py-4 text-center sm:px-5 sm:py-5">
                  <p className="text-xs text-neutral-400 sm:text-sm">
                    {t("staff.checkIn.wristbandInstructionTop")}
                  </p>
                  <p
                    className="py-2 text-4xl font-bold tabular-nums sm:py-3 sm:text-5xl"
                    style={{ color: AMBER_WRISTBAND }}
                  >
                    {queueNumber}
                  </p>
                  <p className="text-xs leading-snug text-neutral-400 sm:text-sm">
                    {t("staff.checkIn.wristbandInstructionBottom")}
                  </p>
                </div>
                <div className="flex shrink-0 justify-center px-1 pt-1 sm:px-2 sm:pt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static asset from /public */}
                  <img
                    src="/wristband.png"
                    alt={t("staff.checkIn.wristbandIllustrationAlt")}
                    className="h-auto max-h-[min(220px,32svh)] w-full max-w-md object-contain select-none"
                    draggable={false}
                  />
                </div>
              </>
            )}

            {enrollmentWarning ? (
              <p className="text-center text-xs text-amber-300/90">{enrollmentWarning}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-min flex-col gap-3 sm:gap-5">
            <div className="flex shrink-0 flex-col items-center text-center">
              <div
                className={cn(
                  "mb-2 flex h-10 w-10 items-center justify-center rounded-full sm:mb-3 sm:h-12 sm:w-12",
                  alreadyCheckedIn ? "bg-amber-600" : "bg-green-600"
                )}
              >
                <Check className="h-6 w-6 text-white stroke-[3] sm:h-7 sm:w-7" aria-hidden />
              </div>
              <p
                className={cn(
                  "mb-0.5 text-xs font-semibold uppercase tracking-wide sm:text-sm",
                  alreadyCheckedIn ? "text-amber-400" : "text-green-400"
                )}
              >
                {headerLabel}
              </p>
              <p className="text-xl font-bold leading-tight text-white sm:text-3xl">
                {displayName}
              </p>
              {alreadyCheckedIn && queueNumber != null && queueNumber > 0 && (
                <div className="mt-2 flex shrink-0 flex-col items-center py-1 sm:mt-4 sm:py-2">
                  <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-500 sm:text-xs sm:tracking-[0.2em]">
                    {t("staff.kiosk.confirmSessionNumberLabel")}
                  </p>
                  <p className={SESSION_NUMBER_CLASS} style={{ color: GREEN }}>
                    {queueNumber}
                  </p>
                </div>
              )}
            </div>

            {showSessionNumber ? (
              <div className="flex shrink-0 flex-col items-center py-1 sm:py-2">
                <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-500 sm:text-xs sm:tracking-[0.2em]">
                  {t("staff.kiosk.confirmSessionNumberLabel")}
                </p>
                <p className={SESSION_NUMBER_CLASS} style={{ color: GREEN }}>
                  {queueNumber}
                </p>
              </div>
            ) : !alreadyCheckedIn ? (
              <div className="min-h-0 shrink-0" aria-hidden />
            ) : null}

            <div className="grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-3">
              <div
                className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-3"
                style={{ backgroundColor: PILL_BG }}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                  {t("staff.kiosk.confirmLevel")}
                </span>
                <span className="px-0.5 text-[10px] font-semibold leading-tight text-white sm:text-sm">
                  {skillDisplay}
                </span>
              </div>
              <div
                className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-3"
                style={{ backgroundColor: PILL_BG }}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                  {t("staff.kiosk.confirmSessions")}
                </span>
                <span className="text-[10px] font-semibold leading-tight text-white sm:text-sm">
                  {sessionsDisplay}
                </span>
              </div>
            </div>

            <div
              className="rounded-xl px-3 py-3 sm:px-5 sm:py-4"
              style={{ backgroundColor: PILL_BG }}
            >
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-green-400 sm:text-base">
                <Monitor className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
                {queuePill}
              </p>
            </div>
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-neutral-800/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:pb-5 sm:pt-3"
        style={{ backgroundColor: BG }}
      >
        {isStaff ? (
          <button
            type="button"
            onClick={onScanNext}
            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-green-500 active:scale-[0.99] sm:py-4 sm:text-lg"
          >
            {t("staff.checkIn.confirmNextPlayer")}
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={onScanNext}
            className="flex w-full touch-manipulation flex-col items-center gap-0.5 rounded-xl border-2 px-3 py-2.5 transition-colors hover:opacity-95 active:scale-[0.99] sm:gap-1 sm:px-4 sm:py-4"
            style={{
              backgroundColor: BTN_BG,
              borderColor: GREEN,
            }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold sm:text-base" style={{ color: GREEN }}>
              <ScanLine className="h-4 w-4 shrink-0" aria-hidden />
              {t("staff.kiosk.confirmScanNext")}
            </span>
            <span className="text-[10px] text-neutral-500 sm:text-xs">
              {t("staff.kiosk.confirmCameraOffHint")}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
