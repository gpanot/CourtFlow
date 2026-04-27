"use client";

import { useClientConfig } from "@/config/use-client-config";
import { ProfileCourtPay } from "@/components/profile/ProfileCourtPay";

export default function StaffProfilePage() {
  const clientConfig = useClientConfig();

  return (
    <div
      className="flex min-h-dvh flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] text-white"
      style={{ ["--client-primary" as string]: clientConfig.primaryColor }}
    >
      <ProfileCourtPay legacyTab="profile" variant="page" />
    </div>
  );
}
