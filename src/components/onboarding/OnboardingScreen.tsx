"use client";

import type { ReactNode } from "react";
import { ProgressDots } from "./ProgressDots";

interface OnboardingScreenProps {
  illustration: ReactNode;
  headline: string;
  subtext: string;
  currentIndex: number;
  totalScreens: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export function OnboardingScreen({
  illustration,
  headline,
  subtext,
  currentIndex,
  totalScreens,
  isLast,
  onNext,
  onSkip,
}: OnboardingScreenProps) {
  return (
    <div className="flex h-full w-full flex-col items-center px-6 pb-10 pt-4">
      {/* Skip button */}
      <div className="flex w-full justify-end">
        {!isLast ? (
          <button
            type="button"
            onClick={onSkip}
            className="px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Skip
          </button>
        ) : (
          <div className="h-[34px]" />
        )}
      </div>

      {/* Illustration area — top 45% */}
      <div className="flex flex-1 items-center justify-center" style={{ maxHeight: "45%" }}>
        {illustration}
      </div>

      {/* Text content */}
      <div className="mt-6 w-full max-w-sm text-center">
        <h2 className="text-2xl font-bold text-white">{headline}</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">{subtext}</p>
      </div>

      {/* Progress dots */}
      <div className="mt-8">
        <ProgressDots total={totalScreens} active={currentIndex} />
      </div>

      {/* Action button */}
      <div className="mt-8 w-full max-w-sm">
        <button
          type="button"
          onClick={onNext}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-green-600 text-base font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700"
        >
          {isLast ? "Get started" : "Next \u2192"}
        </button>
      </div>
    </div>
  );
}
