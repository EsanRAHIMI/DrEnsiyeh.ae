import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { MobileMenu } from "./MobileMenu";

export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  const L = (p: string) => `/${locale}${p}`;
  const links = [
    { href: L("/about"), label: t.nav.about },
    { href: L("/services"), label: t.nav.services },
    { href: L("/clinic-visit"), label: t.nav.clinic },
    { href: L("/home-visit"), label: t.nav.home },
    { href: L("/locations"), label: t.nav.locations },
    { href: L("/articles"), label: t.nav.articles },
    { href: L("/contact"), label: t.nav.contact },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-20">
        <Link href={L("")} className="group flex flex-col leading-tight" aria-label={`${t.brand} — home`}>
          <span className="font-display text-lg font-semibold text-ink sm:text-xl">{t.brand}</span>
          <span className="text-[11px] tracking-wide text-muted sm:text-xs">{t.brandSub}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:bg-sage hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={L("/portal")} className="hidden text-[14px] font-medium text-ink-soft hover:text-teal sm:inline">
            {t.nav.login}
          </Link>
          <Link href={L("/book?kind=clinic")} className="btn-primary hidden min-h-10 px-5 text-sm md:inline-flex">
            {t.cta.book}
          </Link>
          <MobileMenu links={[...links, { href: L("/portal"), label: t.nav.login }]} />
        </div>
      </div>
    </header>
  );
}
