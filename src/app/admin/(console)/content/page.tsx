import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Table } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

export default async function Content() {
  await requireStaff("content:edit");
  const rows = await db().select().from(articles).orderBy(desc(articles.updatedAt));
  const now = new Date();
  return (
    <div>
      <PageTitle title="Articles" subtitle="Draft → Medical review (doctor) → Approved → Published / Scheduled → Periodic review">
        <Link href="/admin/content/new" className="btn-primary min-h-10 text-sm">New article</Link>
      </PageTitle>
      <Table head={["Title", "Locale", "Status", "Rev.", "Medically reviewed", "Review due", "Updated", ""]} empty={rows.length === 0}>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="p-3 font-medium text-ink">{a.title}</td>
            <td className="p-3">{a.locale}</td>
            <td className="p-3">{a.status.replace("_", " ")}{a.approvedRevision && a.approvedRevision !== a.revision ? <span className="block text-xs text-brass">unapproved edits</span> : null}</td>
            <td className="p-3">{a.revision}</td>
            <td className="p-3">{a.medicallyReviewedAt ? `${fmtDate(a.medicallyReviewedAt)} · ${a.medicalReviewerName}` : "—"}</td>
            <td className={`p-3 ${a.reviewDueAt && a.reviewDueAt < now ? "text-alert" : ""}`}>{a.reviewDueAt ? fmtDate(a.reviewDueAt) : "—"}</td>
            <td className="p-3">{fmtDate(a.updatedAt)}</td>
            <td className="p-3"><Link className="text-teal underline" href={`/admin/content/${a.id}`}>Edit</Link></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
