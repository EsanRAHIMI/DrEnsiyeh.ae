import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { EmergencyNotice } from "@/components/EmergencyNotice";

export async function generateMetadata({ params }: PageProps<"/[locale]/patient-information">) {
  const { locale } = await localeFrom(params);
  return pageMetadata({ locale, path: "/patient-information", title: "Patient information", description: "Preparing for your appointment, payments, insurance, your patient account and privacy." });
}

export default async function PatientInfo({ params }: PageProps<"/[locale]/patient-information">) {
  const { locale, t } = await localeFrom(params);
  return (
    <>
      <PageHero title="Patient information" crumbs={[{ name: "Home", href: `/${locale}` }, { name: t.nav.patientInfo, href: `/${locale}/patient-information` }]} />
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[2fr_1fr]">
        <div className="prose-medical">
          <h2>Before your appointment</h2>
          <ul>
            <li>Bring your Emirates ID or passport.</li>
            <li>Bring previous laboratory, imaging and culture reports.</li>
            <li>List all medicines you take, including antibiotics taken in the past three months.</li>
            <li>Arrive 10 minutes early for registration at the facility.</li>
          </ul>
          <h2>Your patient account</h2>
          <p>An account is created automatically when you book. You sign in with a one-time code sent to your email — we never send passwords. In your account you can view and manage appointments, invoices and, once your identity is verified at the clinic, documents the doctor shares with you.</p>
          <h2>Payments and insurance</h2>
          <p>Prices are shown before you book. Where online payment is offered, card details are handled by Stripe and never stored by us. Insurance acceptance depends on the facility and your plan; please confirm with the facility.</p>
          <h2>Privacy</h2>
          <p>Booking messages use a reference number only — never the reason for your visit. Health information is never shared with advertising platforms. See our <Link href={`/${locale}/legal/privacy`}>privacy policy</Link>.</p>
        </div>
        <aside><EmergencyNotice t={t} /></aside>
      </div>
    </>
  );
}
