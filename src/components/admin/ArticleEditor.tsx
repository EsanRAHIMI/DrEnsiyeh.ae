"use client";

import { useActionState, useState } from "react";
import { saveArticle } from "@/app/admin/(console)/content/actions";
import type { Block } from "@/server/cms/blocks";

type Ref = { title: string; url: string };
type Initial = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  blocks: Block[];
  references: Ref[];
  categoryId: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
};

const NEW_BLOCK: Record<Block["type"], () => Block> = {
  paragraph: () => ({ type: "paragraph", text: "" }),
  heading: () => ({ type: "heading", level: 2, text: "" }),
  list: () => ({ type: "list", items: [""] }),
  callout: () => ({ type: "callout", tone: "info", text: "" }),
  quote: () => ({ type: "quote", text: "" }),
  image: () => ({ type: "image", url: "", alt: "" }),
  faq: () => ({ type: "faq", q: "", a: "" }),
};

/** Block editor — no code needed. Inline links: [label](/en/services/...) */
export function ArticleEditor({ initial, categories }: { initial: Initial | null; categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveArticle, null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [blocks, setBlocks] = useState<Block[]>(initial?.blocks ?? [NEW_BLOCK.paragraph()]);
  const [refs, setRefs] = useState<Ref[]>(initial?.references ?? []);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState(initial?.canonicalUrl ?? "");
  const [hero, setHero] = useState({ url: initial?.heroImageUrl ?? "", alt: initial?.heroImageAlt ?? "" });

  const update = (i: number, patch: Partial<Block>) => setBlocks((bs) => bs.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, d: -1 | 1) => setBlocks((bs) => { const n = [...bs]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x); return n; });
  const remove = (i: number) => setBlocks((bs) => bs.filter((_, j) => j !== i));

  const payload = JSON.stringify({
    title,
    slug: slug || undefined,
    excerpt: excerpt || null,
    blocks,
    references: refs.filter((r) => r.title && r.url),
    categoryId: categoryId || null,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    seoTitle: seoTitle || null,
    seoDescription: seoDescription || null,
    canonicalUrl: canonicalUrl || null,
    heroImageUrl: hero.url || null,
    heroImageAlt: hero.alt || null,
  });

  const serpTitle = seoTitle || title;
  const serpDesc = seoDescription || excerpt;

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-4">
        <input aria-label="Title" className="field font-display text-2xl" placeholder="Article title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea aria-label="Excerpt" className="field min-h-20 py-3" placeholder="Short summary (shown in lists and as default meta description)" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={400} />
        <ol className="space-y-3">
          {blocks.map((b, i) => (
            <li key={i} className="card p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span className="font-semibold tracking-wide uppercase">{b.type}</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} className="rounded px-2 py-1 hover:bg-sage" aria-label="Move up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} className="rounded px-2 py-1 hover:bg-sage" aria-label="Move down">↓</button>
                  <button type="button" onClick={() => remove(i)} className="rounded px-2 py-1 text-alert hover:bg-alert-tint" aria-label="Delete block">✕</button>
                </span>
              </div>
              {b.type === "paragraph" && <textarea className="field min-h-28 py-3" value={b.text} onChange={(e) => update(i, { text: e.target.value })} aria-label="Paragraph" />}
              {b.type === "heading" && (
                <div className="flex gap-2">
                  <select className="field w-24" value={b.level} onChange={(e) => update(i, { level: Number(e.target.value) as 2 | 3 })} aria-label="Level"><option value={2}>H2</option><option value={3}>H3</option></select>
                  <input className="field font-semibold" value={b.text} onChange={(e) => update(i, { text: e.target.value })} aria-label="Heading" />
                </div>
              )}
              {b.type === "list" && (
                <textarea className="field min-h-28 py-3" value={b.items.join("\n")} onChange={(e) => update(i, { items: e.target.value.split("\n") })} aria-label="List items, one per line" placeholder="One item per line" />
              )}
              {b.type === "callout" && (
                <div className="space-y-2">
                  <select className="field w-40" value={b.tone} onChange={(e) => update(i, { tone: e.target.value as "info" | "warning" })} aria-label="Tone"><option value="info">Info</option><option value="warning">Warning</option></select>
                  <textarea className="field min-h-20 py-3" value={b.text} onChange={(e) => update(i, { text: e.target.value })} aria-label="Callout" />
                </div>
              )}
              {b.type === "quote" && (
                <div className="space-y-2">
                  <textarea className="field min-h-20 py-3" value={b.text} onChange={(e) => update(i, { text: e.target.value })} aria-label="Quote" />
                  <input className="field" placeholder="Source (optional)" value={b.cite ?? ""} onChange={(e) => update(i, { cite: e.target.value })} />
                </div>
              )}
              {b.type === "image" && (
                <div className="grid gap-2">
                  <input className="field" placeholder="Image URL (approved images only, e.g. /images/…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
                  <input className="field" placeholder="Alt text (required — describe the image)" value={b.alt} onChange={(e) => update(i, { alt: e.target.value })} />
                  <input className="field" placeholder="Caption (optional)" value={b.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} />
                </div>
              )}
              {b.type === "faq" && (
                <div className="grid gap-2">
                  <input className="field" placeholder="Question" value={b.q} onChange={(e) => update(i, { q: e.target.value })} />
                  <textarea className="field min-h-20 py-3" placeholder="Concise answer" value={b.a} onChange={(e) => update(i, { a: e.target.value })} />
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NEW_BLOCK) as Block["type"][]).map((t) => (
            <button key={t} type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setBlocks((bs) => [...bs, NEW_BLOCK[t]()])}>+ {t}</button>
          ))}
        </div>

        <fieldset className="card space-y-2 p-4">
          <legend className="px-1 text-sm font-semibold text-ink">References</legend>
          {refs.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="field" placeholder="Title (e.g. WHO fact sheet)" value={r.title} onChange={(e) => setRefs((rs) => rs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input className="field" placeholder="https://…" value={r.url} onChange={(e) => setRefs((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className="btn-ghost text-alert" onClick={() => setRefs((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove reference">✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost px-0 text-sm" onClick={() => setRefs((rs) => [...rs, { title: "", url: "" }])}>+ Add reference</button>
        </fieldset>
      </div>

      <aside className="space-y-4">
        <div className="card space-y-3 p-4">
          <button disabled={pending} className="btn-primary w-full">{pending ? "Saving…" : "Save draft revision"}</button>
          {state?.ok && <p role="status" className="text-sm text-ok">Saved. Edits to approved content need medical re-approval before going live.</p>}
          {state?.error && <p role="alert" className="text-sm text-alert">{state.error}</p>}
        </div>
        <div className="card space-y-3 p-4 text-sm">
          <p className="font-semibold text-ink">Search appearance</p>
          <div className="rounded-xl bg-sage p-3">
            <p className="truncate text-[15px] text-[#1a0dab]">{serpTitle || "Title"} · Dr. Ensiyeh Rahimi</p>
            <p className="text-xs text-ok">drensiyeh.ae › en › articles › {slug || "…"}</p>
            <p className="line-clamp-2 text-xs text-ink-soft">{serpDesc || "Meta description"}</p>
          </div>
          <label className="block text-xs text-muted">URL slug<input className="field mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" /></label>
          <label className="block text-xs text-muted">SEO title <span className={seoTitle.length > 60 ? "text-alert" : ""}>({seoTitle.length}/60)</span><input className="field mt-1" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} /></label>
          <label className="block text-xs text-muted">Meta description <span className={seoDescription.length > 160 ? "text-alert" : ""}>({seoDescription.length}/160)</span><textarea className="field mt-1 min-h-20 py-2" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} /></label>
          <label className="block text-xs text-muted">Canonical URL (only if republished elsewhere)<input className="field mt-1" value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} /></label>
        </div>
        <div className="card space-y-3 p-4 text-sm">
          <label className="block text-xs text-muted">Category<select className="field mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block text-xs text-muted">Tags (comma-separated)<input className="field mt-1" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
          <label className="block text-xs text-muted">Hero image URL<input className="field mt-1" value={hero.url} onChange={(e) => setHero((h) => ({ ...h, url: e.target.value }))} /></label>
          <label className="block text-xs text-muted">Hero alt text<input className="field mt-1" value={hero.alt} onChange={(e) => setHero((h) => ({ ...h, alt: e.target.value }))} /></label>
        </div>
      </aside>
    </form>
  );
}
