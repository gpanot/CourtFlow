"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { QueueEntryData } from "@/components/queue-panel";
import { tvI18n } from "@/i18n/tv-i18n";
import {
  buildTvStripBatches,
  buildQueueEntryByPlayerId,
  stripRowQueueNumbers,
  batchToPaddedGenders,
  nextGreenPillGenderTag,
} from "@/lib/tv-queue-strip-build";
import { COURT_PLAYER_COUNT, TV_STRIP_QUEUE_ROW_LIMIT } from "@/lib/constants";
import type { TvStripQueueRow } from "@/lib/tv-queue-strip-build";

const NEXT_BATCH_COUNT = 2;

function formatNum(n: number | null): string {
  if (n == null) return "—";
  return String(n);
}

function batchToPaddedSlots(
  batch: TvStripQueueRow[],
  entryById: ReturnType<typeof buildQueueEntryByPlayerId>
): (number | null)[] {
  const nums = batch.flatMap((row) => stripRowQueueNumbers(row, entryById));
  const out = nums.slice(0, COURT_PLAYER_COUNT);
  while (out.length < COURT_PLAYER_COUNT) out.push(null);
  return out;
}

export function TvQueueStrip({ entries }: { entries: QueueEntryData[] }) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const entryById = useMemo(() => buildQueueEntryByPlayerId(entries), [entries]);
  const { batches, truncated } = useMemo(
    () => buildTvStripBatches(entries, TV_STRIP_QUEUE_ROW_LIMIT),
    [entries]
  );

  const nextBatches = Array.from({ length: NEXT_BATCH_COUNT }, (_, i) => batches[i] ?? []);
  const restBatches = batches.slice(NEXT_BATCH_COUNT);

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#111] px-[min(calc(1.25*var(--tw,1vw)),calc(1.75*var(--th,1vh)))] py-[min(calc(1*var(--th,1vh)),calc(0.75*var(--tw,1vw)))]">
      <div
        className="mb-[min(calc(0.5*var(--th,1vh)),calc(0.35*var(--tw,1vw)))] font-semibold uppercase tracking-[0.2em] text-neutral-500"
        style={{
          fontSize: "clamp(0.55rem, calc(0.85 * var(--tw, 1vw)), 0.7rem)",
        }}
      >
        {t("tvQueue.waiting")}
      </div>
      <div className="flex flex-nowrap items-center gap-[min(calc(0.5*var(--tw,1vw)),calc(0.35*var(--th,1vh)))] overflow-x-auto pb-1 pt-[min(0.65rem,calc(0.55*var(--th,1vh)))]">
        <span
          className="shrink-0 font-bold uppercase tracking-[0.12em] text-green-400"
          style={{
            fontSize: "clamp(0.5rem, calc(0.75 * var(--tw, 1vw)), 0.65rem)",
          }}
        >
          {t("tvQueue.nextUp")}
        </span>
        {nextBatches.map((batch, bi) => {
          const slots = batchToPaddedSlots(batch, entryById);
          const genders = batchToPaddedGenders(batch, entryById);
          const genderTag = nextGreenPillGenderTag(slots, genders);
          const tagLabel =
            genderTag === "men"
              ? t("court.gameMen")
              : genderTag === "women"
                ? t("court.gameWomen")
                : genderTag === "mix"
                  ? t("court.gameMixed")
                  : null;
          return (
            <span key={`next-${bi}`} className="flex shrink-0 items-center gap-[min(calc(0.45*var(--tw,1vw)),calc(0.35*var(--th,1vh)))]">
              {bi > 0 && (
                <span
                  className="shrink-0 font-semibold text-neutral-500"
                  style={{
                    fontSize: "clamp(1rem, min(3vw, 3.5vh), 1.75rem)",
                  }}
                  aria-hidden
                >
                  ←
                </span>
              )}
              <span className="relative shrink-0 inline-block">
                {tagLabel != null && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-purple-500/45 bg-[#111] px-[min(0.625rem,calc(0.5*var(--tw,1vw)))] py-[min(0.2rem,calc(0.15*var(--th,1vh)))] font-semibold uppercase tracking-wide text-purple-100 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                    style={{
                      fontSize: "clamp(0.625rem, calc(0.75 * var(--tw, 1vw)), 0.6875rem)",
                    }}
                  >
                    {tagLabel}
                  </span>
                )}
                <div
                  className="inline-flex min-w-0 flex-nowrap items-center gap-[min(calc(0.65*var(--tw,1vw)),calc(0.5*var(--th,1vh)))] rounded-[10px] border border-green-500/35 bg-green-500/10 px-[min(calc(0.65*var(--tw,1vw)),calc(0.5*var(--th,1vh)))] py-[min(calc(0.45*var(--th,1vh)),calc(0.3*var(--tw,1vw)))]"
                >
                  {slots.map((num, si) => (
                    <span
                      key={`next-${bi}-s${si}`}
                      className="inline-flex min-w-[3.25ch] shrink-0 justify-center px-[min(0.2em,calc(0.12*var(--tw,1vw)))] font-semibold tabular-nums text-green-400"
                      style={{
                        fontSize: "clamp(1.25rem, min(4.2vw, 5vh), 2.25rem)",
                      }}
                    >
                      {formatNum(num)}
                    </span>
                  ))}
                </div>
              </span>
            </span>
          );
        })}
        {restBatches.length > 0 && (
          <>
            <span
              className="shrink-0 font-semibold text-neutral-500"
              style={{
                fontSize: "clamp(1rem, min(3vw, 3.5vh), 1.75rem)",
              }}
              aria-hidden
            >
              ←
            </span>
            {restBatches.map((batch, bi) => {
              const slots = batchToPaddedSlots(batch, entryById);
              return (
                <span key={`rest-${bi}`} className="flex shrink-0 items-center gap-[min(calc(0.45*var(--tw,1vw)),calc(0.35*var(--th,1vh)))]">
                  {bi > 0 && (
                    <span
                      className="shrink-0 font-semibold text-neutral-500"
                      style={{
                        fontSize: "clamp(1rem, min(3vw, 3.5vh), 1.75rem)",
                      }}
                      aria-hidden
                    >
                      ←
                    </span>
                  )}
                  <div
                    className="inline-flex min-w-0 items-center gap-[min(calc(0.55*var(--tw,1vw)),calc(0.45*var(--th,1vh)))] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[min(calc(0.55*var(--tw,1vw)),calc(0.45*var(--th,1vh)))] py-[min(calc(0.35*var(--th,1vh)),calc(0.3*var(--tw,1vw)))]"
                  >
                    {slots.map((num, si) => (
                      <span
                        key={`rest-${bi}-s${si}`}
                        className="inline-flex min-w-[3.25ch] shrink-0 justify-center px-[min(0.18em,calc(0.1*var(--tw,1vw)))] font-semibold tabular-nums text-neutral-500"
                        style={{
                          fontSize: "clamp(0.85rem, calc(1.55 * var(--tw, 1vw)), 1.35rem)",
                        }}
                      >
                        {formatNum(num)}
                      </span>
                    ))}
                  </div>
                </span>
              );
            })}
          </>
        )}
        {truncated && (
          <span
            className={cn(
              "shrink-0 font-semibold text-neutral-500",
              restBatches.length > 0 && "pl-[min(calc(0.35*var(--tw,1vw)),calc(0.25*var(--th,1vh)))]"
            )}
            style={{
              fontSize: "clamp(1rem, calc(1.6 * var(--tw, 1vw)), 1.5rem)",
              letterSpacing: "0.12em",
            }}
            aria-hidden
          >
            ...
          </span>
        )}
      </div>
    </div>
  );
}
