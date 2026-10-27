import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { EmergencyNotice } from "@/components/EmergencyNotice";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/contact", title: "Contact", description: "How to reach the practice of Dr. Ensiyeh Rahimi for appointments and general enquiries." });
}

export default async function Contact({ params }: PageProps<"/[locale]/contact">) {
  const { locale, t } = await localeFrom(params);
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const wa = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
  return (
    <>
      <PageHero title="Contact" intro="The fastest way to get an appointment is to book online. For questions about an existing appointment, sign in to your patient account." crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.contact, href: `/${locale}/contact` }]} />
      <div className="container-page grid gap-6 py-14 md:grid-cols-3">
        <div className="card p-6">
          <h2 className="text-xl text-ink">Book online</h2>
          <p className="mt-2 text-sm text-ink-soft">Live availability and transparent prices.</p>
          <Link href={`/${locale}/book`} className="btn-primary mt-5 w-full">{t.cta.book}</Link>
        </div>
        <div className="card p-6">
          <h2 className="text-xl text-ink">Existing appointment</h2>
          <p className="mt-2 text-sm text-ink-soft">Reschedule, cancel or send a secure message from your account.</p>
          <Link href={`/${locale}/portal`} className="btn-secondary mt-5 w-full">{t.nav.login}</Link>
        </div>
        <div className="card p-6">
          <h2 className="text-xl text-ink">General enquiries</h2>
          <p className="mt-2 text-sm text-ink-soft">Please don&apos;t include medical details in email or WhatsApp.</p>
          <div className="mt-5 space-y-2 text-sm">
            {email ? <a className="block font-medium text-teal underline" href={`mailto:${email}`}>{email}</a> : <p className="text-muted">Email address to be confirmed.</p>}
            {wa && <a className="block font-medium text-teal underline" href={`https://wa.me/${wa.replace(/\D/g, "")}`} rel="noopener">WhatsApp</a>}
          </div>
        </div>
        <div className="md:col-span-3"><EmergencyNotice t={t} /></div>
      </div>
    </>
  );
}
