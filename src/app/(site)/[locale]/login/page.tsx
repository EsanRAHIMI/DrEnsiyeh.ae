import type { Metadata } from "next";
import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Patient login", robots: { index: false, follow: true } };

export default async function Login({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await localeFrom(params);
  const sp = await searchParams;
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-14">
      <div className="card w-full max-w-md p-7 sm:p-9">
        <h1 className="text-3xl text-ink">Sign in</h1>
        <p className="mt-2 text-ink-soft">Access your appointments, invoices and documents.</p>
        <div className="mt-7">
          <LoginForm locale={locale} next={typeof sp.next === "string" ? sp.next : undefined} initialError={typeof sp.error === "string" ? sp.error : undefined} />
        </div>
        <p className="mt-6 text-sm text-muted">New patient? <Link href={`/${locale}/register`} className="text-teal underline">How accounts work</Link></p>
      </div>
    </div>
  );
}
