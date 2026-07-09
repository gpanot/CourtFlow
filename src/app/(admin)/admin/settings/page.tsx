"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Clock, Loader2, CheckCircle2, Building2, Mail, Settings, Phone } from "lucide-react";
import adminI18n from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { PortalToggle, NotificationEmailEditor } from "@/components/admin/VenueCourtpassSettings";
import { useSessionStore } from "@/stores/session-store";

export const dynamic = "force-dynamic";

type SettingsTab = "settings" | "email-courtpass";

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

interface VenueDetail {
  id: string;
  name: string;
  timezone: string;
  sportType: string;
  portalEnabled: boolean;
  location: string | null;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactZalo: string | null;
  contactLine: string | null;
  settings: {
    notificationEmail?: string | null;
  };
  organization: {
    id: string;
    name: string;
    country: string;
    currency: string;
    paymentRegion?: string;
    legalCompanyName?: string | null;
    registrationNumber?: string | null;
    taxId?: string | null;
    registeredAddress?: string | null;
  } | null;
}

function OrgInfoRow({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  const display = value?.trim() || "—";
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-0.5 py-1 border-b border-neutral-800/50 last:border-0">
      <dt className="text-[11px] text-neutral-500 leading-snug">{label}</dt>
      <dd className={cn("text-[11px] text-neutral-200 leading-snug", multiline ? "whitespace-pre-wrap" : "text-right")}>
        {display}
      </dd>
    </div>
  );
}

