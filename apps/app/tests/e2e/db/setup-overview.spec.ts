// The setup overview on a multi-tenant stack: no console, so no IT phases. Who may open it, how coming
// back still leads to the right step, and that the page does not poll while nothing waits. The stack
// admin and the support session need a one-company stack, so they are in itc-console.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test, vis } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { createTestCompany, deleteTestCompany } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `sov-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const MANAGER = { name: "Wilhelmina Overview", email: `wilhelmina@${SLUG}.test` };
const LEADER = { name: "Ottokar Overview", email: `ottokar@${SLUG}.test` };
const MEMBER = { name: "Primrose Overview", email: `primrose@${SLUG}.test` };
const FLAGGED = { name: "Stacey Overview", email: `stacey@${SLUG}.test` };

let codes: Map<string, string>;

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

const NOT_FOUND = "Page not found";

async function setOpenedAt(openedAt: Date | null) {
  await getDb().company.updateMany({ where: { slug: SLUG }, data: { openedAt } });
}

const phase = (page: Page, key: string) => vis(page, `setup-phase-${key}`);

/** A streamed not-found can still answer 200, so the proof is what the page shows. */
async function expectNotFound(page: Page) {
  await page.goto(`/${SLUG}/setup`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND);
  await expect(page.getByTestId("setup-overview")).toHaveCount(0);
}

test.describe.serial("setup overview, multi-tenant", () => {
  test.beforeAll(async () => {
    codes = await createTestCompany({
      slug: SLUG, name: `SOV ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { ...MANAGER, role: "manager", dept: "Management" },
        { ...LEADER, role: "leader", dept: "Plant" },
        { ...MEMBER, role: "member", dept: "Plant" },
        { ...FLAGGED, role: "member", dept: "Plant" },
      ],
    });
    // The flag means nothing where there is no console.
    const company = await getDb().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
    await getDb().user.updateMany({ where: { companyId: company.id, email: FLAGGED.email }, data: { isStackAdmin: true } });
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("without a session it asks to sign in first", async ({ page }) => {
    await page.goto(`/${SLUG}/setup`);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/login\\?next=%2Fsetup`));
  });

  test("anyone who is no setup person gets a 404", async ({ browser }) => {
    for (const person of [MEMBER, LEADER, FLAGGED]) {
      const page = await signIn(browser, person.name);
      await expectNotFound(page);
      await page.context().close();
    }
  });

  test("a manager sees the company phases only, and coming back leads to the right step", async ({ browser }) => {
    await setOpenedAt(null);
    const manager = await signIn(browser, MANAGER.name);
    await manager.goto(`/${SLUG}/setup`);
    await expect(vis(manager, "setup-overview")).toBeVisible();
    for (const key of ["server", "signIn", "connectors"]) await expect(manager.getByTestId(`setup-phase-${key}`)).toHaveCount(0);

    await expect(phase(manager, "context")).toHaveAttribute("data-status", "notUsed");
    await expect(phase(manager, "company")).toHaveAttribute("data-status", "yourTurn");
    await expect(phase(manager, "company").getByTestId("setup-phase-status")).toHaveText("Your turn");
    await expect(phase(manager, "open")).toHaveAttribute("data-status", "waiting");
    await expect(vis(manager, "setup-overview-progress")).toHaveText("1 of 3 phases finished");

    // The first step has nothing to resume.
    await phase(manager, "company").getByTestId("setup-phase-link").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup/company$`));
    await expect(manager.getByTestId("setup-resume")).toHaveCount(0);
    await vis(manager, "setup-company-name").fill(`SOV Works ${STAMP}`);
    await vis(manager, "setup-company-save").click();
    await expect(vis(manager, "setup-next")).toBeEnabled();

    // Back on the overview, the link picks up at the next step and that page says so.
    await vis(manager, "setup-all-phases").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup$`));
    await expect(phase(manager, "company")).toContainText("Next is step 2 of 5: Units.");
    await phase(manager, "company").getByTestId("setup-phase-link").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup/units\\?resume=1$`));
    await expect(vis(manager, "setup-resume")).toBeVisible();
    await manager.context().close();
  });

  test("phase 6 reads done once the company is opened", async ({ browser }) => {
    await setOpenedAt(new Date());
    const manager = await signIn(browser, MANAGER.name);
    await manager.goto(`/${SLUG}/setup`);
    await expect(phase(manager, "open")).toHaveAttribute("data-status", "done");
    await expect(phase(manager, "open")).toContainText("NextUp was opened on");
    await manager.context().close();
  });

  test("the page does not poll while nothing waits", async ({ browser }) => {
    const manager = await signIn(browser, MANAGER.name);
    await manager.goto(`/${SLUG}/setup`);
    const overview = vis(manager, "setup-overview");
    await expect(overview).toBeVisible();
    await expect(overview).not.toHaveAttribute("data-polling");
    await expect(manager.getByTestId("setup-overview-watching")).toHaveCount(0);
    // A refresh asks for the page's server payload, and a prefetch says it is one.
    const refreshes: string[] = [];
    manager.on("request", (r) => { if (r.headers()["rsc"] && !r.headers()["next-router-prefetch"]) refreshes.push(r.url()); });
    await manager.waitForTimeout(17_000); // longer than the poll's interval
    expect(refreshes).toEqual([]);
    await manager.context().close();
  });
});
