"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OnboardingScreen } from "./OnboardingScreen";

const ONBOARDING_KEY = "cf_onboarding_complete";
const SWIPE_THRESHOLD = 50;
const TOTAL_SCREENS = 4;

/* ──────────────────────────────────
   Inline SVG illustrations
   ────────────────────────────────── */

function FaceScanIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing ring */}
      <span className="absolute h-44 w-44 animate-ping rounded-full border-2 border-green-500/20" />
      <svg
        viewBox="0 0 200 200"
        width={176}
        height={176}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer circle */}
        <circle cx="100" cy="100" r="88" stroke="#22c55e" strokeWidth="2" opacity="0.5" />
        <circle cx="100" cy="100" r="80" stroke="#22c55e" strokeWidth="1.5" opacity="0.25" />

        {/* Corner brackets */}
        <path d="M40 70 V50 H60" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M160 70 V50 H140" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M40 130 V150 H60" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M160 130 V150 H140" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Face outline */}
        <ellipse cx="100" cy="95" rx="28" ry="35" stroke="#22c55e" strokeWidth="2" />
        {/* Eyes */}
        <circle cx="88" cy="88" r="3" fill="#22c55e" />
        <circle cx="112" cy="88" r="3" fill="#22c55e" />
        {/* Mouth */}
        <path d="M92 104 Q100 112 108 104" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Neck/body hint */}
        <path d="M82 128 Q100 138 118 128" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      </svg>
    </div>
  );
}

function QrPaymentIllustration() {
  return (
    <svg
      viewBox="0 0 200 200"
      width={176}
      height={176}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* QR code border */}
      <rect x="40" y="40" width="120" height="120" rx="12" stroke="#22c55e" strokeWidth="2" />

      {/* QR pattern — simplified blocks */}
      {/* Top-left finder */}
      <rect x="52" y="52" width="28" height="28" rx="4" stroke="#22c55e" strokeWidth="2" />
      <rect x="58" y="58" width="16" height="16" rx="2" fill="#22c55e" opacity="0.6" />
      {/* Top-right finder */}
      <rect x="120" y="52" width="28" height="28" rx="4" stroke="#22c55e" strokeWidth="2" />
      <rect x="126" y="58" width="16" height="16" rx="2" fill="#22c55e" opacity="0.6" />
      {/* Bottom-left finder */}
      <rect x="52" y="120" width="28" height="28" rx="4" stroke="#22c55e" strokeWidth="2" />
      <rect x="58" y="126" width="16" height="16" rx="2" fill="#22c55e" opacity="0.6" />

      {/* Data blocks */}
      <rect x="92" y="56" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />
      <rect x="104" y="56" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />
      <rect x="92" y="68" width="8" height="8" rx="1" fill="#22c55e" opacity="0.25" />
      <rect x="56" y="92" width="8" height="8" rx="1" fill="#22c55e" opacity="0.25" />
      <rect x="68" y="92" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />
      <rect x="92" y="92" width="16" height="16" rx="2" fill="#22c55e" opacity="0.4" />
      <rect x="112" y="92" width="8" height="8" rx="1" fill="#22c55e" opacity="0.25" />
      <rect x="124" y="92" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />
      <rect x="92" y="112" width="8" height="8" rx="1" fill="#22c55e" opacity="0.25" />
      <rect x="112" y="120" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />
      <rect x="124" y="132" width="8" height="8" rx="1" fill="#22c55e" opacity="0.25" />
      <rect x="136" y="120" width="8" height="8" rx="1" fill="#22c55e" opacity="0.35" />

      {/* Checkmark overlay */}
      <circle cx="145" cy="145" r="22" fill="#0a0a0a" stroke="#22c55e" strokeWidth="2" />
      <path d="M134 145 L142 153 L158 137" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashboardIllustration() {
  return (
    <svg
      viewBox="0 0 200 220"
      width={176}
      height={194}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Phone outline */}
      <rect x="45" y="10" width="110" height="200" rx="16" stroke="#22c55e" strokeWidth="2" />
      {/* Notch */}
      <rect x="80" y="10" width="40" height="6" rx="3" fill="#1a1a1a" />

      {/* Metric card 1 */}
      <rect x="58" y="34" width="38" height="30" rx="6" stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
      <rect x="64" y="40" width="16" height="4" rx="2" fill="#22c55e" opacity="0.3" />
      <rect x="64" y="50" width="24" height="6" rx="2" fill="#22c55e" opacity="0.5" />

      {/* Metric card 2 */}
      <rect x="104" y="34" width="38" height="30" rx="6" stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
      <rect x="110" y="40" width="16" height="4" rx="2" fill="#22c55e" opacity="0.3" />
      <rect x="110" y="50" width="24" height="6" rx="2" fill="#22c55e" opacity="0.5" />

      {/* Bar chart */}
      <rect x="62" y="76" width="76" height="58" rx="4" stroke="#1a1a1a" strokeWidth="1" />
      {/* Bars */}
      <rect x="70" y="108" width="10" height="22" rx="2" fill="#22c55e" opacity="0.5" />
      <rect x="84" y="96" width="10" height="34" rx="2" fill="#22c55e" opacity="0.65" />
      <rect x="98" y="102" width="10" height="28" rx="2" fill="#22c55e" opacity="0.45" />
      <rect x="112" y="86" width="10" height="44" rx="2" fill="#22c55e" opacity="0.75" />
      <rect x="126" y="92" width="10" height="38" rx="2" fill="#22c55e" opacity="0.55" />

      {/* List lines below chart */}
      <rect x="58" y="146" width="84" height="4" rx="2" fill="#22c55e" opacity="0.2" />
      <rect x="58" y="156" width="68" height="4" rx="2" fill="#22c55e" opacity="0.15" />
      <rect x="58" y="166" width="76" height="4" rx="2" fill="#22c55e" opacity="0.2" />
      <rect x="58" y="176" width="60" height="4" rx="2" fill="#22c55e" opacity="0.15" />

      {/* Home indicator */}
      <rect x="85" y="198" width="30" height="4" rx="2" fill="#22c55e" opacity="0.25" />
    </svg>
  );
}

