import type { Metadata } from "next";
import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Create your patient account", robots: { index: false, follow: true } };

export default async function Register({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await localeFrom(params);
  return (
    <div className="container-page grid gap-10 py-14 lg:grid-cols-2">
      <div className="prose-medical">
        <h1 className="text-4xl text-ink">Your patient account</h1>
        <p>You don&apos;t need to register before booking — an account is created automatically when you book, using the email you provide.</p>
        <p>You can also create one now. We&apos;ll verify your email with a one-time code; there is no password to remember.</p>
        <p>For your safety, medical documents become visible in your account only after your identity has been confirmed at the clinic.</p>
        <p><Link href={`/${locale}/book`}>Book an appointment instead →</Link></p>
      </div>
      <div className="card h-fit p-7 sm:p-9">
        <h2 className="text-2xl text-ink">Create or access your account</h2>
        <div className="mt-6"><LoginForm locale={locale} /></div>
      </div>
    </div>
  );
}
