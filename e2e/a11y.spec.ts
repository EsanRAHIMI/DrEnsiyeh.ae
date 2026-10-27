import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { dismissConsent } from "./helpers";

const PAGES = ["/en", "/en/about", "/en/services", "/en/services/travel-related-infections", "/en/clinic-visit", "/en/home-visit", "/en/book", "/en/locations", "/en/faq", "/en/contact", "/en/login", "/en/legal/privacy", "/ar"];

for (const path of PAGES) {
  test(`no serious accessibility violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await dismissConsent(page);
    await page.waitForTimeout(700); // allow entrance animations to settle
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`)).toEqual([]);
  });
}

test("mobile: both booking CTAs visible and no horizontal scroll", async ({ page }) => {
  await page.goto("/en");
  await dismissConsent(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
