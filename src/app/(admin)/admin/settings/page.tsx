"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Globe, Clock, Check, Loader2, CheckCircle2, Building2 } from "lucide-react";
import adminI18n, { ADMIN_I18N_STORAGE_KEY } from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { useSessionStore } from "@/stores/session-store";

export const dynamic = "force-dynamic";

type Language = "en" | "vi";

// Must stay in sync with the server-side SUPPORTED_TIMEZONES list
const TIMEZONE_OPTIONS: { value: string; label: string; region: string }[] = [
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (UTC+7)", region: "Asia" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+7)", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)", region: "Asia" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (UTC+8)", region: "Asia" },
  { value: "Asia/Jakarta", label: "Jakarta (UTC+7)", region: "Asia" },
  { value: "Asia/Manila", label: "Manila (UTC+8)", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai / Beijing (UTC+8)", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)", region: "Asia" },
  { value: "Asia/Seoul", label: "Seoul (UTC+9)", region: "Asia" },
  { value: "Asia/Kolkata", label: "India (UTC+5:30)", region: "Asia" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)", region: "Asia" },
  { value: "Europe/London", label: "London (UTC+0/+1)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (UTC+1/+2)", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (UTC+1/+2)", region: "Europe" },
  { value: "America/New_York", label: "New York (UTC-5/-4)", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (UTC-6/-5)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)", region: "Americas" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)", region: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland (UTC+12/+13)", region: "Oceania" },
  { value: "UTC", label: "UTC (UTC+0)", region: "Other" },
];

const SPORT_ICONS: Record<string, string> = {
  pickleball: "🏓",
  padel: "🎾",
  tennis: "🎾",
  badminton: "🏸",
  golf: "⛳",
};

const PAYMENT_REGION_MAP: Record<string, string> = {
  VN: "SEA", TH: "SEA", SG: "SEA", MY: "SEA", PH: "SEA",
  FR: "EU",  ES: "EU",  DE: "EU",
  AU: "ANZ", NZ: "ANZ",
};

const COUNTRIES_MAP: Record<string, { name: string; flag: string }> = {
  VN: { name: "Vietnam", flag: "🇻🇳" },
  TH: { name: "Thailand", flag: "🇹🇭" },
  SG: { name: "Singapore", flag: "🇸🇬" },
  MY: { name: "Malaysia", flag: "🇲🇾" },
  PH: { name: "Philippines", flag: "🇵🇭" },
  FR: { name: "France", flag: "🇫🇷" },
  ES: { name: "Spain", flag: "🇪🇸" },
  DE: { name: "Germany", flag: "🇩🇪" },
  AU: { name: "Australia", flag: "🇦🇺" },
  NZ: { name: "New Zealand", flag: "🇳🇿" },
};

interface VenueBasic {
  id: string;
  name: string;
  timezone: string;
}

interface VenueDetail {
  id: string;
  name: string;
  timezone: string;
  sportType: string;
  organization: {
    id: string;
    name: string;
    country: string;
    currency: string;
    paymentRegion?: string;
  } | null;
}

