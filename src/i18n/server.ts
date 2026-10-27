import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

export async function localeFrom(params: Promise<{ locale: string }>): Promise<{ locale: Locale; t: ReturnType<typeof getDictionary> }> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, t: getDictionary(locale) };
}
