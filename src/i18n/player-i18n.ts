import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/player/en.json";
import vi from "./locales/player/vi.json";

export const PLAYER_I18N_STORAGE_KEY = "courtflow_player_lang";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        vi: { translation: vi },
      },
      fallbackLng: "vi",
      supportedLngs: ["en", "vi"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage"],
        caches: ["localStorage"],
        lookupLocalStorage: PLAYER_I18N_STORAGE_KEY,
      },
    });
}

export default i18n;
