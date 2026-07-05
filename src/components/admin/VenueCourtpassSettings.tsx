"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Check, HelpCircle } from "lucide-react";

export function PortalToggle({
  venueId,
  enabled,
  onRefresh,
}: {
  venueId: string;
  enabled: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/venues/${venueId}`, { portalEnabled: !enabled });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
        {t("venues.playerPortal")}
      </h4>
      <label className="flex items-center gap-3 cursor-pointer">
        <button
          onClick={toggle}
          disabled={saving}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-green-600" : "bg-neutral-700"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white transition-transform",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
        <span className="text-sm text-neutral-300">
          {enabled ? t("venues.portalEnabled") : t("venues.portalDisabled")}
        </span>
      </label>
      <p className="text-xs text-neutral-600">
        {t("venues.portalHint")}
      </p>
    </div>
  );
}

export function NotificationEmailEditor({
  venueId,
  current,
  onRefresh,
}: {
  venueId: string;
  current: string | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    setValue(current ?? "");
    setSaved(false);
  }, [current, venueId]);

  const dirty = value.trim() !== (current ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/venues/${venueId}/notification-email`, {
        notificationEmail: value.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          {t("venues.notifEmailTitle")}
        </h4>
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
            onFocus={() => setTooltipOpen(true)}
            onBlur={() => setTooltipOpen(false)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label={t("venues.notifEmailTitle")}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
          {tooltipOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-xs text-neutral-300 shadow-xl">
              <p className="font-medium text-white mb-1">{t("venues.notifEmailTooltipTitle")}</p>
              <ul className="space-y-0.5 list-disc list-inside text-neutral-400">
                <li>{t("venues.notifEmailItem1")}</li>
                <li>{t("venues.notifEmailItem2")}</li>
                <li>{t("venues.notifEmailItem3")}</li>
                <li>{t("venues.notifEmailItem4")}</li>
              </ul>
              <p className="mt-2 text-neutral-500">
                {t("venues.notifEmailFooter")}
              </p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-700" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder={t("venues.notifEmailPlaceholder")}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        />
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 whitespace-nowrap"
          >
            {saving ? t("venues.notifEmailSaving") : t("venues.notifEmailSave")}
          </button>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <Check className="h-4 w-4" /> {t("venues.notifEmailSaved")}
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-600">
        {t("venues.notifEmailHint")}
      </p>
    </div>
  );
}
