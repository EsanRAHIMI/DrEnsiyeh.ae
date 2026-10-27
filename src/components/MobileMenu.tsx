"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconMenu } from "./icons";

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink"
      >
        <IconMenu className="size-5" />
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="fade-up absolute inset-x-0 top-full border-b border-line bg-paper shadow-[var(--shadow-lift)]">
          <ul className="container-page grid gap-1 py-4">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-sage">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
