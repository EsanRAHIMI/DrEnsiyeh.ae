import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { baseUrl } from "@/lib/site";

export function Breadcrumbs({ items }: { items: { name: string; href: string }[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((it, i) => (
            <li key={it.href} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {i === items.length - 1 ? (
                <span aria-current="page" className="text-ink-soft">{it.name}</span>
              ) : (
                <Link href={it.href} className="hover:text-teal">{it.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${baseUrl()}${it.href}` })),
        }}
      />
    </>
  );
}
