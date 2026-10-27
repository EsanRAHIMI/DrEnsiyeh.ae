"use client";

export function ExportCsv({ rows, filename }: { rows: Record<string, string | number>[]; filename: string }) {
  return (
    <button
      type="button"
      className="btn-secondary min-h-9 px-3 text-xs"
      disabled={!rows.length}
      onClick={() => {
        const cols = Object.keys(rows[0]);
        const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = filename;
        a.click();
      }}
    >
      Export CSV
    </button>
  );
}
