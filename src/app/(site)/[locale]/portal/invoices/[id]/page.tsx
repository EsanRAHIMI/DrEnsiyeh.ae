import { notFound } from "next/navigation";
import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { patientInvoice } from "@/server/portal";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "@/components/portal/PrintButton";

export default async function Invoice({ params }: PageProps<"/[locale]/portal/invoices/[id]">) {
  const { locale } = await localeFrom(params);
  const { id } = await params;
  const user = await requirePatient(locale);
  const row = await patientInvoice(user, id);
  if (!row) notFound();
  const { i, b } = row;
  const lines = i.lines as { description: string; amountMinor: number }[];
  return (
    <article className="card p-8 print:border-0 print:shadow-none">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="text-2xl text-ink">Invoice {i.number}</h2>
          <p className="text-sm text-ink-soft">Issued {fmtDate(i.issuedAt)} · Booking {b.reference}</p>
        </div>
        <PrintButton />
      </div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Issued by</dt><dd className="font-medium text-ink">{i.issuerLegalEntity}{i.issuerTrn ? ` · TRN ${i.issuerTrn}` : ""}</dd></div>
        <div><dt className="text-muted">Billed to</dt><dd className="font-medium text-ink">{i.billToName}</dd></div>
      </dl>
      <table className="mt-6 w-full text-sm">
        <tbody className="divide-y divide-line">
          {lines.map((l) => <tr key={l.description}><td className="py-3">{l.description}</td><td className="py-3 text-end tabular-nums">{formatMoney(l.amountMinor, i.currency)}</td></tr>)}
          <tr><td className="py-3 text-ink-soft">VAT</td><td className="py-3 text-end tabular-nums">{formatMoney(i.vatMinor, i.currency)}</td></tr>
          <tr className="font-semibold"><td className="py-3">Total</td><td className="py-3 text-end tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td></tr>
        </tbody>
      </table>
    </article>
  );
}
