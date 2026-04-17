"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CourtFlowLogo } from "@/components/courtflow-logo";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

const ONBOARDING_KEY = "cf_onboarding_complete";

export default function LandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const forceOnboarding = searchParams.get("onboarding") === "1";
  const done = !forceOnboarding && typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY) === "true";

  useEffect(() => {
    if (done) {
      router.replace("/staff");
      return;
    }
    const timer = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(timer);
  }, [done, router]);

  if (ready && !done) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0a]">
      <CourtFlowLogo size="large" dark asLink={false} />
    </div>
  );
}
