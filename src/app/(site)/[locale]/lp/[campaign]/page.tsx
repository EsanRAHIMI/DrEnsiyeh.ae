import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { localeFrom } from "@/i18n/server";
import { getCampaign } from "@/content/campaigns";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { IconCheck } from "@/components/icons";
import { getCatalog } from "@/server/catalog";
import { formatMoney } from "@/lib/money";
import { PROFILE } from "@/content/profile";

// Landing pages are for paid traffic only; they are not indexed (avoid duplicate/doorway content).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Landing({ params }: PageProps<"/[locale]/lp/[campaign]">) {
  const { locale, t } = await localeFrom(params);
  const { campaign } = await params;
  const c = getCampaign(campaign);
  if (!c) notFound();
  const variant = (await cookies()).get("dr_exp")?.value === "B" ? "B" : "A";
  const v = c.variants[variant];
  const prices = (await getCatalog().catch(() => [])).filter((r) => r.service.kind === c.kind).map((r) => r.offering.priceMinor);
  const from = prices.length ? Math.min(...prices) : null;
  const href = `/${locale}/book?kind=${c.kind}`;
  return (
    <section className="container-page py-12 sm:py-20" data-variant={variant}>
      <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="eyebrow">{PROFILE.name.value} · {PROFILE.title.value}</p>
          <h1 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">{v.headline}</h1>
          <p className="mt-5 text-lg text-ink-soft">{v.sub}</p>
          <ul className="mt-8 space-y-3">
            {c.points.map((p) => <li key={p} className="flex items-center gap-3 text-ink"><IconCheck className="size-5 text-teal" /> {p}</li>)}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={href} className="btn-primary">{v.cta}</Link>
            {from !== null && <span className="text-sm text-ink-soft">From <strong className="text-ink">{formatMoney(from)}</strong></span>}
          </div>
        </div>
        <EmergencyNotice t={t} />
      </div>
    </section>
  );
}
