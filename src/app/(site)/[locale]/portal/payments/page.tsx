import Link from "next/link";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { patientPayments } from "@/server/portal";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/format";

const LABEL: Record<string, string> = { open: "Pending", authorized: "Authorised", succeeded: "Paid", failed: "Failed", cancelled: "Released", expired: "Expired", refunded: "Refunded", partially_refunded: "Partly refunded" };

export default async function Payments({ params }: PageProps<"/[locale]/portal/payments">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  const rows = await patientPayments(user);
  return (
    <section>
      <h2 className="text-xl text-ink">Payments & invoices</h2>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-sage text-start text-ink-soft">
            <tr><th className="p-4 text-start font-medium">Date</th><th className="p-4 text-start font-medium">Booking</th><th className="p-4 text-start font-medium">Amount</th><th className="p-4 text-start font-medium">Status</th><th className="p-4 text-start font-medium">Invoice</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={5} className="p-5 text-ink-soft">No payments yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.p.id}>
                <td className="p-4">{fmtDate(r.p.createdAt)}</td>
                <td className="p-4">{r.reference}</td>
                <td className="p-4 tabular-nums">{formatMoney(r.p.amountMinor, r.p.currency)}{r.p.amountRefundedMinor > 0 && <span className="block text-xs text-muted">Refunded {formatMoney(r.p.amountRefundedMinor, r.p.currency)}</span>}</td>
                <td className="p-4">{LABEL[r.p.status] ?? r.p.status}</td>
                <td className="p-4">{r.invoiceId ? <Link className="text-teal underline" href={`/${locale}/portal/invoices/${r.invoiceId}`}>{r.invoiceNumber}</Link> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
