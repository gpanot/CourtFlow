"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffLanguageToggle } from "../staff-language-toggle";
import { ArrowLeft, User, History, ChevronRight, LogOut, Phone } from "lucide-react";

export default function StaffProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token, staffId, venueId, staffName, staffPhone, setAuth, clearAuth } = useSessionStore();
  const [venueName, setVenueName] = useState<string | undefined>();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!token || !staffId || !venueId) {
      router.replace("/staff");
      return;
    }
    let cancelled = false;
    (async () => {
      const [venueRes, meRes] = await Promise.allSettled([
        api.get<{ name: string }>(`/api/venues/${venueId}`),
        api.get<{ name: string; phone: string }>("/api/auth/staff-me"),
      ]);
      if (cancelled) return;
      if (venueRes.status === "fulfilled") setVenueName(venueRes.value.name);
      else setVenueName(undefined);
      if (meRes.status === "fulfilled") {
        setAuth({ staffName: meRes.value.name, staffPhone: meRes.value.phone });
      }
      setProfileLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, staffId, venueId, router, setAuth]);

  const displayName = staffName?.trim() || t("staff.profile.staffFallback");
  const displayPhone = (staffPhone ?? "").trim() || "—";

  if (!token || !staffId || !venueId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (confirmLogout) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6"
        onClick={() => setConfirmLogout(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-red-600/20 p-3">
              <LogOut className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white">{t("staff.profile.logOutConfirmTitle")}</h3>
            <p className="text-sm text-neutral-400">{t("staff.profile.logOutConfirmBody")}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => clearAuth()}
              className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
            >
              {t("staff.profile.yesLogOut")}
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {t("staff.dashboard.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-white">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/staff")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-blue-500">{t("staff.profile.title")}</h1>
      </header>

      <main className="flex-1 space-y-6 p-5 pb-10">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
            <User className="h-7 w-7 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2.5">
              <div>
                <p className="text-xs font-medium text-neutral-500">{t("staff.profile.nameLabel")}</p>
                <p className="text-sm font-semibold text-white truncate mt-0.5">
                  {!profileLoaded ? "…" : displayName}
                </p>
              </div>
              <div className="border-t border-neutral-800 pt-2.5">
                <p className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
                  <Phone className="h-3 w-3 opacity-70" aria-hidden />
                  {t("staff.profile.phoneLabel")}
                </p>
                <p className="text-sm font-medium text-neutral-200 mt-0.5 tabular-nums">
                  {!profileLoaded ? "…" : displayPhone}
                </p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              {venueName ?? (profileLoaded ? t("staff.profile.noVenue") : "…")}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm font-medium text-neutral-200">{t("staff.profile.language")}</span>
          <StaffLanguageToggle />
        </div>

        <button
          type="button"
          onClick={() => router.push("/staff?history=1")}
          className="flex w-full items-center justify-between rounded-xl bg-neutral-800 px-4 py-3.5 hover:bg-neutral-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-blue-400" />
            <div className="text-left">
              <span className="font-medium text-neutral-200 block">{t("staff.profile.sessionHistory")}</span>
              <span className="text-xs text-neutral-500">{t("staff.profile.sessionHistoryDesc")}</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-neutral-500 shrink-0" />
        </button>

        <p className="text-xs text-neutral-500">{t("staff.profile.sharedDeviceHint")}</p>

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/15 py-3.5 font-medium text-red-400 hover:bg-red-600/25 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          {t("staff.profile.logOut")}
        </button>
      </main>
    </div>
  );
}
