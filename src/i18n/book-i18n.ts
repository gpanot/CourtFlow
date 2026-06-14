import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/book/en.json";
import vi from "./locales/book/vi.json";
import th from "./locales/book/th.json";

export const BOOK_I18N_STORAGE_KEY = "courtflow_book_lang";

export const BOOK_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ภาษาไทย" },
] as const;

export type BookLanguageCode = (typeof BOOK_LANGUAGES)[number]["code"];

const SUPPORTED = new Set<string>(BOOK_LANGUAGES.map((l) => l.code));

function normalizeLang(code: string | null | undefined): BookLanguageCode {
  const base = code?.slice(0, 2) ?? "vi";
  return (SUPPORTED.has(base) ? base : "vi") as BookLanguageCode;
}

if (!i18n.isInitialized) {
  // Always start with vi so SSR and the first client paint match (localStorage is applied after mount).
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
      th: { translation: th },
    },
    lng: "vi",
    fallbackLng: "vi",
    supportedLngs: ["en", "vi", "th"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function getStoredBookLanguage(): BookLanguageCode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(BOOK_I18N_STORAGE_KEY);
  if (!stored) return null;
  return normalizeLang(stored);
}

/** Apply language saved in localStorage — call once after mount on the client. */
export async function applyStoredBookLanguage(): Promise<void> {
  const stored = getStoredBookLanguage();
  if (stored && stored !== normalizeLang(i18n.language)) {
    await i18n.changeLanguage(stored);
  }
}

/** Switch language and persist for next visit. */
export async function persistBookLanguage(code: BookLanguageCode): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.setItem(BOOK_I18N_STORAGE_KEY, code);
  }
  await i18n.changeLanguage(code);
}

export default i18n;
