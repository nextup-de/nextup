// The design rules on the demo pages: tabs never show a vertical scrollbar, one token changes the blue, and no page
// paints a black fill, for each person who can reach it. The server pages are in tests/e2e/db/design-guard.spec.ts.
import type { Page } from "@playwright/test";
import { checkDesign } from "../design-check";
import { expect, test } from "../helpers";

const SWAP = "rgb(200, 0, 120)";
type Persona = "Employee" | "Team leader" | "Manager";

async function viewAs(page: Page, persona: Persona) {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

const EVERYONE = ["raise", "inbox", "feed", "projects", "projects/collaboration", "projects/progress", "profile", "team", "projects/pj2", "projects/pj2?tab=board", "projects/pj2?tab=team", "projects/pj2?tab=results", "projects/pj2?tab=activity", "projects/pj2?tab=files", "cases/c9"];
const PAGES: Record<Persona, string[]> = {
  Employee: EVERYONE,
  "Team leader": [...EVERYONE, "decisions"],
  Manager: [...EVERYONE, "decisions", "dashboard"],
};

test("a tab strip has no vertical scrollbar", async ({ page }) => {
  await page.goto("/acme/projects");
  const strip = page.getByTestId("projects-tabs").getByRole("navigation");
  await expect(strip).toBeVisible();
  const { scrollHeight, clientHeight } = await strip.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
});

test("changing one token changes the blue of the nav, the tabs and a button", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the nav thumb is measured on desktop");
  await page.goto("/acme/projects");
  await expect(page.getByTestId("projects-tabs")).toBeVisible();
  await page.addStyleTag({ content: `:root { --nh-brand: ${SWAP}; }` });
  const thumb = await page.locator("[class*=navThumb]").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(thumb).toBe(SWAP);
  const underline = await page.getByTestId("projects-tabs").locator('[aria-current="page"]').evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(underline).toBe(SWAP);
  // A filled selected control, when the page has one (the ideas column's Open | Archive tabs became a menu).
  const selected = page.locator('[class*="segment"] [aria-pressed="true"], [role="tablist"] [aria-selected="true"], button[data-active="true"]').first();
  const on = (await selected.count()) > 0 ? await selected.evaluate((el) => getComputedStyle(el).backgroundColor) : null;
  if (on !== null && on !== "rgba(0, 0, 0, 0)" && on !== "rgb(255, 255, 255)") expect(on).toBe(SWAP);
});

for (const persona of Object.keys(PAGES) as Persona[]) {
  test(`no black fill on any page, as ${persona}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/acme/raise");
    await viewAs(page, persona);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES[persona]) {
        await page.goto(`/acme/${path}`);
        await expect(page.getByRole("main").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await checkDesign(page, `${persona} ${path} ${width}`);
      }
    }
  });
}
