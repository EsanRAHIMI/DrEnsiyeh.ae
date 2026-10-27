export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/**
 * A locale is only indexed (sitemap, hreflang, robots) once a qualified medical translator
 * has reviewed it. Unreviewed locales render with noindex.
 */
export const LOCALE_META: Record<Locale, { dir: "ltr" | "rtl"; label: string; reviewed: boolean; htmlLang: string }> = {
  en: { dir: "ltr", label: "English", reviewed: true, htmlLang: "en-AE" },
  ar: { dir: "rtl", label: "العربية", reviewed: false, htmlLang: "ar-AE" },
};

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

export const indexedLocales = () => LOCALES.filter((l) => LOCALE_META[l].reviewed);
