import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LOCALES, LOCALE_META } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const L = (p: string) => `/${locale}${p}`;
  const cols = [
    {
      title: "Care",
      links: [
        [L("/services"), t.nav.services],
        [L("/clinic-visit"), t.nav.clinic],
        [L("/home-visit"), t.nav.home],
        [L("/locations"), t.nav.locations],
        [L("/book"), t.cta.book],
      ],
    },
    {
      title: "Patients",
      links: [
        [L("/patient-information"), t.nav.patientInfo],
        [L("/faq"), t.nav.faq],
        [L("/articles"), t.nav.articles],
        [L("/portal"), t.nav.login],
        [L("/contact"), t.nav.contact],
      ],
    },
    {
      title: t.footer.legal,
      links: [
        [L("/legal/privacy"), "Privacy policy"],
        [L("/legal/terms"), "Terms of service"],
        [L("/legal/cancellation-refund"), "Cancellation & refunds"],
        [L("/legal/medical-disclaimer"), "Medical disclaimer"],
        [L("/legal/cookies"), "Cookie preferences"],
        [L("/legal/accessibility"), "Accessibility"],
      ],
    },
  ];
  return (
    <footer className="mt-24 border-t border-line bg-ink pb-28 text-white/80 md:pb-0">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-xl text-white">{t.brand}</p>
          <p className="mt-1 text-sm text-white/70">{t.brandSub}</p>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-white/70">{t.footer.disclaimer}</p>
          <p className="mt-4 text-sm text-white/70">Emergency: <a className="font-semibold text-white underline" href="tel:998">998</a></p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {t.brand}. {t.footer.rights}</p>
          <ul className="flex gap-4" aria-label="Language">
            {LOCALES.map((l) => (
              <li key={l}>
                <Link href={`/${l}`} hrefLang={l} lang={l} className={l === locale ? "text-white" : "hover:text-white"}>
                  {LOCALE_META[l].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
