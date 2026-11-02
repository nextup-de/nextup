// STR acceptance (plan STR, STR-Z1): a company created empty in /admin shows nothing of acme's
// structure or demo content on its pages, and one created from the demo template still shows
// acme's routes and goals. Own companies, deleted at the end, like company-login.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../helpers";
import { BUDDIES, DEPTS, LEADERS, PEOPLE, ROLES, ROUTES } from "../../../src/features/demo/seed";
import { DEMO_GOALS } from "../../../src/features/demo/structure";

const STAMP = Date.now().toString(36);
const EMPTY_SLUG = `str-e-${STAMP}`;
const DEMO_SLUG = `str-d-${STAMP}`;
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE;
test.skip(!ADMIN_CODE || !process.env.DATABASE_URL, "needs DATABASE_URL and ADMIN_ACCESS_CODE (.env.local)");

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

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code").fill(ADMIN_CODE ?? "");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

async function createCompany(
  browser: Browser, slug: string, template: "empty" | "demo", stage: "sandbox" | "demo",
  people: readonly { name: string; role: string; dept: string }[],
) {
  const page = await adminPage(browser);
  await page.goto("/admin/companies");
  await page.locator("#name").fill(`STR ${template} ${STAMP}`);
  await page.locator("#slug").fill(slug);
  await page.locator("#template").selectOption(template);
  await page.locator("#stage").selectOption(stage);
  for (const [i, p] of people.entries()) {
    await page.getByLabel(`Name ${i + 1}`).fill(p.name);
    await page.getByLabel(`Email ${i + 1}`).fill(`${p.name.replace(/\W+/g, ".").toLowerCase()}@${slug}.test`);
    await page.getByLabel(`Role ${i + 1}`).selectOption(p.role);
    await page.getByLabel(`Department ${i + 1}`).fill(p.dept);
  }
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText(`${slug} is live.`)).toBeVisible({ timeout: 30_000 });
  for (const p of people) {
    const own = page.locator("div").filter({ has: page.locator(`strong:text-is("${p.name}")`) }).last();
    codes.set(`${slug}|${p.name}`, (await own.locator('[class*="code"]').innerText()).trim());
  }
  await page.context().close();
}

async function deleteCompany(browser: Browser, slug: string) {
  const page = await adminPage(browser);
  await page.goto("/admin/companies");
  page.on("dialog", (d) => d.accept(slug));
  const remove = page.locator(`form:has(input[name="slug"][value="${slug}"])`).filter({ has: page.getByRole("button", { name: "Delete" }) });
  if (await remove.count()) {
    await remove.getByRole("button", { name: "Delete" }).click();
    await expect(async () => {
      await page.reload();
      await expect(remove).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
  await page.context().close();
}

async function signIn(browser: Browser, slug: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${slug}/login`);
  await page.locator("#code").fill(codes.get(`${slug}|${name}`) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** The visible text of a page once it has loaded. */
async function textOf(page: Page, slug: string, path: string): Promise<string> {
  await page.goto(`/${slug}${path}`);
  await page.waitForLoadState("networkidle");
  return page.locator("body").innerText();
}

test.describe.serial("STR acceptance: an empty company has no acme content and acme is unchanged", () => {
  test.beforeAll(async ({ browser }) => {
    await createCompany(browser, EMPTY_SLUG, "empty", "sandbox", EMPTY_PEOPLE);
    await createCompany(browser, DEMO_SLUG, "demo", "demo", DEMO_PEOPLE);
  });

  test.afterAll(async ({ browser }) => {
    await deleteCompany(browser, EMPTY_SLUG);
    await deleteCompany(browser, DEMO_SLUG);
  });

  test("the empty company shows none of acme's markers to any of its people", async ({ browser }) => {
    for (const p of EMPTY_PEOPLE) {
      const page = await signIn(browser, EMPTY_SLUG, p.name);
      const paths = ["/", "/leader", "/raise", ...(p.role === "manager" ? ["/settings/routing"] : [])];
      for (const path of paths) {
        const text = await textOf(page, EMPTY_SLUG, path);
        for (const marker of MARKERS) {
          expect(text.includes(marker), `${p.name} on ${path} shows acme marker "${marker}"`).toBe(false);
        }
        if (path === "/raise" && !/\/login/.test(page.url())) {
          expect(text, `${p.name} raise page goal count`).toMatch(/\b0 goals checked\b/);
        }
      }
      await page.context().close();
    }
  });

  test("the demo company lists every route type with its owner and counts four goals", async ({ browser }) => {
    const manager = await signIn(browser, DEMO_SLUG, "B. Hartmann");
    const routing = await textOf(manager, DEMO_SLUG, "/settings/routing");
    for (const r of ROUTES) {
      expect(routing, `route type "${r.type}"`).toContain(r.type);
      expect(routing, `owner of "${r.type}"`).toContain(r.owner.name);
    }
    const member = await signIn(browser, DEMO_SLUG, "J. Schmidt");
    const raise = await textOf(member, DEMO_SLUG, "/raise");
    expect(raise).toMatch(/\b4 goals checked\b/);
    expect(DEMO_GOALS).toHaveLength(4);
  });
});
