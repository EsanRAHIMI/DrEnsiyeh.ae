import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Runs the notification job so queued messages land in the dev file transport. */
export async function flushOutbox() {
  await fetch(`${BASE}/api/v1/cron/notifications`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
}

export async function latestCodeFor(email: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    await flushOutbox();
    if (existsSync(".data/outbox.jsonl")) {
      const lines = readFileSync(".data/outbox.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
      const m = lines.reverse().find((l) => l.to === email && /sign-in code is (\d{6})/.test(l.text));
      if (m) return m.text.match(/sign-in code is (\d{6})/)[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No login code for ${email}`);
}

export async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(email);
  const before = Date.now();
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByLabel("6-digit code").waitFor();
  await new Promise((r) => setTimeout(r, 300));
  const code = await latestCodeFor(email);
  void before;
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function dismissConsent(page: Page) {
  const btn = page.getByRole("button", { name: "Necessary only" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}
