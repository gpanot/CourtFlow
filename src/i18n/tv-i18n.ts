import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/tv/en.json";
import vi from "./locales/tv/vi.json";

export type TvLocale = "en" | "vi";

export const tvI18n = i18next.createInstance();

if (!tvI18n.isInitialized) {
  tvI18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "vi"],
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function resolveTvLocale(value: unknown): TvLocale {
  return value === "vi" ? "vi" : "en";
}
