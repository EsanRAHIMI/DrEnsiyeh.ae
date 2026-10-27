import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { redirects } from "@/db/schema";

const LOCALES = ["en", "ar"];
const PASSTHROUGH = /^\/(api|admin|_next|favicon|sitemap\.xml|robots\.txt|llms\.txt|og-default\.png|images|fonts)(\/|$)/;

// Managed redirects (CMS slug changes etc.), cached in-process for 5 minutes.
let cache: { at: number; map: Map<string, { to: string; permanent: boolean }> } | null = null;
async function redirectMap() {
  if (cache && Date.now() - cache.at < 300_000) return cache.map;
  try {
    const rows = await db().select().from(redirects);
    cache = { at: Date.now(), map: new Map(rows.map((r) => [r.fromPath, { to: r.toPath, permanent: r.permanent }])) };
  } catch {
    cache = { at: Date.now(), map: cache?.map ?? new Map() };
  }
  return cache.map;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PASSTHROUGH.test(pathname)) return NextResponse.next();

  const first = pathname.split("/")[1];
  if (!LOCALES.includes(first)) {
    const url = req.nextUrl.clone();
    url.pathname = `/en${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url, 308);
  }

  const r = (await redirectMap()).get(pathname);
  if (r) return NextResponse.redirect(new URL(r.to, req.url), r.permanent ? 308 : 307);

  // Landing-page A/B assignment (copy/layout only — never emergency, consent or legal content).
  if (pathname.includes("/lp/") && !req.cookies.get("dr_exp")) {
    const res = NextResponse.next();
    res.cookies.set("dr_exp", Math.random() < 0.5 ? "A" : "B", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|txt|xml|woff2?)$).*)"],
};
