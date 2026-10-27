import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { inAppNotifications, patientBookings } from "@/server/portal";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { pickLocalized } from "@/i18n/dictionaries";
import { render, type TemplateId } from "@/server/notifications/templates";

export default async function PortalHome({ params }: PageProps<"/[locale]/portal">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  const [rows, notes] = await Promise.all([patientBookings(user), inAppNotifications(user)]);
  const upcoming = rows.filter((r) => r.b.startsAt > new Date() && ["requested", "awaiting_confirmation", "confirmed"].includes(r.b.status)).reverse();
  return (
    <div className="space-y-8">
      {!user.emailVerified && <p className="rounded-xl bg-brass-tint p-4 text-sm text-brass">Please sign in with the code sent to your email to verify your account.</p>}
      <section>
        <h2 className="text-xl text-ink">Upcoming appointments</h2>
        {upcoming.length === 0 ? (
          <div className="card mt-4 p-6 text-ink-soft">
            No upcoming appointments. <Link href={`/${locale}/book`} className="text-teal underline">Book one now</Link>.
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {upcoming.map((r) => (
              <li key={r.b.id}>
                <Link href={`/${locale}/portal/appointments/${r.b.id}`} className="card flex flex-col gap-2 p-5 hover:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-semibold text-ink">{fmtDateTime(r.b.startsAt)}</span>
                    <span className="block text-sm text-ink-soft">{pickLocalized(r.serviceName, locale)} · {r.b.kind === "home_visit" ? "Home visit" : r.facilityName}</span>
                    <span className="block text-xs text-muted">Ref {r.b.reference}</span>
                  </span>
                  <StatusBadge status={r.b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-xl text-ink">Notifications</h2>
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {notes.length === 0 && <li className="p-5 text-ink-soft">Nothing new.</li>}
          {notes.map((n) => (
            <li key={n.id} className="p-5 text-sm">
              <p className="font-medium text-ink">{render(n.template as TemplateId, n.params as Record<string, string>).subject}</p>
              <p className="text-xs text-muted">{fmtDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
