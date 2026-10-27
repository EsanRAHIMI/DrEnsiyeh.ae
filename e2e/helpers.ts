import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { expect } from "@playwright/test";
import { totp } from "../src/lib/crypto";
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

const TOTP_FILE = ".data/e2e-doctor-totp";

/** Signs the seeded doctor in, enrolling MFA on first run and remembering the dev-only secret. */
export async function signInDoctor(page: Page) {
  await signIn(page, process.env.SEED_DOCTOR_EMAIL ?? "doctor@drensiyeh.test");
  await page.waitForURL(/\/admin/);
  if (page.url().includes("/admin/mfa/setup")) {
    const secret = (await page.locator("p.font-mono").textContent())!.replace(/\s/g, "");
    mkdirSync(".data", { recursive: true });
    writeFileSync(TOTP_FILE, secret);
    await page.getByLabel("Authentication code").fill(totp(secret));
    await page.getByRole("button", { name: "Activate" }).click();
  } else if (page.url().includes("/admin/mfa")) {
    if (!existsSync(TOTP_FILE)) throw new Error("Doctor enrolled with an unknown TOTP secret — reset the dev DB");
    await page.getByLabel("Authentication code").fill(totp(readFileSync(TOTP_FILE, "utf8").trim()));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL(/\/admin$/);
}

/** Completes Stripe-hosted Checkout in test mode with Stripe's published test card. */
export async function payWithTestCard(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Test Card");
  const country = page.locator("#billingCountry");
  if (await country.isVisible().catch(() => false)) await country.selectOption("AE").catch(() => {});
  const zip = page.locator("#billingPostalCode");
  if (await zip.isVisible().catch(() => false)) await zip.fill("00000");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/\/book\/status\//, { timeout: 60_000 });
}

export async function expectStatus(page: Page, text: RegExp) {
  await expect(page.getByRole("heading", { name: text })).toBeVisible({ timeout: 45_000 });
}
