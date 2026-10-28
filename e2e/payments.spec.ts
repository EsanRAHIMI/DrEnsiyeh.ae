import { expect, test } from "@playwright/test";
import { dismissConsent, expectStatus, payWithTestCard, signIn, signInDoctor } from "./helpers";

// Runs only against Stripe TEST mode (sk_test_ key). Uses Stripe's published test card.
test.skip(!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"), "Stripe test key not configured");

const email = `paid.${Date.now()}@example.test`;
const refs: string[] = [];

async function pickFirstSlotAndPay(page: import("@playwright/test").Page, name: string, fillContact: boolean, service?: RegExp) {
  await page.getByRole("button", { name: "No — continue to booking" }).click();
  await page.getByRole("radio").first().waitFor();
  if (service) await page.getByRole("radio", { name: service }).check();
  const slot = page.locator('button[aria-pressed="false"]').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await slot.waitFor();
  await slot.click();
  if (fillContact) {
    await page.getByLabel("Full name (as on ID)").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mobile number").fill("+971500004321");
  }
  await page.getByText("I have read the cancellation").click();
  if (service === undefined) await expect(page.getByText(/Follow-up consultation|Infectious disease consultation/).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWithTestCard(page);
}

test.describe.serial("Stripe test mode — Scenario A (new patient) and C (returning patient)", () => {
  test("A: new patient pays; booking is held as paid-awaiting-confirmation until the facility confirms", async ({ page }) => {
    await page.goto("/en/book?kind=clinic");
    await dismissConsent(page);
    await pickFirstSlotAndPay(page, "Paid Patient", true, /Infectious disease consultation/);
    await expectStatus(page, /Payment received — awaiting confirmation/);
    refs.push((await page.locator("strong").filter({ hasText: /^DR-/ }).first().textContent())!);
  });

  test("A: doctor confirms → payment captured → patient sees confirmation and invoice", async ({ page, browser }) => {
    await signInDoctor(page);
    await page.goto("/admin/appointments?status=awaiting_confirmation");
    await page.getByRole("row").filter({ hasText: refs[0] }).getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("cell", { name: "authorized" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm appointment" }).click();
    await expect(page.getByRole("cell", { name: "succeeded" })).toBeVisible({ timeout: 30_000 });

    const patient = await browser.newPage();
    await signIn(patient, email);
    await patient.waitForURL(/\/en\/portal/);
    await patient.goto("/en/portal/payments");
    await expect(patient.getByText(refs[0])).toBeVisible();
    await expect(patient.getByRole("cell", { name: "Paid" })).toBeVisible();
    await patient.getByRole("link", { name: /^INV-/ }).first().click();
    await expect(patient.getByRole("heading", { name: /Invoice INV-/ })).toBeVisible();
  });

  test("C: returning patient signs in, books a follow-up and pays", async ({ page }) => {
    await signIn(page, email);
    await page.waitForURL(/\/en\/portal/);
    await page.goto("/en/portal/appointments");
    await expect(page.getByText(refs[0])).toBeVisible();
    await page.goto("/en/book?kind=clinic&service=follow-up-consultation");
    await dismissConsent(page);
    await pickFirstSlotAndPay(page, "Paid Patient", true);

    await expectStatus(page, /Payment received — awaiting confirmation/);
    const ref = (await page.locator("strong").filter({ hasText: /^DR-/ }).first().textContent())!;
    expect(ref).not.toBe(refs[0]);
    await page.goto("/en/portal/appointments");
    await expect(page.getByText(ref)).toBeVisible();
    await expect(page.getByText(refs[0])).toBeVisible();
  });
});
