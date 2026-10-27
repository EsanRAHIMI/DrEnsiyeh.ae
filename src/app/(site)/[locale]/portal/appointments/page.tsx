import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { patientBookings } from "@/server/portal";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { pickLocalized } from "@/i18n/dictionaries";

export default async function Appointments({ params }: PageProps<"/[locale]/portal/appointments">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  const rows = await patientBookings(user);
  return (
    <section>
      <h2 className="text-xl text-ink">All appointments</h2>
      <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
        {rows.length === 0 && <li className="p-5 text-ink-soft">No appointments yet.</li>}
        {rows.map((r) => (
          <li key={r.b.id}>
            <Link href={`/${locale}/portal/appointments/${r.b.id}`} className="flex flex-col gap-2 p-5 hover:bg-sage/50 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="block font-medium text-ink">{fmtDateTime(r.b.startsAt)}</span>
                <span className="block text-sm text-ink-soft">{pickLocalized(r.serviceName, locale)} · Ref {r.b.reference}</span>
              </span>
              <StatusBadge status={r.b.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
