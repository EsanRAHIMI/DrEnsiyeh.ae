import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { BASE, dismissConsent, expectStatus, payWithTestCard, signIn, signInAdmin, signInDoctor } from "./helpers";

/**
 * Webhook-only confirmation: the return-page shortcut (server-side session lookup) is disabled by
 * stripping `session_id` from the status poll, so a booking can only become paid through Stripe's
 * signed webhook (forwarded by `stripe listen`). Requires STRIPE_WEBHOOK_SECRET from the CLI.
 */
test.skip(!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !process.env.STRIPE_WEBHOOK_SECRET, "Stripe test key + CLI webhook secret required");

const email = `webhook.${Date.now()}@example.test`;
const refs: string[] = [];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
test.afterAll(async () => pool.end());

const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows as T[];

async function webhookOnly(page: Page) {
  await page.route(/\/api\/v1\/bookings\/[^/]+\?.*session_id=/, (route) => {
    const u = new URL(route.request().url());
    u.searchParams.delete("session_id");
    return route.continue({ url: u.toString() });
  });
}

async function bookAndPay(page: Page, service: RegExp) {
  await page.getByRole("button", { name: "No — continue to booking" }).click();
  await page.getByRole("radio", { name: service }).check();
  const slot = page.locator('button[aria-pressed="false"]').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await slot.waitFor();
  await slot.click();
  await page.getByLabel("Full name (as on ID)").fill("Webhook Patient");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("+971500007777");
  await page.getByText("I have read the cancellation").click();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWithTestCard(page);
  await expectStatus(page, /Payment received — awaiting confirmation/);
  return (await page.locator("strong").filter({ hasText: /^DR-/ }).first().textContent())!;
}

async function eventsFor(ref: string) {
  return q<{ type: string; event_id: string }>(
    `select w.type, w.event_id from processed_webhooks w where w.processed_at > now() - interval '15 minutes' order by w.processed_at`,
  ).then((rows) => ({ ref, rows }));
}

test.describe.serial("Stripe webhooks (signed, forwarded by Stripe CLI)", () => {
  test("rejects unsigned and wrongly signed requests", async () => {
    const body = JSON.stringify({ id: "evt_fake", type: "checkout.session.completed", data: { object: {} } });
    const none = await fetch(`${BASE}/api/v1/webhooks/stripe`, { method: "POST", body });
    expect(none.status).toBe(400);
    const bad = await fetch(`${BASE}/api/v1/webhooks/stripe`, { method: "POST", body, headers: { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=deadbeef` } });
    expect(bad.status).toBe(400);
    expect((await q(`select 1 from processed_webhooks where event_id = 'evt_fake'`)).length).toBe(0);
  });

  test("A: new patient's payment is confirmed by the webhook alone", async ({ page }) => {
    await webhookOnly(page);
    await page.goto("/en/book?kind=clinic");
    await dismissConsent(page);
    refs.push(await bookAndPay(page, /Infectious disease consultation/));
    const [row] = await q<{ status: string; pstatus: string; session: string }>(
      `select b.status, p.status pstatus, p.checkout_session_id session from bookings b join payments p on p.booking_id=b.id where b.reference=$1`, [refs[0]]);
    expect(row).toMatchObject({ status: "awaiting_confirmation", pstatus: "authorized" });
    const evts = await q(`select type from processed_webhooks where type='checkout.session.completed' and processed_at > now() - interval '5 minutes'`);
    expect(evts.length).toBeGreaterThan(0);
  });

  test("A: replaying the same signed event is a no-op", async () => {
    const [evt] = await q<{ event_id: string }>(`select event_id from processed_webhooks where type='checkout.session.completed' order by processed_at desc limit 1`);
    const before = await q(`select count(*)::int n from booking_events`);
    execFileSync("stripe", ["events", "resend", evt.event_id], { env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY }, stdio: "pipe" });
    await new Promise((r) => setTimeout(r, 4000));
    const after = await q(`select count(*)::int n from booking_events`);
    expect(after).toEqual(before);
    const listen = await import("node:fs").then((fs) => fs.readFileSync(".data/stripe-listen.log", "utf8"));
    expect(listen).toContain(evt.event_id);
  });

  test("A: confirm captures; partial refund is reflected via charge.refunded", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signInDoctor(page);
    await page.goto("/admin/appointments?status=awaiting_confirmation");
    await page.getByRole("row").filter({ hasText: refs[0] }).getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Confirm appointment" }).click();
    await expect(page.getByRole("cell", { name: "succeeded" })).toBeVisible({ timeout: 30_000 });
    // Doctors cannot issue refunds (least privilege) — the practice administrator does.
    await expect(page.getByLabel("Refund amount (AED)")).toHaveCount(0);
    await page.context().clearCookies();
    await signInAdmin(page);
    await page.goto("/admin/appointments?status=confirmed");
    await page.getByRole("row").filter({ hasText: refs[0] }).getByRole("link", { name: "Open" }).click();
    await page.getByLabel("Refund amount (AED)").fill("100");
    await page.getByLabel("Refund reason").fill("E2E partial refund");
    await page.getByRole("button", { name: "Refund", exact: true }).click();
    await expect.poll(async () => (await q(`select count(*)::int n from processed_webhooks where type='charge.refunded' and processed_at > now() - interval '5 minutes'`))[0].n as number, { timeout: 30_000 }).toBeGreaterThan(0);
    const [p] = await q<{ status: string; refunded: number }>(`select p.status, p.amount_refunded_minor refunded from payments p join bookings b on b.id=p.booking_id where b.reference=$1`, [refs[0]]);
    expect(p).toEqual({ status: "partially_refunded", refunded: 10000 });
  });

  test("C: returning patient's follow-up payment is confirmed by the webhook alone", async ({ page }) => {
    await webhookOnly(page);
    await signIn(page, email);
    await page.waitForURL(/\/en\/portal/);
    await page.goto("/en/book?kind=clinic");
    await dismissConsent(page);
    refs.push(await bookAndPay(page, /Follow-up consultation/));
    const rows = await q<{ reference: string; account: string; status: string }>(
      `select reference, account_user_id account, status from bookings where reference = any($1)`, [refs]);
    expect(new Set(rows.map((r) => r.account)).size).toBe(1);
    expect(rows.find((r) => r.reference === refs[1])?.status).toBe("awaiting_confirmation");
    void eventsFor;
  });
});
