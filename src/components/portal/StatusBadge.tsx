const MAP: Record<string, [string, string]> = {
  requested: ["Awaiting confirmation", "bg-brass-tint text-brass"],
  awaiting_confirmation: ["Paid · awaiting confirmation", "bg-brass-tint text-brass"],
  confirmed: ["Confirmed", "bg-ok-tint text-ok"],
  completed: ["Completed", "bg-sage text-ink-soft"],
  cancelled: ["Cancelled", "bg-alert-tint text-alert"],
  no_show: ["Missed", "bg-alert-tint text-alert"],
  pending_payment: ["Payment pending", "bg-sage text-ink-soft"],
  hold: ["Reserved", "bg-sage text-ink-soft"],
  expired: ["Expired", "bg-sage text-muted"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] ?? [status, "bg-sage text-ink-soft"];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}
