"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
            {i.label}
          </Link>
        );
      })}
      <button type="button" className="shrink-0 rounded-lg px-3 py-2 text-start text-sm text-white/60 hover:bg-white/10" onClick={async () => { await fetch("/api/v1/auth/logout", { method: "POST" }); router.replace("/en/login"); }}>
        Sign out
      </button>
    </nav>
  );
}
