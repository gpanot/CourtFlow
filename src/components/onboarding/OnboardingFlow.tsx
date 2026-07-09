"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OnboardingScreen } from "./OnboardingScreen";

const ONBOARDING_KEY = "cf_onboarding_complete";
const SWIPE_THRESHOLD = 50;
const TOTAL_SCREENS = 3;

/* ──────────────────────────────────
   Inline SVG illustrations
   ────────────────────────────────── */

function CourtManagementIllustration() {
  return (
    <svg
      viewBox="0 0 200 200"
      width={176}
      height={176}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Court grid */}
      <rect x="20" y="40" width="160" height="120" rx="10" stroke="#22c55e" strokeWidth="2" opacity="0.5" />

      {/* Court dividers */}
      <line x1="100" y1="40" x2="100" y2="160" stroke="#22c55e" strokeWidth="1.5" opacity="0.3" />
      <line x1="20" y1="100" x2="180" y2="100" stroke="#22c55e" strokeWidth="1.5" opacity="0.3" />

      {/* Court 1 — Active (green) */}
      <rect x="28" y="48" width="64" height="44" rx="4" fill="#22c55e" opacity="0.15" stroke="#22c55e" strokeWidth="1.5" />
      <text x="60" y="67" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" opacity="0.9">Court 1</text>
      <circle cx="60" cy="80" r="4" fill="#22c55e" opacity="0.8" />
      <text x="68" y="83" fill="#22c55e" fontSize="7" opacity="0.7">Active</text>

      {/* Court 2 — Blocked */}
      <rect x="108" y="48" width="64" height="44" rx="4" fill="#ef4444" fillOpacity="0.08" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.5" />
      <text x="140" y="67" textAnchor="middle" fill="#f87171" fontSize="8" fontWeight="600" opacity="0.7">Court 2</text>
      <circle cx="140" cy="80" r="4" fill="#ef4444" opacity="0.5" />
      <text x="148" y="83" fill="#f87171" fontSize="7" opacity="0.6">Blocked</text>

      {/* Court 3 — Available */}
      <rect x="28" y="108" width="64" height="44" rx="4" fill="#22c55e" fillOpacity="0.06" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.3" />
      <text x="60" y="127" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" opacity="0.5">Court 3</text>
      <circle cx="60" cy="140" r="4" fill="#22c55e" opacity="0.3" />
      <text x="68" y="143" fill="#22c55e" fontSize="7" opacity="0.4">Open</text>

      {/* Court 4 — Active */}
      <rect x="108" y="108" width="64" height="44" rx="4" fill="#22c55e" opacity="0.15" stroke="#22c55e" strokeWidth="1.5" />
      <text x="140" y="127" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" opacity="0.9">Court 4</text>
      <circle cx="140" cy="140" r="4" fill="#22c55e" opacity="0.8" />
      <text x="148" y="143" fill="#22c55e" fontSize="7" opacity="0.7">Active</text>

      {/* Staff badge top-right */}
      <rect x="140" y="12" width="46" height="18" rx="9" fill="#22c55e" opacity="0.2" stroke="#22c55e" strokeWidth="1.5" />
      <text x="163" y="25" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="700">Staff</text>

      {/* Real-time pulse dot */}
      <circle cx="26" cy="21" r="5" fill="#22c55e" opacity="0.8" />
      <circle cx="26" cy="21" r="8" stroke="#22c55e" strokeWidth="1" opacity="0.3" />
      <text x="35" y="25" fill="#22c55e" fontSize="8" opacity="0.6">Live</text>
    </svg>
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

/* ──────────────────────────────────
   Screen data
   ────────────────────────────────── */

const SCREENS = [
  {
    illustration: <CourtManagementIllustration />,
    headline: "Run your courts effortlessly",
    subtext:
      "See every court's live status at a glance. Block, assign, and manage sessions in seconds — no paperwork, no confusion.",
  },
  {
    illustration: <QrPaymentIllustration />,
    headline: "Payments handled automatically",
    subtext:
      "Players scan a QR and pay the right amount directly to your account. Confirmed instantly. No cash, no chasing.",
  },
  {
    illustration: <DashboardIllustration />,
    headline: "Full visibility for managers",
    subtext:
      "Every session, every payment, every staff action — live on your dashboard. Know what's happening before anyone tells you.",
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
