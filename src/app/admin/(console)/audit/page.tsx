import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Table } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";

export default async function Audit() {
  await requireStaff("audit:read");
  const rows = await db().select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(300);
  return (
    <div>
      <PageTitle title="Audit log" subtitle="Append-only. Contains identifiers and actions only — never clinical content." />
      <Table head={["Time", "Actor", "Role", "Action", "Entity", "Details"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="p-3 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
            <td className="p-3 font-mono text-xs">{r.actorUserId?.slice(0, 8) ?? "system"}</td>
            <td className="p-3">{r.actorRole}</td>
            <td className="p-3">{r.action}</td>
            <td className="p-3">{r.entityType} <span className="font-mono text-xs text-muted">{r.entityId?.slice(0, 12)}</span></td>
            <td className="p-3 font-mono text-xs text-muted">{r.details ? JSON.stringify(r.details).slice(0, 120) : ""}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
