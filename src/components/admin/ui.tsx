export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sage text-ink-soft">
          <tr>{head.map((h) => <th key={h} className="p-3 text-start font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{empty ? <tr><td colSpan={head.length} className="p-5 text-ink-soft">Nothing to show.</td></tr> : children}</tbody>
      </table>
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-sans text-base font-semibold text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
