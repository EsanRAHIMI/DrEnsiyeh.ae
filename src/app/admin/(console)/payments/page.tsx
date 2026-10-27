import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle, Stat, Table } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getCompliance, paymentsEnabled } from "@/server/compliance";

export default async function Payments() {
  await requireStaff("payments:read");
  const [rows, compliance] = await Promise.all([
    db().select({ p: payments, ref: bookings.reference, bookingId: bookings.id }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).orderBy(desc(payments.createdAt)).limit(200),
    getCompliance(db()),
  ]);
  const mode = paymentsEnabled(compliance);
  const sum = (f: (p: (typeof rows)[number]["p"]) => number) => rows.reduce((a, r) => a + f(r.p), 0);
  return (
    <div>
      <PageTitle title="Payments" subtitle={`Mode: ${mode.toUpperCase()}${mode !== "live" ? " — no real money is moved" : ""}. Merchant of record: ${compliance.merchantOfRecord ?? "not recorded"}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Captured" value={formatMoney(sum((p) => (["succeeded", "refunded", "partially_refunded"].includes(p.status) ? p.amountMinor : 0)))} />
        <Stat label="Authorised (uncaptured)" value={formatMoney(sum((p) => (p.status === "authorized" ? p.amountMinor : 0)))} />
        <Stat label="Refunded" value={formatMoney(sum((p) => p.amountRefundedMinor))} />
        <Stat label="Abandoned / expired" value={rows.filter((r) => ["expired", "failed"].includes(r.p.status)).length} />
      </div>
      <Table head={["Created", "Booking", "Status", "Amount", "Refunded", "Stripe", "Mode"]} empty={rows.length === 0}>
        {rows.map(({ p, ref, bookingId }) => (
          <tr key={p.id}>
            <td className="p-3 whitespace-nowrap">{fmtDateTime(p.createdAt)}</td>
            <td className="p-3"><Link className="text-teal underline" href={`/admin/appointments/${bookingId}`}>{ref}</Link></td>
            <td className="p-3">{p.status}</td>
            <td className="p-3 tabular-nums">{formatMoney(p.amountMinor, p.currency)}</td>
            <td className="p-3 tabular-nums">{p.amountRefundedMinor ? formatMoney(p.amountRefundedMinor, p.currency) : "—"}</td>
            <td className="p-3 font-mono text-xs">{p.paymentIntentId ?? p.checkoutSessionId?.slice(0, 18)}</td>
            <td className="p-3">{p.livemode ? "Live" : "Test"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
