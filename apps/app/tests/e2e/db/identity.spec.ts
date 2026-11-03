// IDN acceptance (plan IDN, IDN-Z1): a user created the way the Microsoft sign-in creates one
// (createMicrosoftUser, just-in-time) who holds a role gets that role's cases in the inbox, and one
// of an unknown department does not. Own company, deleted at the end, like
// structure.spec.ts. The test names nobody but the visible title: who sees what follows from the seat.
import type { Browser, Page } from "@playwright/test";
import { expect, publishIdea, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { createMicrosoftUser } from "../../../src/lib/db/accounts";
import { generateLoginCode, hashLoginCode } from "../../../src/features/auth/login-code";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `idn-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;
const JANA = { name: "Jana Neumann", department: "Engineering" };
const OLAF = { name: "Olaf Brenner", department: "Marketing" };

const codes = new Map<string, string>();

async function createCompany() {
  const made = await createTestCompany({
    slug: SLUG, name: `IDN ${STAMP}`, template: "demo", stage: "demo",
    people: PEOPLE.map((p) => ({ ...p, email: emailOf(p.name, SLUG) })),
  });
  for (const [name, code] of made) codes.set(name, code);
}

/** A new login code: a fresh code, its hash on the user. */
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
  test.beforeAll(async () => {
    await createCompany();
    const company = await getDb().company.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!company) throw new Error(`company ${SLUG} was not created`);
    await jitLeader(company.id, JANA, 1);
    await jitLeader(company.id, OLAF, 2);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("the leader of Engineering sees a test-rig case in the inbox, the leader of Marketing does not", async ({ browser }) => {
    const title = `Reserve the endurance rig for experiments ${STAMP}`;
    const member = await signIn(browser, "J. Schmidt");
    await publishIdea(member, title, "M. Roth");

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
