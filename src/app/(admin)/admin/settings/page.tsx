"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import adminI18n, { ADMIN_I18N_STORAGE_KEY } from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Language = "en" | "vi";

export default function GeneralSettingsPage() {
  const { t, i18n } = useTranslation("translation", { i18n: adminI18n });
  const [currentLang, setCurrentLang] = useState<Language>("en");

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_I18N_STORAGE_KEY);
    setCurrentLang((stored === "vi" ? "vi" : "en") as Language);
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setCurrentLang(lang);
    void i18n.changeLanguage(lang);
    localStorage.setItem(ADMIN_I18N_STORAGE_KEY, lang);
  };

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

      {/* Settings tab content */}
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