export default function GeneralSettingsPage() {
  const { t, i18n } = useTranslation("translation", { i18n: adminI18n });
  const [currentLang, setCurrentLang] = useState<Language>("en");
  const { venueId, setVenueId, venues } = useAdminVenuePicker({ autoSelect: true });
  const { role } = useSessionStore();

  const [venueTimezone, setVenueTimezone] = useState<string>("Asia/Ho_Chi_Minh");
  const [tzSaving, setTzSaving] = useState(false);
  const [tzMsg, setTzMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [venueDetails, setVenueDetails] = useState<VenueDetail[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_I18N_STORAGE_KEY);
    setCurrentLang((stored === "vi" ? "vi" : "en") as Language);
  }, []);

  const fetchVenueTimezone = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<VenueDetail[]>("/api/admin/venues");
      setVenueDetails(data);
      const v = data.find((x) => x.id === venueId);
      if (v) setVenueTimezone(v.timezone ?? "Asia/Ho_Chi_Minh");
    } catch {
      // ignore
    }
  }, [venueId]);

  const selectedVenue = useMemo(
    () => venueDetails.find((v) => v.id === venueId) ?? null,
    [venueDetails, venueId]
  );

  useEffect(() => {
    void fetchVenueTimezone();
    setTzMsg(null);
  }, [fetchVenueTimezone]);

  const handleLanguageChange = (lang: Language) => {
    setCurrentLang(lang);
    void i18n.changeLanguage(lang);
    localStorage.setItem(ADMIN_I18N_STORAGE_KEY, lang);
  };

  const handleTimezoneChange = async (tz: string) => {
    if (!venueId || tz === venueTimezone) return;
    setTzSaving(true);
    setTzMsg(null);
    const prev = venueTimezone;
    setVenueTimezone(tz);
    try {
      await api.put(`/api/admin/venues/${venueId}/timezone`, { timezone: tz });
      setTzMsg({ type: "ok", text: t("settings.timezoneSaved") });
    } catch (e) {
      setVenueTimezone(prev);
      setTzMsg({ type: "err", text: (e as Error).message });
    } finally {
      setTzSaving(false);
    }
  };

  // Group timezones by region for the select
  const regionOrder = ["Asia", "Europe", "Americas", "Oceania", "Other"];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold md:text-2xl">{t("settings.title")}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        <button
          type="button"
          className="border-b-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-400"
        >
          {t("settings.tabSettings")}
        </button>
      </div>

      <div className="space-y-8">
        {/* Language section */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">{t("settings.languageTitle")}</h2>
          </div>
          <p className="mb-4 text-xs text-neutral-400">{t("settings.languageDescription")}</p>

          <div className="flex gap-3">
            <LanguageButton
              label={t("settings.english")}
              sublabel="English"
              active={currentLang === "en"}
              onClick={() => handleLanguageChange("en")}
            />
            <LanguageButton
              label={t("settings.vietnamese")}
              sublabel="Tiếng Việt"
              active={currentLang === "vi"}
              onClick={() => handleLanguageChange("vi")}
            />
          </div>
        </section>

        {/* Organization section — read-only, role-scoped */}
        {venueId && selectedVenue && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">
                {role === "superadmin" ? t("settings.organizationTitle") : t("settings.yourOrganization")}
              </h2>
            </div>
            {selectedVenue.organization ? (
              <>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">{t("settings.orgName")}</dt>
                    <dd className="text-white">{selectedVenue.organization.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">{t("settings.orgCountry")}</dt>
                    <dd className="text-white">
                      {COUNTRIES_MAP[selectedVenue.organization.country]?.flag ?? ""}{" "}
                      {COUNTRIES_MAP[selectedVenue.organization.country]?.name ?? selectedVenue.organization.country}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">{t("settings.orgCurrency")}</dt>
                    <dd className="text-white">{selectedVenue.organization.currency}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-400">{t("settings.orgPaymentRegion")}</dt>
                    <dd>
                      <span className="rounded-full bg-neutral-700/50 px-2 py-0.5 text-xs text-neutral-300">
                        {selectedVenue.organization.paymentRegion ?? PAYMENT_REGION_MAP[selectedVenue.organization.country] ?? "OTHER"}
                      </span>
                    </dd>
                  </div>
                </dl>
                {role === "superadmin" && (
                  <Link
                    href="/admin/organizations"
                    className="mt-3 inline-block text-xs text-purple-400 hover:text-purple-300"
                  >
                    {t("settings.manageOrganizations")}
                  </Link>
                )}
              </>
            ) : (
              <p className="text-xs text-neutral-500">
                {role === "superadmin" ? (
                  <>{t("settings.noOrgLinked")}{" "}<Link href="/admin/organizations" className="text-purple-400 hover:text-purple-300">{t("settings.linkOrgInPage")}</Link></>
                ) : (
                  t("settings.contactAdminForOrg")
                )}
              </p>
            )}
          </section>
        )}

        {/* Timezone section */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">{t("settings.venueTimezoneTitle")}</h2>
          </div>
          <p className="mb-4 text-xs text-neutral-400">
            {t("settings.venueTimezoneDesc")}
          </p>

          {/* Venue picker */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">{t("settings.venueLabel")}</label>
            <AdminVenuePicker
              venueId={venueId}
              venues={venues}
              onChange={(id) => { setVenueId(id); setTzMsg(null); }}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none w-full max-w-xs"
            />
          </div>

          {venueId && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">{t("settings.timezoneLabel")}</label>
              <div className="relative max-w-xs">
                <select
                  value={venueTimezone}
                  onChange={(e) => void handleTimezoneChange(e.target.value)}
                  disabled={tzSaving}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none appearance-none pr-8 disabled:opacity-60"
                >
                  {regionOrder.map((region) => {
                    const opts = TIMEZONE_OPTIONS.filter((tz) => tz.region === region);
                    if (!opts.length) return null;
                    return (
                      <optgroup key={region} label={region}>
                        {opts.map((tz) => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                  {tzSaving
                    ? <Loader2 className="h-3.5 w-3.5 text-neutral-400 animate-spin" />
                    : <span className="text-neutral-500 text-xs">▼</span>
                  }
                </div>
              </div>

              {tzMsg && (
                <div className={cn("mt-2 flex items-center gap-1.5 text-xs", tzMsg.type === "ok" ? "text-emerald-400" : "text-red-400")}>
                  {tzMsg.type === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {tzMsg.text}
                </div>
              )}

              <p className="mt-3 text-[11px] text-neutral-600">
                {t("settings.currentSelection")} <span className="font-mono text-neutral-400">{venueTimezone}</span>
              </p>
            </div>
          )}
        </section>

        {/* Venue Details section */}
        {venueId && selectedVenue && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">{SPORT_ICONS[selectedVenue.sportType] ?? "🏟️"}</span>
              <h2 className="text-sm font-semibold text-white">{t("settings.venueDetailsTitle")}</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-400">{t("settings.sportLabel")}</dt>
                <dd className="text-white capitalize">{selectedVenue.sportType}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-neutral-600">
              {t("settings.editSportHint")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function LanguageButton({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all w-44",
        active
          ? "border-purple-500 bg-purple-600/10"
          : "border-neutral-700 bg-neutral-800 hover:border-neutral-600 hover:bg-neutral-700"
      )}
    >
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600">
          <Check className="h-2.5 w-2.5 text-white" />
        </span>
      )}
      <div>
        <p className={cn("text-sm font-medium", active ? "text-purple-300" : "text-neutral-200")}>
          {label}
        </p>
        <p className="text-xs text-neutral-500">{sublabel}</p>
      </div>
    </button>
  );
}
