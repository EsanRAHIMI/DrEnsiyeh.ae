import { expect, test } from "@playwright/test";
import { dismissConsent, signIn, signInDoctor } from "./helpers";

const patientEmail = `patient.${Date.now()}@example.test`;
let reference = "";

test.skip(!!process.env.STRIPE_SECRET_KEY, "Request-only flow runs when online payments are disabled");

test.describe.serial("Scenario A + D: clinic booking → patient portal → doctor confirmation", () => {
  test("new patient books a clinic consultation without an account", async ({ page }) => {
    await page.goto("/en");
    await dismissConsent(page);
    await page.getByRole("link", { name: "Book Clinic Visit" }).first().click();
    await page.getByRole("button", { name: "No — continue to booking" }).click();
    await page.getByRole("radio").first().check();
    const slot = page.locator('button[aria-pressed="false"]').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    await slot.waitFor();
    await slot.click();
    await page.getByLabel("Full name (as on ID)").fill("E2E Patient");
    await page.getByLabel("Email").fill(patientEmail);
    await page.getByLabel("Mobile number").fill("+971500001234");
    await page.getByText("I have read the cancellation").click();
    await page.getByRole("button", { name: /Send booking request|Continue to secure payment/ }).click();
    await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
    reference = (await page.locator("strong").filter({ hasText: /^DR-/ }).textContent()) ?? "";
    expect(reference).toMatch(/^DR-[A-Z0-9]{6}$/);
  });

  test("patient signs in with an emailed one-time code and sees the appointment", async ({ page }) => {
    await signIn(page, patientEmail);
    await page.waitForURL(/\/en\/portal/);
    await page.goto("/en/portal/appointments");
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText("Awaiting confirmation").first()).toBeVisible();
    await page.goto("/en/portal/records");
    await expect(page.getByText(/not yet available|identity needs to be confirmed/)).toBeVisible();
  });

  test("doctor signs in, enrols MFA, and confirms the appointment", async ({ page }) => {
    await signInDoctor(page);
    await page.goto("/admin/appointments?status=requested");
    await page.getByRole("row").filter({ hasText: reference }).getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Confirm appointment" }).click();
    await expect(page.getByText("Confirmed").first()).toBeVisible();
  });
});
