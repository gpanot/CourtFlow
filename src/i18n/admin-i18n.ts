import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import adminEn from "./locales/admin/en.json";
import adminVi from "./locales/admin/vi.json";

export const ADMIN_I18N_STORAGE_KEY = "courtflow_admin_lang";

export const adminI18n = i18next.createInstance();

if (!adminI18n.isInitialized) {
  adminI18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: adminEn },
        vi: { translation: adminVi },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "vi"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage"],
        caches: ["localStorage"],
        lookupLocalStorage: ADMIN_I18N_STORAGE_KEY,
      },
      react: { useSuspense: false },
    });
}

export default adminI18n;
