import { IconAlert } from "./icons";
import type { Dictionary } from "@/i18n/dictionaries";

export function EmergencyNotice({ t, compact = false }: { t: Dictionary; compact?: boolean }) {
  return (
    <aside role="note" aria-label={t.emergency.title} className={`flex gap-3 rounded-2xl border border-alert/20 bg-alert-tint text-alert ${compact ? "p-3 text-sm" : "p-4 sm:p-5"}`}>
      <IconAlert className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{t.emergency.title}</p>
        <p className="mt-1 leading-relaxed text-ink-soft">{t.emergency.body}</p>
      </div>
    </aside>
  );
}