function SubscriptionIllustration() {
  return (
    <svg
      viewBox="0 0 220 200"
      width={194}
      height={176}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Card 3 (back) */}
      <rect x="50" y="30" width="130" height="60" rx="10" stroke="#22c55e" strokeWidth="1.5" opacity="0.25" />
      <rect x="64" y="44" width="50" height="5" rx="2" fill="#22c55e" opacity="0.15" />
      <rect x="64" y="55" width="30" height="4" rx="2" fill="#22c55e" opacity="0.1" />
      <rect x="64" y="66" width="70" height="4" rx="2" fill="#22c55e" opacity="0.1" />

      {/* Card 2 (middle) */}
      <rect x="38" y="60" width="130" height="60" rx="10" stroke="#22c55e" strokeWidth="1.5" opacity="0.45" fill="#0a0a0a" />
      <rect x="52" y="74" width="50" height="5" rx="2" fill="#22c55e" opacity="0.25" />
      <rect x="52" y="85" width="30" height="4" rx="2" fill="#22c55e" opacity="0.2" />
      <rect x="52" y="96" width="70" height="4" rx="2" fill="#22c55e" opacity="0.2" />

      {/* Card 1 (front) */}
      <rect x="26" y="90" width="130" height="60" rx="10" stroke="#22c55e" strokeWidth="2" fill="#0a0a0a" />
      <rect x="40" y="104" width="60" height="6" rx="3" fill="#22c55e" opacity="0.4" />
      <rect x="40" y="116" width="36" height="4" rx="2" fill="#22c55e" opacity="0.3" />
      <rect x="40" y="126" width="80" height="4" rx="2" fill="#22c55e" opacity="0.25" />

      {/* Active badge on front card */}
      <rect x="108" y="99" width="40" height="18" rx="9" fill="#22c55e" opacity="0.2" stroke="#22c55e" strokeWidth="1.5" />
      <text x="128" y="112" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="600">Active</text>

      {/* Labels */}
      <text x="58" y="180" fill="#444" fontSize="10" fontWeight="500">5 sessions</text>
      <text x="108" y="180" fill="#444" fontSize="10" fontWeight="500">10 sessions</text>
      <text x="163" y="180" fill="#444" fontSize="10" fontWeight="500">Unlimited</text>
    </svg>
  );
}

/* ──────────────────────────────────
   Screen data
   ────────────────────────────────── */

const SCREENS = [
  {
    illustration: <FaceScanIllustration />,
    headline: "Players check in instantly",
    subtext:
      "Face recognition registers new players and welcomes back regulars in seconds. No forms. No friction.",
  },
  {
    illustration: <QrPaymentIllustration />,
    headline: "Payments fully automated",
    subtext:
      "Players scan a QR and pay the right amount directly to your account. Confirmed instantly. No cash handling.",
  },
  {
    illustration: <DashboardIllustration />,
    headline: "Know exactly what you earned",
    subtext:
      "Every player. Every payment. Live on your phone. Your staff knows you can see it.",
  },
  {
    illustration: <SubscriptionIllustration />,
    headline: "Members keep coming back",
    subtext:
      "Offer session packages that reward loyalty and give you predictable monthly revenue.",
  },
];

/* ──────────────────────────────────
   Main flow
   ────────────────────────────────── */

export function OnboardingFlow() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const touchStartRef = useRef<number | null>(null);

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/staff");
  }, [router]);

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= TOTAL_SCREENS) return;
      setCurrent(idx);
    },
    [],
  );

  const handleNext = () => {
    if (current === TOTAL_SCREENS - 1) {
      complete();
    } else {
      goTo(current + 1);
    }
  };

  const handleSkip = () => {
    complete();
  };

  /* Touch swipe handlers */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = touchStartRef.current - e.changedTouches[0].clientX;
    touchStartRef.current = null;
    if (Math.abs(diff) < SWIPE_THRESHOLD) return;
    if (diff > 0 && current < TOTAL_SCREENS - 1) {
      goTo(current + 1);
    } else if (diff < 0 && current > 0) {
      goTo(current - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#0a0a0a]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(-${current * 100}%)`,
        }}
      >
        {SCREENS.map((screen, i) => (
          <div
            key={i}
            className="h-full w-full shrink-0"
          >
            <OnboardingScreen
              illustration={screen.illustration}
              headline={screen.headline}
              subtext={screen.subtext}
              currentIndex={current}
              totalScreens={TOTAL_SCREENS}
              isLast={current === TOTAL_SCREENS - 1}
              onNext={handleNext}
              onSkip={handleSkip}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
