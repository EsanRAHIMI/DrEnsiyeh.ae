import { z } from "zod";

/** Block schema for articles. Plain data — rendered by our own components, never as raw HTML. */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().max(5000) }),
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().max(200) }),
  z.object({ type: z.literal("list"), ordered: z.boolean().optional(), items: z.array(z.string().max(1000)).max(50) }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "warning"]).default("info"), text: z.string().max(2000) }),
  z.object({ type: z.literal("quote"), text: z.string().max(2000), cite: z.string().max(200).optional() }),
  z.object({ type: z.literal("image"), url: z.string().max(500), alt: z.string().min(3, "Images need alt text").max(300), caption: z.string().max(300).optional() }),
  z.object({ type: z.literal("faq"), q: z.string().max(300), a: z.string().max(2000) }),
]);
export type Block = z.infer<typeof blockSchema>;
export const blocksSchema = z.array(blockSchema).max(300);

export const referenceSchema = z.array(z.object({ title: z.string().min(3).max(300), url: z.url().max(500) })).max(50);

/** Inline links in text use [label](/path) markdown syntax — only http(s) and site-relative URLs are rendered. */
export function plainText(blocks: Block[]): string {
  return blocks
    .map((b) => ("text" in b ? b.text : b.type === "list" ? b.items.join(" ") : b.type === "faq" ? `${b.q} ${b.a}` : ""))
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function readingMinutes(blocks: Block[]) {
  return Math.max(1, Math.round(plainText(blocks).split(/\s+/).length / 220));
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 80);
}
