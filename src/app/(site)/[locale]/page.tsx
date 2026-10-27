import Link from "next/link";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary, pickLocalized } from "@/i18n/dictionaries";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { PROFILE } from "@/content/profile";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { JsonLd } from "@/components/JsonLd";
import { IconArrow, IconCalendar, IconCheck, IconClinic, IconGlobe, IconHome, IconLock, IconShield } from "@/components/icons";
import { physicianJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { getCatalog, getPublicFacilities } from "@/server/catalog";
import { formatMoney } from "@/lib/money";
import { SERVICE_AREAS } from "@/content/service-areas";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata({
    locale,
    path: "",
    title: "Dr. Ensiyeh Rahimi — Infectious Diseases Specialist in Dubai",
    description:
      "Specialist assessment and care for complex, recurrent, persistent and travel-related infections in Dubai. See clinic times and prices and book online.",
  });
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale: l } = await params;
  if (!isLocale(l)) notFound();
  const locale: Locale = l;
  const t = getDictionary(locale);
  const [catalog, facilities] = await Promise.all([getCatalog().catch(() => []), getPublicFacilities().catch(() => [])]);
  const fromPrice = (kind: "clinic" | "home_visit") => {
    const prices = catalog.filter((r) => r.service.kind === kind).map((r) => r.offering.priceMinor);
    return prices.length ? Math.min(...prices) : null;
  };
  const clinicFrom = fromPrice("clinic");
  const homeFrom = fromPrice("home_visit");

  return (
    <>
      <JsonLd data={[physicianJsonLd(facilities), websiteJsonLd()]} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -end-40 -top-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--color-teal-tint),transparent)]" />
        <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div className="fade-up">
            <p className="eyebrow">{PROFILE.title.value} · Dubai</p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.05] font-medium text-ink sm:text-6xl lg:text-[4.25rem]">
              Clear answers for <em className="text-teal not-italic">complex infections</em>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              {PROFILE.name.value} is an infectious diseases specialist seeing patients in Dubai — for infections that keep coming back,
              fevers without a clear cause, travel-related illness and infections that have not responded to treatment.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={`/${locale}/book?kind=clinic`} className="btn-primary">
                <IconClinic className="size-5" /> {t.cta.bookClinic}
              </Link>
              <Link href={`/${locale}/book?kind=home_visit`} className="btn-secondary">
                <IconHome className="size-5" /> {t.cta.bookHome}
              </Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-soft">
              <li className="flex items-center gap-2"><IconGlobe className="size-4 text-teal" /> {PROFILE.languages.value.join(" · ")}</li>
              <li className="flex items-center gap-2"><IconCalendar className="size-4 text-teal" /> Live availability</li>
              <li className="flex items-center gap-2"><IconLock className="size-4 text-teal" /> Secure payment & records</li>
            </ul>
          </div>
          <div className="fade-up relative mx-auto w-full max-w-sm [animation-delay:120ms] lg:max-w-none">
            <figure className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal to-ink shadow-[var(--shadow-lift)]">
              {/* Approved professional photograph to be placed here once usage rights are confirmed (docs/VERIFICATION.md). */}
              <div className="absolute inset-0 grid place-items-center">
                <span className="font-display text-[7rem] leading-none text-white/90">ER</span>
              </div>
              <figcaption className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-4 backdrop-blur">
                <p className="font-display text-lg text-ink">{PROFILE.name.value}</p>
                <p className="text-sm text-ink-soft">{PROFILE.title.value}</p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Two primary services */}
      <section aria-labelledby="ways" className="container-page">
        <h2 id="ways" className="sr-only">Ways to see the doctor</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <ServiceCard
            href={`/${locale}/clinic-visit`}
            bookHref={`/${locale}/book?kind=clinic`}
            icon={<IconClinic className="size-6" />}
            title={t.booking.clinic}
            body="Consultations at an approved Dubai facility, with clear pricing and instant time selection."
            price={clinicFrom}
            cta={t.cta.bookClinic}
          />
          <ServiceCard
            href={`/${locale}/home-visit`}
            bookHref={`/${locale}/book?kind=home_visit`}
            icon={<IconHome className="size-6" />}
            title={t.booking.home}
            body="A scheduled, non-emergency specialist visit at your home within the approved service area."
            price={homeFrom}
            cta={t.cta.bookHome}
            tone="sand"
          />
        </div>
      </section>

      {/* Areas of focus */}
      <section aria-labelledby="focus" className="container-page mt-24">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Areas of focus</p>
            <h2 id="focus" className="mt-3 text-3xl text-ink sm:text-4xl">When to see an infectious diseases specialist</h2>
          </div>
          <Link href={`/${locale}/services`} className="btn-ghost self-start sm:self-auto">
            All services <IconArrow className="size-4" />
          </Link>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_AREAS.map((a) => (
            <li key={a.slug}>
              <Link href={`/${locale}/services/${a.slug}`} className="card group flex h-full flex-col p-6 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <h3 className="text-xl text-ink">{a.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">{a.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">
                  Learn more <IconArrow className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* How booking works */}
      <section aria-labelledby="how" className="mt-24 bg-sage py-20">
        <div className="container-page">
          <p className="eyebrow">Booking</p>
          <h2 id="how" className="mt-3 max-w-2xl text-3xl text-ink sm:text-4xl">Book in a few minutes — no account needed to start</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              ["Choose", "Clinic consultation or home visit, and see the price upfront."],
              ["Pick a time", "Real availability, updated as others book."],
              ["Confirm", "Add your details and pay securely, or send a request where payment is at the facility."],
              ["Manage", "Your secure patient account is created automatically — sign in with a one-time code."],
            ].map(([title, body], i) => (
              <li key={title} className="relative">
                <span className="font-display text-5xl text-teal/25">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 text-lg font-semibold text-ink">{title}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section aria-labelledby="trust" className="container-page mt-24 grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">About the doctor</p>
          <h2 id="trust" className="mt-3 text-3xl text-ink sm:text-4xl">Specialist care, explained clearly</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            {PROFILE.name.value} is a {PROFILE.title.value.toLowerCase()} whose clinical interests span respiratory, urinary, skin and soft-tissue
            infections, tuberculosis, viral hepatitis, HIV, fungal infections, travel medicine and responsible antibiotic use.
          </p>
          <Link href={`/${locale}/about`} className="btn-secondary mt-8">
            About {PROFILE.name.value} <IconArrow className="size-4" />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            [IconShield, "Verified information", "Credentials shown here are checked against official sources before publication."],
            [IconLock, "Private by design", "No health information is shared with advertisers. Records are encrypted."],
            [IconCalendar, "Transparent booking", "Prices, policies and times are visible before you share any details."],
            [IconCheck, "Medically reviewed", "Articles are written or reviewed by the doctor and dated."],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof IconShield;
            return (
              <li key={title as string} className="card p-5">
                <I className="size-6 text-teal" />
                <p className="mt-3 font-semibold text-ink">{title as string}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body as string}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="container-page mt-20">
        <EmergencyNotice t={t} />
      </section>

      {catalog.length > 0 && (
        <section className="container-page mt-20" aria-labelledby="prices">
          <h2 id="prices" className="text-2xl text-ink">Consultation prices</h2>
          <ul className="mt-6 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
            {catalog.map((r) => (
              <li key={r.offering.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="font-medium text-ink">{pickLocalized(r.service.name, locale)}</span>
                  <span className="block text-sm text-muted">
                    {r.facility?.name ?? "At your home"} · {r.offering.durationMinutes ?? r.service.durationMinutes} {t.booking.minutes}
                  </span>
                </span>
                <span className="font-semibold text-ink tabular-nums">{formatMoney(r.offering.priceMinor, r.offering.currency, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ServiceCard(props: { href: string; bookHref: string; icon: React.ReactNode; title: string; body: string; price: number | null; cta: string; tone?: "sand" }) {
  return (
    <article className={`card relative flex flex-col p-7 sm:p-9 ${props.tone === "sand" ? "bg-sand" : ""}`}>
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-teal-tint text-teal">{props.icon}</span>
      <h3 className="mt-6 text-2xl text-ink">
        <Link href={props.href} className="after:absolute after:inset-0">{props.title}</Link>
      </h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">{props.body}</p>
      <div className="relative z-10 mt-7 flex items-center justify-between gap-4">
        {props.price !== null ? <span className="text-sm text-ink-soft">From <strong className="text-ink">{formatMoney(props.price)}</strong></span> : <span />}
        <Link href={props.bookHref} className="btn-primary min-h-11 px-5 text-sm">{props.cta}</Link>
      </div>
    </article>
  );
}
