import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import tvEn from "./locales/tv/en.json";
import tvVi from "./locales/tv/vi.json";
import staffEn from "./locales/staff/en.json";
import staffVi from "./locales/staff/vi.json";

export const STAFF_I18N_STORAGE_KEY = "courtflow_staff_lang";

function mergeDeep(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(overlay)) {
    const bv = base[k];
    const ov = overlay[k];
    if (
      ov !== null &&
      typeof ov === "object" &&
      !Array.isArray(ov) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      out[k] = mergeDeep(bv as Record<string, unknown>, ov as Record<string, unknown>);
    } else {
      out[k] = ov;
    }
  }
  return out;
}

export const staffI18n = i18next.createInstance();

if (!staffI18n.isInitialized) {
  staffI18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: {
          translation: mergeDeep(
            { ...tvEn } as Record<string, unknown>,
            { ...staffEn } as Record<string, unknown>
          ) as typeof tvEn & typeof staffEn,
        },
        vi: {
          translation: mergeDeep(
            { ...tvVi } as Record<string, unknown>,
            { ...staffVi } as Record<string, unknown>
          ) as typeof tvVi & typeof staffVi,
        },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "vi"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage"],
        caches: ["localStorage"],
        lookupLocalStorage: STAFF_I18N_STORAGE_KEY,
      },
      react: { useSuspense: false },
    });
}

export default staffI18n;
