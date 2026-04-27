"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { useStaffPinStore } from "@/stores/staff-pin-store";
import { useClientConfig } from "@/config/use-client-config";
import { StaffProfilePinModal } from "@/components/profile/StaffProfilePinModal";
import { StaffPaymentSettingsForm } from "@/components/profile/StaffPaymentSettingsForm";
import { ArrowLeft } from "lucide-react";

export default function StaffPaymentSettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const clientConfig = useClientConfig();
  const hydrated = useHasHydrated();
  const { token, staffId, venueId } = useSessionStore();
  const { unlocked, unlock, hydrateFromStorage } = useStaffPinStore();
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !staffId || !venueId) {
      router.replace("/staff");
      return;
    }
    if (!unlocked) setPinOpen(true);
    else setPinOpen(false);
  }, [hydrated, token, staffId, venueId, router, unlocked]);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.history.length > 1 ? router.back() : router.push("/staff");
      return;
    }
    router.push("/staff");
  };

  if (!hydrated || !token || !staffId || !venueId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-client-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] text-white"
      style={{ ["--client-primary" as string]: clientConfig.primaryColor }}
    >
      <StaffProfilePinModal
        open={pinOpen}
        title={t("staff.profile.pinTitle")}
        subtitle={t("staff.profile.pinSubtitle")}
        errorText={t("staff.profile.pinIncorrect")}
        cancelLabel={t("staff.dashboard.cancel")}
        onSuccess={() => {
          unlock();
          setPinOpen(false);
        }}
        onCancel={() => {
          setPinOpen(false);
          handleBack();
        }}
      />

      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-client-primary">{t("staff.profile.paymentSettings")}</h1>
      </header>

      {unlocked && (
        <main className="flex-1 space-y-4 p-5 pb-10">
          <StaffPaymentSettingsForm venueId={venueId} />
        </main>
      )}
    </div>
  );
}
