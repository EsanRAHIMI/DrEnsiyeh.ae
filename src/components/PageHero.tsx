import { Breadcrumbs } from "./Breadcrumbs";

export function PageHero({ eyebrow, title, intro, crumbs, children }: { eyebrow?: string; title: string; intro?: string; crumbs: { name: string; href: string }[]; children?: React.ReactNode }) {
  return (
    <section className="border-b border-line bg-gradient-to-b from-sage to-paper">
      <div className="container-page py-10 sm:py-14">
        <Breadcrumbs items={crumbs} />
        {eyebrow && <p className="eyebrow mt-8">{eyebrow}</p>}
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight text-ink sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

export function ReviewPendingNotice() {
  if (process.env.DEPLOY_ENV === "production") return null;
  return (
    <p role="status" className="mt-6 inline-block rounded-full bg-brass-tint px-4 py-1.5 text-xs font-semibold text-brass">
      Draft medical content — pending review and approval by the doctor (not indexed)
    </p>
  );
}
