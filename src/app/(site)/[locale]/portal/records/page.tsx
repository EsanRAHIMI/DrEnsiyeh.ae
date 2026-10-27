import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { patientVisibleRecords } from "@/server/portal";
import { signDownload } from "@/server/storage";
import { fmtDate } from "@/lib/format";

export default async function Records({ params }: PageProps<"/[locale]/portal/records">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  const { access, notes, docs } = await patientVisibleRecords(user);
  if (!access.allowed) {
    return (
      <section className="card p-6">
        <h2 className="text-xl text-ink">Medical documents</h2>
        <p className="mt-3 text-ink-soft">{access.reason}</p>
      </section>
    );
  }
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl text-ink">Visit summaries & instructions</h2>
        <ul className="mt-4 space-y-3">
          {notes.length === 0 && <li className="card p-5 text-ink-soft">No summaries shared yet.</li>}
          {notes.map((n) => (
            <li key={n.id} className="card p-5">
              <p className="text-xs text-muted">{fmtDate(n.createdAt)} · {n.type.replace("_", " ")}{n.supersedesId ? " · amended" : ""}</p>
              {n.body.title && <p className="mt-1 font-semibold text-ink">{n.body.title}</p>}
              <p className="mt-2 whitespace-pre-line text-ink-soft">{n.body.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl text-ink">Documents</h2>
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {docs.length === 0 && <li className="p-5 text-ink-soft">No documents shared yet.</li>}
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-5 text-sm">
              <span><span className="font-medium text-ink">{d.title}</span><span className="block text-xs text-muted">{fmtDate(d.createdAt)}</span></span>
              {d.storageKey ? <a className="text-teal underline" href={signDownload(d.id, user.userId)}>Download</a> : <span className="text-muted">Available at the facility</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
