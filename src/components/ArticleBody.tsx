import Link from "next/link";
import type { Block } from "@/server/cms/blocks";

/** Renders [label](url) inline links safely; everything else is plain text (no HTML injection). */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = m[2];
    if (href.startsWith("/")) parts.push(<Link key={m.index} href={href}>{m[1]}</Link>);
    else if (/^https?:\/\//.test(href)) parts.push(<a key={m.index} href={href} rel="noopener" target="_blank">{m[1]}</a>);
    else parts.push(m[1]);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose-medical">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return <p key={i}><Inline text={b.text} /></p>;
          case "heading":
            return b.level === 2 ? <h2 key={i}>{b.text}</h2> : <h3 key={i}>{b.text}</h3>;
          case "list": {
            const items = b.items.filter(Boolean).map((t, j) => <li key={j}><Inline text={t} /></li>);
            return b.ordered ? <ol key={i} className="list-decimal ps-6">{items}</ol> : <ul key={i}>{items}</ul>;
          }
          case "callout":
            return <aside key={i} className={`my-6 rounded-2xl p-5 ${b.tone === "warning" ? "bg-alert-tint text-ink" : "bg-teal-tint text-ink"}`}><Inline text={b.text} /></aside>;
          case "quote":
            return <blockquote key={i} className="my-6 border-s-4 border-brass ps-5 italic">{b.text}{b.cite && <footer className="mt-2 text-sm not-italic text-muted">— {b.cite}</footer>}</blockquote>;
          case "image":
            return (
              <figure key={i} className="my-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt={b.alt} loading="lazy" decoding="async" className="w-full rounded-2xl" />
                {b.caption && <figcaption className="mt-2 text-sm text-muted">{b.caption}</figcaption>}
              </figure>
            );
          case "faq":
            return (
              <div key={i} className="my-6">
                <h3>{b.q}</h3>
                <p><Inline text={b.a} /></p>
              </div>
            );
        }
      })}
    </div>
  );
}
