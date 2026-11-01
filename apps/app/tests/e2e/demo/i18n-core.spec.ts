import { test, expect } from "../helpers";

test.describe("LNG html lang", () => {
  test("is en without a cookie", async ({ page }) => {
    await page.goto("/acme");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("is de with the cookie nextup_locale=de", async ({ page, context }) => {
    await context.addCookies([{ name: "nextup_locale", value: "de", domain: "localhost", path: "/" }]);
    await page.goto("/acme");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("falls back to en for an unknown locale cookie", async ({ page, context }) => {
    await context.addCookies([{ name: "nextup_locale", value: "fr", domain: "localhost", path: "/" }]);
    await page.goto("/acme");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
