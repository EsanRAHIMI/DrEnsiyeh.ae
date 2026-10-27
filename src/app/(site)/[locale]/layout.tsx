import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Fraunces, Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../../globals.css";
import { LOCALES, LOCALE_META, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBookingBar } from "@/components/MobileBookingBar";
import { ConsentManager } from "@/components/ConsentManager";
import { DemoBanner } from "@/components/DemoBanner";
import { baseUrl } from "@/lib/site";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600"], variable: "--font-plex-arabic", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: { default: "Dr. Ensiyeh Rahimi — Infectious Diseases Specialist in Dubai", template: "%s · Dr. Ensiyeh Rahimi" },
  applicationName: "Dr. Ensiyeh Rahimi",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#fbfaf7", width: "device-width", initialScale: 1 };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const meta = LOCALE_META[locale];
  return (
    <html lang={meta.htmlLang} dir={meta.dir} className={`${fraunces.variable} ${inter.variable} ${plexArabic.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <DemoBanner text={t.demoBanner} />
        <SiteHeader locale={locale} t={t} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} t={t} />
        <MobileBookingBar locale={locale} t={t} />
        <ConsentManager locale={locale} />
      </body>
    </html>
  );
}
