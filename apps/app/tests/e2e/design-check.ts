// The design rules as a browser sees them, for one open page: nothing painted black, no tab strip with a vertical
// scrollbar, nothing running off the side. Set DESIGN_SHOTS to a folder to keep a screenshot of every page checked.
import { expect, type Page } from "@playwright/test";

export async function checkDesign(page: Page, name: string) {
  const found = await page.evaluate(() => {
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)}`;
    const black = [...document.querySelectorAll("body *")].filter((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return false;
      return Math.max(Number(m[1]), Number(m[2]), Number(m[3])) <= 48 && visible(el);
    }).map(describe);
    const strips = [...document.querySelectorAll("nav")].filter((el) => {
      const overflowY = getComputedStyle(el).overflowY;
      return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight && visible(el);
    }).map(describe);
    return { black, strips, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(found.black, `${name}: black fills`).toEqual([]);
  expect(found.strips, `${name}: a nav with a vertical scrollbar`).toEqual([]);
  expect(found.overflow, `${name}: runs off the side`).toBeLessThanOrEqual(0);
  const folder = process.env.DESIGN_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
}