export default function GeneralSettingsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [activeTab, setActiveTab] = useState<SettingsTab>("settings");
  const { venueId, setVenueId, venues } = useAdminVenuePicker({ autoSelect: true });
  const { role } = useSessionStore();

  const [venueTimezone, setVenueTimezone] = useState<string>("Asia/Ho_Chi_Minh");
  const [tzSaving, setTzSaving] = useState(false);
  const [tzMsg, setTzMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [venueDetails, setVenueDetails] = useState<VenueDetail[]>([]);

  // Contact fields state
  const [contactLocation, setContactLocation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsApp, setContactWhatsApp] = useState("");
  const [contactZalo, setContactZalo] = useState("");
  const [contactLine, setContactLine] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fetchVenueDetails = useCallback(async () => {
    try {
      const data = await api.get<VenueDetail[]>("/api/admin/venues");
      setVenueDetails(data);
      const v = venueId ? data.find((x) => x.id === venueId) : undefined;
      if (v) {
        setVenueTimezone(v.timezone ?? "Asia/Ho_Chi_Minh");
        setContactLocation(v.location ?? "");
        setContactPhone(v.contactPhone ?? "");
        setContactWhatsApp(v.contactWhatsApp ?? "");
        setContactZalo(v.contactZalo ?? "");
        setContactLine(v.contactLine ?? "");
      }
    } catch {
      // ignore
    }
  }, [venueId]);

  const selectedVenue = useMemo(
    () => venueDetails.find((v) => v.id === venueId) ?? null,
    [venueDetails, venueId]
  );

  const contactDirty = useMemo(() => {
    if (!selectedVenue) return false;
    const saved = (v: string | null | undefined) => v ?? "";
    return (
      contactLocation !== saved(selectedVenue.location) ||
      contactPhone !== saved(selectedVenue.contactPhone) ||
      contactWhatsApp !== saved(selectedVenue.contactWhatsApp) ||
      contactZalo !== saved(selectedVenue.contactZalo) ||
      contactLine !== saved(selectedVenue.contactLine)
    );
  }, [selectedVenue, contactLocation, contactPhone, contactWhatsApp, contactZalo, contactLine]);

  useEffect(() => {
    void fetchVenueDetails();
    setTzMsg(null);
    setContactMsg(null);
  }, [fetchVenueDetails]);

  useEffect(() => {
    if (contactDirty) setContactMsg(null);
  }, [contactDirty]);

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

  const handleContactSave = async () => {
    if (!venueId) return;
    setContactSaving(true);
    setContactMsg(null);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        location: contactLocation.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactWhatsApp: contactWhatsApp.trim() || null,
        contactZalo: contactZalo.trim() || null,
        contactLine: contactLine.trim() || null,
      });
      setContactMsg({ type: "ok", text: t("settings.contactSaved") });
      await fetchVenueDetails();
    } catch (e) {
      setContactMsg({ type: "err", text: (e as Error).message });
    } finally {
      setContactSaving(false);
    }
  };

  // Group timezones by region for the select
  const regionOrder = ["Asia", "Europe", "Americas", "Oceania", "Other"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl flex items-center gap-2">
          <Settings className="h-6 w-6 text-purple-400" />
          {t("settings.title")}
        </h2>
        <AdminVenuePicker
          venueId={venueId}
          venues={venues}
          onChange={(id) => { setVenueId(id); setTzMsg(null); setContactMsg(null); }}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between border-b border-neutral-800">
        <div className="flex gap-1">
          {([
            { key: "settings" as const, label: t("settings.tabSettings"), icon: Settings },
            { key: "email-courtpass" as const, label: t("settings.tabEmailCourtpass"), icon: Mail },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-purple-500 text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl">
      {activeTab === "settings" && (
      <div className="space-y-8">
        {/* Venue Contact & Location section */}
        {venueId && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">{t("settings.venueContactTitle")}</h2>
            </div>
            <p className="mb-4 text-xs text-neutral-400">{t("settings.venueContactDesc")}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">{t("settings.locationLabel")}</label>
                <input
                  type="text"
                  value={contactLocation}
                  onChange={(e) => setContactLocation(e.target.value)}
                  placeholder={t("venues.locationPlaceholder")}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">{t("settings.phoneLabel")}</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder={t("venues.contactPhonePlaceholder")}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={contactWhatsApp}
                  onChange={(e) => setContactWhatsApp(e.target.value)}
                  placeholder={t("venues.contactWhatsAppPlaceholder")}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Zalo</label>
                <input
                  type="text"
                  value={contactZalo}
                  onChange={(e) => setContactZalo(e.target.value)}
                  placeholder={t("venues.contactZaloPlaceholder")}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Line</label>
                <input
                  type="text"
                  value={contactLine}
                  onChange={(e) => setContactLine(e.target.value)}
                  placeholder={t("venues.contactLinePlaceholder")}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {(contactDirty || contactSaving || contactMsg) && (
                <div className="flex items-center gap-3 pt-1">
                  {(contactDirty || contactSaving) && (
                    <button
                      type="button"
                      onClick={() => void handleContactSave()}
                      disabled={contactSaving}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2"
                    >
                      {contactSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("settings.saveContact")}
                    </button>
                  )}
                  {contactMsg && (
                    <div className={cn("flex items-center gap-1.5 text-xs", contactMsg.type === "ok" ? "text-emerald-400" : "text-red-400")}>
                      {contactMsg.type === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {contactMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
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

        {/* Organization section — read-only, role-scoped */}
        {venueId && selectedVenue && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-purple-400 shrink-0" />
              <h2 className="text-sm font-semibold text-white">
                {role === "superadmin" ? t("settings.organizationTitle") : t("settings.yourOrganization")}
              </h2>
            </div>
            {selectedVenue.organization ? (
              <>
                <dl>
                  <OrgInfoRow label={t("settings.orgName")} value={selectedVenue.organization.name} />
                  <OrgInfoRow
                    label={t("settings.orgCountry")}
                    value={`${COUNTRIES_MAP[selectedVenue.organization.country]?.flag ?? ""} ${COUNTRIES_MAP[selectedVenue.organization.country]?.name ?? selectedVenue.organization.country}`.trim()}
                  />
                  <OrgInfoRow label={t("settings.orgCurrency")} value={selectedVenue.organization.currency} />
                  <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 py-1 border-b border-neutral-800/50">
                    <dt className="text-[11px] text-neutral-500 leading-snug">{t("settings.orgPaymentRegion")}</dt>
                    <dd className="text-right">
                      <span className="rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-300">
                        {selectedVenue.organization.paymentRegion ?? PAYMENT_REGION_MAP[selectedVenue.organization.country] ?? "OTHER"}
                      </span>
                    </dd>
                  </div>
                  <div className="pt-2 pb-0.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                      {t("settings.orgLegalEntity")}
                    </p>
                  </div>
                  <OrgInfoRow label={t("settings.orgLegalCompanyName")} value={selectedVenue.organization.legalCompanyName} />
                  <OrgInfoRow label={t("settings.orgRegistrationNumber")} value={selectedVenue.organization.registrationNumber} />
                  <OrgInfoRow label={t("settings.orgTaxId")} value={selectedVenue.organization.taxId} />
                  <OrgInfoRow label={t("settings.orgRegisteredAddress")} value={selectedVenue.organization.registeredAddress} multiline />
                </dl>
                {role === "superadmin" && (
                  <Link
                    href="/admin/organizations"
                    className="mt-2 inline-block text-[11px] text-purple-400 hover:text-purple-300"
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
      )}

      {activeTab === "email-courtpass" && (
        <div className="space-y-6">
          {!venueId ? (
            <p className="text-sm text-neutral-500">{t("settings.selectVenueFirst")}</p>
          ) : !selectedVenue ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading", { defaultValue: "Loading..." })}
            </div>
          ) : (
            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-8">
              <PortalToggle
                venueId={venueId}
                enabled={selectedVenue.portalEnabled}
                onRefresh={fetchVenueDetails}
              />
              <NotificationEmailEditor
                venueId={venueId}
                current={selectedVenue.settings?.notificationEmail ?? null}
                onRefresh={fetchVenueDetails}
              />
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

