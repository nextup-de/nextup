// One check for any page (plan UIP, D8): at desktop and phone width the page's marker shows, nothing runs
// off the side, no console error, and the title is Inter at 28 px.
import { expect, type Page } from "@playwright/test";
import { totpAt } from "../../../../src/features/auth/totp";
import type { TestCompany } from "../../../db/test-company";

export const SWEEP_WIDTHS = [1440, 375] as const;

/** Sign one person of a tests/db/test-company.ts company in, second factor included. */
export async function signIn(page: Page, company: TestCompany, name: string) {
  const person = company.people[name];
  await page.goto(`/${company.slug}/login`);
  await page.locator("#code").fill(person.code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const field = page.locator("#totp");
  await field.waitFor();
  await field.fill(totpAt(person.totpSecret, Date.now()));
  await field.press("Enter");
  await page.waitForURL((url) => !/\/login/.test(url.pathname));
}

export type SweepOptions = {
  /** The test id every page of this sweep must show. */
  marker?: string;
  /** Check the h1. Floor and sign-in pages keep their larger type. */
  title?: boolean;
  /** Narrow the sweep, for a phone-only page. */
  viewports?: readonly number[];
};

export async function sweepPages(page: Page, paths: readonly string[], options: SweepOptions = {}) {
  const { marker = "section-card", title = true, viewports = SWEEP_WIDTHS } = options;
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error") errors.push(m.text()); };
  page.on("console", onConsole);
  try {
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of paths) {
        const where = `${path} at ${width} px`;
        errors.length = 0;
        await page.goto(path);
        await expect(page.getByTestId(marker).first(), `${where}: no ${marker}`).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${where}: runs ${overflow} px off the side`).toBeLessThanOrEqual(0);
        if (title) {
          const h1 = await page.locator("h1").first().evaluate((el) => {
            const s = getComputedStyle(el);
            return { family: s.fontFamily, size: s.fontSize };
          });
          expect(h1.family, `${where}: title font`).toMatch(/inter/i);
          expect(h1.size, `${where}: title size`).toBe("28px");
        }
        expect(errors, `${where}: console errors`).toEqual([]);
      }
    }
  } finally {
    page.off("console", onConsole);
  }
}
