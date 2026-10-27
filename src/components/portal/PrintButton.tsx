"use client";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="btn-secondary min-h-10 text-sm print:hidden">Print / Save PDF</button>;
}
