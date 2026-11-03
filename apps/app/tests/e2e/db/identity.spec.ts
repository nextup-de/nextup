// IDN acceptance (plan IDN, IDN-Z1): a user created the way the Microsoft sign-in creates one
// (createMicrosoftUser, just-in-time) who holds a role gets that role's cases in the inbox, and one
// of an unknown department does not. Own company through /admin, deleted at the end, like
// structure.spec.ts. The test names nobody but the visible title: who sees what follows from the seat.
import type { Browser, Page } from "@playwright/test";
import { expect, publishIdea, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { createMicrosoftUser } from "../../../src/lib/db/accounts";
import { generateLoginCode, hashLoginCode } from "../../../src/features/auth/login-code";

const STAMP = Date.now().toString(36);
const SLUG = `idn-${STAMP}`;
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE;
test.skip(!ADMIN_CODE || !process.env.DATABASE_URL, "needs DATABASE_URL and ADMIN_ACCESS_CODE (.env.local)");

const PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;
const JANA = { name: "Jana Neumann", department: "Engineering" };
const OLAF = { name: "Olaf Brenner", department: "Marketing" };

const codes = new Map<string, string>();

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code").fill(ADMIN_CODE ?? "");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

async function createCompany(browser: Browser) {
  const page = await adminPage(browser);
  await page.goto("/admin/companies");
  await page.locator("#name").fill(`IDN ${STAMP}`);
  await page.locator("#slug").fill(SLUG);
  await page.locator("#template").selectOption("demo");
  await page.locator("#stage").selectOption("demo");
  for (const [i, p] of PEOPLE.entries()) {
    await page.getByLabel(`Name ${i + 1}`).fill(p.name);
    await page.getByLabel(`Email ${i + 1}`).fill(`${p.name.replace(/\W+/g, ".").toLowerCase()}@${SLUG}.test`);
    await page.getByLabel(`Role ${i + 1}`).selectOption(p.role);
    await page.getByLabel(`Department ${i + 1}`).fill(p.dept);
  }
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText(`${SLUG} is live.`)).toBeVisible({ timeout: 30_000 });
  for (const p of PEOPLE) {
    const own = page.locator("div").filter({ has: page.locator(`strong:text-is("${p.name}")`) }).last();
    codes.set(p.name, (await own.locator('[class*="code"]').innerText()).trim());
  }
  await page.context().close();
}

async function deleteCompany(browser: Browser) {
  const page = await adminPage(browser);
  await page.goto("/admin/companies");
  page.on("dialog", (d) => d.accept(SLUG));
  const remove = page.locator(`form:has(input[name="slug"][value="${SLUG}"])`).filter({ has: page.getByRole("button", { name: "Delete" }) });
  if (await remove.count()) {
    await remove.getByRole("button", { name: "Delete" }).click();
    await expect(async () => {
      await page.reload();
      await expect(remove).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
  await page.context().close();
}

/** What /admin's new login code does: a fresh code, its hash on the user. */
async function jitLeader(companyId: string, who: { name: string; department: string }, n: number) {
  const { user } = await createMicrosoftUser(
    companyId,
    { oid: `oid-${STAMP}-${n}`, tid: `tid-${STAMP}`, email: `jit${n}@${SLUG}.test`, name: who.name, roles: [], department: who.department },
    "leader",
  );
  const code = generateLoginCode(SLUG);
  await getDb().user.update({ where: { id: user.id, companyId }, data: { loginCodeHash: hashLoginCode(code) } });
  codes.set(who.name, code);
}

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.describe.serial("IDN acceptance: a JIT user holding a role gets its cases", () => {
  test.beforeAll(async ({ browser }) => {
    await createCompany(browser);
    const company = await getDb().company.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!company) throw new Error(`company ${SLUG} was not created`);
    await jitLeader(company.id, JANA, 1);
    await jitLeader(company.id, OLAF, 2);
  });

  test.afterAll(async ({ browser }) => {
    await deleteCompany(browser);
  });

  test("the leader of Engineering sees a test-rig case in the inbox, the leader of Marketing does not", async ({ browser }) => {
    const title = `Reserve the endurance rig for experiments ${STAMP}`;
    const member = await signIn(browser, "J. Schmidt");
    await publishIdea(member, title, "Engineering lead");

    const jana = await signIn(browser, JANA.name);
    await jana.goto(`/${SLUG}/leader`);
    await expect(jana.getByRole("main").getByText(title).first()).toBeVisible();

    const olaf = await signIn(browser, OLAF.name);
    await olaf.goto(`/${SLUG}/leader`);
    await olaf.waitForLoadState("networkidle");
    await expect(olaf.getByRole("main")).toBeVisible();
    await expect(olaf.getByText(title)).toHaveCount(0);
  });
});
