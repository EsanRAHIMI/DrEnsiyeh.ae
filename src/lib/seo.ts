import type { Metadata } from "next";
import { LOCALES, LOCALE_META, indexedLocales, type Locale } from "@/i18n/config";
import { baseUrl, isIndexable } from "./site";

/** Builds canonical + hreflang + OG metadata. Unreviewed locales and non-production deploys are noindex. */
export function pageMetadata(opts: { locale: Locale; path: string; title: string; description: string; image?: string; noindex?: boolean; type?: "website" | "article" }): Metadata {
  const url = `${baseUrl()}/${opts.locale}${opts.path}`;
  const languages: Record<string, string> = {};
  for (const l of indexedLocales()) languages[LOCALE_META[l].htmlLang] = `${baseUrl()}/${l}${opts.path}`;
  languages["x-default"] = `${baseUrl()}/en${opts.path}`;
  const indexable = isIndexable() && LOCALE_META[opts.locale].reviewed && !opts.noindex;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url, languages },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: opts.type ?? "website",
      url,
      title: opts.title,
      description: opts.description,
      siteName: "Dr. Ensiyeh Rahimi",
      locale: LOCALE_META[opts.locale].htmlLang.replace("-", "_"),
      images: opts.image ? [{ url: opts.image }] : [{ url: `${baseUrl()}/og-default.png`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
}

export const allLocales = LOCALES;
