import Link from "next/link";
import type { Metadata } from "next";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { isStaff } from "@/lib/rbac";
import { PortalNav } from "@/components/portal/PortalNav";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "My account" };

export default async function PortalLayout({ children, params }: LayoutProps<"/[locale]/portal">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-2 text-3xl text-ink">Hello{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}</h1>
        </div>
        <div className="flex gap-2">
          {isStaff(user.roles) && <Link href="/admin" className="btn-secondary min-h-10 text-sm">Staff dashboard</Link>}
          <Link href={`/${locale}/book`} className="btn-primary min-h-10 text-sm">Book an appointment</Link>
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <PortalNav locale={locale} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
