// DESIGN_RULES.md, section 9, on the main pages as each person sees them in the demo: a screen has one filled button
// (the viewer's next move), and no heading repeats the bar's pill, the current page's entry or another heading.
// Selected states are blue too (a chosen filter, the current row): they carry aria-pressed, aria-current,
// aria-selected or aria-checked and are not counted as buttons to press.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const PAGES = {
  "Employee": ["/acme/raise", "/acme/ideas", "/acme/feed", "/acme/projects", "/acme/profile"],
  "Team leader": ["/acme/inbox", "/acme/inbox?id=c1", "/acme/idea?id=c1", "/acme/decisions", "/acme/feed", "/acme/projects", "/acme/projects/pj4", "/acme/projects/pj2", "/acme/projects/collaboration", "/acme/projects/progress", "/acme/profile"],
  "Manager": ["/acme/dashboard", "/acme/inbox", "/acme/decisions", "/acme/projects", "/acme/projects/pj3", "/acme/projects/pj1", "/acme/profile"],
} as const;

/** Dev panel -> "Viewing as". */
async function viewAs(page: Page, persona: string) {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Demo controls" })).toHaveCount(0);
}

/** What a screen shows against the two rules: the filled buttons to press, and every name it says more than once. */
async function read(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span"); probe.style.color = "var(--nh-brand)"; document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color; probe.remove();
    const main = document.querySelector("main");
    if (!main) return { filled: [] as string[], twice: [] as string[] };
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert], [hidden]") && !el.closest("details:not([open]) > :not(summary)");
    };
    const on = (el: Element, a: string) => { const v = el.getAttribute(a); return v !== null && v !== "false"; };
    const chosen = (el: Element) => ["aria-pressed", "aria-current", "aria-selected", "aria-checked"].some((a) => on(el, a));
    const name = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || el.getAttribute("aria-label") || "(no name)";
    const filled = [...main.querySelectorAll("button, a, [role=button]")]
      .filter((el) => seen(el) && !chosen(el) && !(el as HTMLButtonElement).disabled && getComputedStyle(el).backgroundColor === brand).map(name);
    // A name counts when it is drawn: a heading kept for screen readers only (1px, clipped) names the page without repeating it.
    const drawn = (el: Element) => { const r = el.getBoundingClientRect(); return seen(el) && r.width > 4 && r.height > 4 && getComputedStyle(el).position !== "absolute"; };
    const label = (el: Element | null) => (el ? [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() || name(el) : "");
    // The bar's pill names the area and the current tab or side-view page names the page; an area's first page may
    // carry the area's name there. What must not happen: a drawn heading that repeats either, or two equal headings.
    const nav = [
      label(document.querySelector('header nav [aria-current="page"]')),
      ...[...document.querySelectorAll('[data-testid$="-tabs"] [aria-current="page"], [data-testid$="-pages"] [aria-current="page"]')].filter(seen).map(label),
    ].filter(Boolean);
    const heads = [...main.querySelectorAll("h1, h2")].filter(drawn).map(name);
    const twiceList = heads.filter((h, i) => nav.includes(h) || heads.indexOf(h) !== i);
    return { filled, twice: [...new Set(twiceList)] };
  });
}

for (const [persona, paths] of Object.entries(PAGES)) {
  test(`quiet screens: one filled button and one name per page, as ${persona}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/acme");
    await expect(page).toHaveURL(/\/acme\/raise$/);
    await viewAs(page, persona);
    const broken: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      // The page is there once its skeleton went and the person's own content is drawn.
      await expect(page.getByRole("main")).not.toHaveText(/^\s*Loading…?\s*$/, { timeout: 30_000 });
      await expect.poll(async () => (await page.getByRole("main").innerText()).trim().length, { timeout: 30_000 }).toBeGreaterThan(15);
      await page.waitForTimeout(400); // folds and menus settle (reduced motion: short, not zero)
      const { filled, twice } = await read(page);
      if (filled.length > 1) broken.push(`${path}: ${filled.length} filled buttons (${filled.join(" | ")})`);
      if (twice.length) broken.push(`${path}: said twice (${twice.join(" | ")})`);
    }
    expect(broken, "DESIGN_RULES §9: one filled button per screen, one name per place").toEqual([]);
  });
}
