import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, documents, patients } from "@/db/schema";
import { actorOf, requireStaff } from "@/server/auth/session";
import { can, type Role } from "@/lib/rbac";
import { PageTitle, Section, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ActionForm } from "@/components/admin/ActionForm";
import { noteAction, uploadDocumentAction, verifyGuardianAction, verifyIdentityAction } from "../../actions";
import { listNotes } from "@/server/emr/records";
import { capabilityBlockers, getCompliance } from "@/server/compliance";
import { signDownload } from "@/server/storage";

export default async function PatientDetail({ params }: PageProps<"/admin/patients/[id]">) {
  const user = await requireStaff("patients:read_contact");
  const { id } = await params;
  const [p] = await db().select().from(patients).where(eq(patients.id, id));
  if (!p) notFound();
  const compliance = await getCompliance(db());
  const emrBlockers = capabilityBlockers(compliance, "emr_reference");
  const clinical = can(user.roles, "clinical:read") && emrBlockers.length === 0;
  const actor = { ...actorOf(user), roles: user.roles as Role[] };
  const [appts, notes, docs] = await Promise.all([
    db().select().from(bookings).where(eq(bookings.patientId, id)).orderBy(desc(bookings.startsAt)),
    clinical ? listNotes(db(), actor, id) : Promise.resolve([]),
    clinical ? db().select().from(documents).where(eq(documents.patientId, id)).orderBy(desc(documents.createdAt)) : Promise.resolve([]),
  ]);
  const superseded = new Set(notes.map((n) => n.supersedesId).filter(Boolean));
  return (
    <div className="max-w-5xl">
      <Link href="/admin/patients" className="text-sm text-teal">← Patients</Link>
      <PageTitle title={p.fullName} subtitle={`${p.email ?? ""} · ${p.phone ?? ""}${p.dateOfBirth ? ` · DOB ${p.dateOfBirth}` : ""}`}>
        {clinical && <a className="btn-secondary min-h-10 text-sm" href={`/api/v1/patients/${p.id}/fhir`}>Export FHIR</a>}
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5 text-sm">
          <h2 className="font-semibold text-ink">Identity</h2>
          {p.identityVerifiedAt ? (
            <p className="mt-2 text-ok">Verified {fmtDate(p.identityVerifiedAt)}</p>
          ) : can(user.roles, "appointments:manage") ? (
            <ActionForm action={verifyIdentityAction} submit="Mark identity verified" tone="secondary">
              <input type="hidden" name="patientId" value={p.id} />
              <select name="method" className="field mt-2" aria-label="Method"><option>Emirates ID checked in person</option><option>Passport checked in person</option></select>
            </ActionForm>
          ) : (
            <p className="mt-2 text-muted">Unverified</p>
          )}
          {p.relationship !== "self" && (
            <div className="mt-4">
              <p className="font-medium text-ink">Guardian / dependent access</p>
              {p.guardianVerifiedAt ? <p className="text-ok">Verified</p> : can(user.roles, "appointments:override") ? (
                <ActionForm action={verifyGuardianAction} submit="Verify guardianship" tone="secondary">
                  <input type="hidden" name="patientId" value={p.id} />
                  <input name="evidence" className="field mt-2" placeholder="Evidence (e.g. birth certificate seen)" required />
                </ActionForm>
              ) : <p className="text-muted">Pending</p>}
            </div>
          )}
        </div>
        <div className="card p-5 text-sm">
          <h2 className="font-semibold text-ink">Clinical records</h2>
          {!can(user.roles, "clinical:read") ? (
            <p className="mt-2 text-muted">Clinical information is not available for your role.</p>
          ) : emrBlockers.length ? (
            <p className="mt-2 text-muted">Clinical records are disabled: {emrBlockers.join("; ")}. Use the facility EMR.</p>
          ) : (
            <p className="mt-2 text-ink-soft">Mode: <strong>{compliance.emrMode === "native" ? "structured records" : "summaries & document references (facility EMR is authoritative)"}</strong>. Custodian: {compliance.recordsCustodian}</p>
          )}
        </div>
      </div>

      <Section title="Appointments">
        <Table head={["When", "Ref", "Status", ""]} empty={appts.length === 0}>
          {appts.map((b) => (
            <tr key={b.id}><td className="p-3">{fmtDateTime(b.startsAt)}</td><td className="p-3">{b.reference}</td><td className="p-3"><StatusBadge status={b.status} /></td><td className="p-3"><Link className="text-teal underline" href={`/admin/appointments/${b.id}`}>Open</Link></td></tr>
          ))}
        </Table>
      </Section>

      {clinical && (
        <>
          <Section title="Clinical notes">
            <ul className="space-y-3">
              {notes.length === 0 && <li className="text-sm text-muted">No notes.</li>}
              {notes.map((n) => (
                <li key={n.id} className={`card p-4 text-sm ${superseded.has(n.id) ? "opacity-60" : ""}`}>
                  <p className="text-xs text-muted">
                    {fmtDateTime(n.createdAt)} · {n.type} · {n.signedAt ? `signed ${fmtDateTime(n.signedAt)}` : "draft"} {n.patientVisible ? "· visible to patient" : ""} {superseded.has(n.id) ? "· superseded" : ""}
                    {n.amendmentReason ? ` · amendment: ${n.amendmentReason}` : ""}
                  </p>
                  {n.body.title && <p className="mt-1 font-semibold">{n.body.title}</p>}
                  <p className="mt-1 whitespace-pre-line">{n.body.text}</p>
                  {!n.signedAt && n.authorUserId === user.userId && (
                    <ActionForm action={noteAction} submit="Sign" tone="secondary"><input type="hidden" name="op" value="sign" /><input type="hidden" name="noteId" value={n.id} /></ActionForm>
                  )}
                  {n.signedAt && !superseded.has(n.id) && can(user.roles, "clinical:sign") && (
                    <details className="mt-2"><summary className="cursor-pointer text-teal">Amend</summary>
                      <ActionForm action={noteAction} submit="Save amendment" tone="secondary">
                        <input type="hidden" name="op" value="amend" /><input type="hidden" name="noteId" value={n.id} />
                        <textarea name="text" defaultValue={n.body.text} className="field mt-2 min-h-28 py-2" required />
                        <input name="reason" className="field mt-2" placeholder="Reason for amendment" required />
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {can(user.roles, "clinical:write") && (
              <ActionForm action={noteAction} submit="Add note" className="card mt-4 grid gap-3 p-5">
                <input type="hidden" name="op" value="create" /><input type="hidden" name="patientId" value={p.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <select name="type" className="field" aria-label="Type">
                    <option value="visit_summary">Visit summary (patient-facing)</option>
                    <option value="follow_up">Follow-up instructions</option>
                    {compliance.emrMode === "native" && ["visit_note", "history", "allergy", "medication", "treatment_plan"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                  <select name="bookingId" className="field sm:col-span-2" aria-label="Related appointment"><option value="">No specific appointment</option>{appts.map((b) => <option key={b.id} value={b.id}>{b.reference} — {fmtDate(b.startsAt)}</option>)}</select>
                </div>
                <input name="title" className="field" placeholder="Title (optional)" />
                <textarea name="text" className="field min-h-32 py-3" required placeholder="Note" />
                <div className="flex flex-wrap gap-5 text-sm">
                  <label className="flex gap-2"><input type="checkbox" name="patientVisible" className="accent-teal" /> Visible to patient</label>
                  {can(user.roles, "clinical:sign") && <label className="flex gap-2"><input type="checkbox" name="sign" className="accent-teal" /> Sign now</label>}
                </div>
              </ActionForm>
            )}
          </Section>

          <Section title="Documents">
            <Table head={["Date", "Title", "Category", "Patient-visible", ""]} empty={docs.length === 0}>
              {docs.map((d) => (
                <tr key={d.id}><td className="p-3">{fmtDate(d.createdAt)}</td><td className="p-3">{d.title}</td><td className="p-3">{d.category}</td><td className="p-3">{d.patientVisible ? "Yes" : "No"}</td>
                  <td className="p-3">{d.storageKey ? <a className="text-teal underline" href={signDownload(d.id, user.userId)}>Download</a> : d.externalReference}</td></tr>
              ))}
            </Table>
            {can(user.roles, "clinical:write") && (
              <ActionForm action={uploadDocumentAction} submit="Add document" className="card mt-4 grid gap-3 p-5">
                <input type="hidden" name="patientId" value={p.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="title" className="field" placeholder="Title" required />
                  <select name="category" className="field" aria-label="Category"><option value="lab_report">Lab report</option><option value="diagnostic_report">Diagnostic report</option><option value="referral">Referral</option><option value="other">Other</option></select>
                </div>
                {compliance.emrMode === "native" && <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />}
                <input name="externalReference" className="field" placeholder="Facility EMR document reference (e.g. MRN/accession)" />
                <label className="flex gap-2 text-sm"><input type="checkbox" name="patientVisible" className="accent-teal" /> Visible to patient</label>
              </ActionForm>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
