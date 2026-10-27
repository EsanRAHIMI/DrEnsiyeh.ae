import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { patients } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Table } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

export default async function Patients({ searchParams }: PageProps<"/admin/patients">) {
  await requireStaff("patients:read_contact");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db()
    .select()
    .from(patients)
    .where(q ? or(ilike(patients.fullName, like), ilike(patients.email, like), ilike(patients.phone, like)) : undefined)
    .orderBy(desc(patients.createdAt))
    .limit(100);
  return (
    <div>
      <PageTitle title="Patients" />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} className="field max-w-sm" placeholder="Search name, email or phone" aria-label="Search" /><button className="btn-secondary">Search</button></form>
      <Table head={["Name", "Email", "Phone", "Identity", "Since", ""]} empty={rows.length === 0}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="p-3">{p.fullName}{p.relationship !== "self" && <span className="text-muted"> ({p.relationship})</span>}</td>
            <td className="p-3">{p.email}</td>
            <td className="p-3">{p.phone}</td>
            <td className="p-3">{p.identityVerifiedAt ? "Verified" : <span className="text-brass">Unverified</span>}</td>
            <td className="p-3">{fmtDate(p.createdAt)}</td>
            <td className="p-3"><Link href={`/admin/patients/${p.id}`} className="text-teal underline">Open</Link></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
