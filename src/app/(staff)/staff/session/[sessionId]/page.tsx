"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { StaffSessionPaymentsDetail } from "@/components/session/StaffSessionPaymentsDetail";

export default function StaffSessionPaymentsPage() {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const openedAt = searchParams.get("openedAt") ?? "";
  const closedAt = searchParams.get("closedAt");
  const titleDate = searchParams.get("date") ?? "—";

  if (!sessionId || !openedAt) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 p-6 text-neutral-400">
        <p className="text-sm">{t("staff.sessionPaymentsDetail.invalidLink")}</p>
        <button
          type="button"
          onClick={() => router.replace("/staff")}
          className="mt-4 text-sm text-client-primary hover:underline"
        >
          {t("staff.sessionPaymentsDetail.backToStaff")}
        </button>
      </div>
    );
  }

  return (
    <StaffSessionPaymentsDetail
      sessionId={sessionId}
      openedAt={openedAt}
      closedAt={closedAt}
      titleDate={titleDate}
      onBack={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.replace("/staff");
        }
      }}
    />
  );
}
