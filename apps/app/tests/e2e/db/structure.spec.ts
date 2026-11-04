// STR acceptance (plan STR, STR-Z1): a company created empty shows nothing of acme's
// structure or demo content on its pages, and one created from the demo template still shows
// acme's routes and goals. Own companies, deleted at the end, like company-login.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, showSidebar, START, test } from "../helpers";
import { BUDDIES, DEPTS, LEADERS, PEOPLE, ROLES, ROUTES } from "../../../src/features/demo/seed";
import { DEMO_GOALS } from "../../../src/features/demo/structure";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const EMPTY_SLUG = `str-e-${STAMP}`;
const DEMO_SLUG = `str-d-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

// D8: every acme marker the pages of an empty company must not show.
const nameOf = (s: string) => s.split(" · ")[0];
const MARKERS = [...new Set([
  ...PEOPLE.map((p) => p.name),
  ...LEADERS,
  ...ROLES.map((r) => r.who.name),
  ...ROUTES.flatMap((r) => [r.owner.name, r.deputy, nameOf(r.buddy)]),
  ...BUDDIES.map((b) => b.name),
  ...DEPTS.map((d) => d.name),
  ...DEMO_GOALS.map((g) => g.goal),
  "€5k",
])].filter(Boolean);

// Made-up names and departments that appear nowhere in the demo seed.
const EMPTY_PEOPLE = [
  { name: "Wilhelmina Quarterfoil", role: "manager", dept: "Zephyrwerk" },
  { name: "Ottokar Brindlemoor", role: "leader", dept: "Zephyrwerk Nord" },
  { name: "Primrose Tallowby", role: "member", dept: "Zephyrwerk Nord, Halle 9" },
] as const;
const DEMO_PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "T. Vogel", role: "leader", dept: "Production" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;

const codes = new Map<string, string>(); // `${slug}|${name}` -> code

async function createCompany(
  slug: string, template: "empty" | "demo", stage: "sandbox" | "demo",
  people: readonly { name: string; role: "manager" | "leader" | "member"; dept: string }[],
) {
  const made = await createTestCompany({
    slug, name: `STR ${template} ${STAMP}`, template, stage,
    people: people.map((p) => ({ ...p, email: emailOf(p.name, slug) })),
  });
  for (const [name, code] of made) codes.set(`${slug}|${name}`, code);
}

async function signIn(browser: Browser, slug: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${slug}/login`);
  await page.locator("#code").fill(codes.get(`${slug}|${name}`) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${slug}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** The visible text of a page once it has loaded. */
async function textOf(page: Page, slug: string, path: string): Promise<string> {
  await page.goto(`/${slug}${path}`);
  await page.waitForLoadState("networkidle");
  return page.locator("body").innerText();
}

/** The raise page's analysis of one line: its sources (goals, routing, ...) are listed there. */
async function analysisText(page: Page, slug: string): Promise<string> {
  await page.goto(`/${slug}/raise`);
  await page.getByRole("textbox", { name: START }).fill("A shared calendar for the endurance rig");
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  const close = page.getByRole("button", { name: "Close analysis" });
  const answer = page.getByRole("textbox", { name: "Answer, or add more detail…" });
  await expect(close.or(answer).first()).toBeVisible({ timeout: 30_000 });
  await showSidebar(page);
  if (!(await close.isVisible())) await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(close).toBeVisible();
  return page.locator("body").innerText();
}

test.describe.serial("STR acceptance: an empty company has no acme content and acme is unchanged", () => {
  test.beforeAll(async () => {
    await createCompany(EMPTY_SLUG, "empty", "sandbox", EMPTY_PEOPLE);
    await createCompany(DEMO_SLUG, "demo", "demo", DEMO_PEOPLE);
  });

  test.afterAll(async () => {
    await deleteTestCompany(EMPTY_SLUG);
    await deleteTestCompany(DEMO_SLUG);
  });

  test("the empty company shows none of acme's markers to any of its people", async ({ browser }) => {
    for (const p of EMPTY_PEOPLE) {
      const page = await signIn(browser, EMPTY_SLUG, p.name);
      const paths = ["/", "/leader", "/raise", ...(p.role === "manager" ? ["/settings/routing"] : [])];
      for (const path of paths) {
        const text = path === "/raise" ? await analysisText(page, EMPTY_SLUG) : await textOf(page, EMPTY_SLUG, path);
        for (const marker of MARKERS) {
          const at = text.indexOf(marker);
          expect(at, `${p.name} on ${path} shows acme marker "${marker}": ${at < 0 ? "" : text.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, " ")}`).toBe(-1);
        }
        if (path === "/raise") expect(text, `${p.name} raise page goal count`).toMatch(/\b0 goals checked\b/);
      }
      await page.context().close();
    }
  });

  test("the demo company lists every route type with its owner and counts four goals", async ({ browser }) => {
    const manager = await signIn(browser, DEMO_SLUG, "B. Hartmann");
    const routing = await textOf(manager, DEMO_SLUG, "/settings/routing");
    for (const r of ROUTES) {
      expect(routing, `route type "${r.type}"`).toContain(r.type);
      // Routes name the owner seat's role; the demo template has no holder for it.
      expect(routing, `owner of "${r.type}"`).toContain(r.owner.role);
    }
    const member = await signIn(browser, DEMO_SLUG, "J. Schmidt");
    const raise = await analysisText(member, DEMO_SLUG);
    expect(raise).toMatch(/\b4 goals checked\b/);
    expect(DEMO_GOALS).toHaveLength(4);
  });
});
