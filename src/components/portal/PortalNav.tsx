"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function PortalNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    ["", "Overview"],
    ["/appointments", "Appointments"],
    ["/payments", "Payments & invoices"],
    ["/records", "Medical documents"],
    ["/settings", "Settings & privacy"],
  ] as const;
  return (
    <nav aria-label="Account" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col">
      {items.map(([p, label]) => {
        const href = `/${locale}/portal${p}`;
        const active = p === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium ${active ? "bg-teal text-white" : "text-ink-soft hover:bg-sage"}`}>
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        className="shrink-0 rounded-xl px-4 py-2.5 text-start text-sm font-medium text-muted hover:bg-sage"
        onClick={async () => {
          await fetch("/api/v1/auth/logout", { method: "POST" });
          router.replace(`/${locale}/login`);
          router.refresh();
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
