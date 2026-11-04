// The design rules as a browser sees them: tabs never show a vertical scrollbar, one token changes the blue, and no
// page paints a black fill. Each page-group PR adds its pages to CLEAN; at the end every page is on the list.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const SWAP = "rgb(200, 0, 120)";
const swapBlue = (page: Page) => page.addStyleTag({ content: `:root { --nh-brand: ${SWAP}; }` });

/** Pages whose group has been moved onto tokens: the black-fill check runs on these. */
const CLEAN: string[] = [];

test("a tab strip has no vertical scrollbar", async ({ page }) => {
  await page.goto("/acme/projects");
  const strip = page.getByTestId("projects-tabs").getByRole("navigation");
  await expect(strip).toBeVisible();
  const { scrollHeight, clientHeight } = await strip.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
});

test("changing one token changes the blue of the nav and the tabs", async ({ page }) => {
  await page.goto("/acme/projects");
  await expect(page.getByTestId("projects-tabs")).toBeVisible();
  await swapBlue(page);
  const fill = await page.locator('nav [aria-current="page"]').first().evaluate((el) => {
    const thumb = el.parentElement?.querySelector("[class*=navThumb]");
    return thumb ? getComputedStyle(thumb).backgroundColor : "";
  });
  expect(fill).toBe(SWAP);
  const underline = await page.getByTestId("projects-tabs").locator('[aria-current="page"]').evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(underline).toBe(SWAP);
});

for (const path of CLEAN) {
  test(`no black fill on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const black = await page.evaluate(() => [...document.querySelectorAll("body *")].flatMap((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
      if (!m || m[4] === "0") return [];
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const rect = el.getBoundingClientRect();
      return Math.max(r, g, b) <= 48 && rect.width > 0 && rect.height > 0 ? [`${el.tagName}.${String((el as HTMLElement).className)}`] : [];
    }));
    expect(black).toEqual([]);
  });
}
