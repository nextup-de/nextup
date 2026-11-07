// ITC acceptance (plan ITC, ITC-Z1): in a one-company stack /admin is the company's IT and privacy
// console - eight sections, no platform page - and NextUp support gets a read-only session the company
// can revoke. The company is made straight in the database (tests/db/test-company.ts), never through /admin.
// The server runs in single mode for this spec (playwright.db.config.ts).
import type { Browser, Page } from "@playwright/test";
import { expect, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { CONSOLE_SECTIONS } from "../../../src/features/admin/nav";
import { totpAt } from "../../../src/features/auth/totp";
import { getDb } from "../../../src/lib/db/client";
import { recordDirectoryRun, setDirectoryOn } from "../../../src/lib/db/directory-run";

const SLUG = "itc-console";
test.skip(!process.env.DATABASE_URL || !process.env.ADMIN_ACCESS_CODE, "needs DATABASE_URL and ADMIN_ACCESS_CODE");

const ADMIN = { name: "Ingrid Console", email: `ingrid@${SLUG}.test`, role: "manager" as const, stackAdmin: true };
const MANAGER = { name: "Mats Plain", email: `mats@${SLUG}.test`, role: "manager" as const };
const IT_PERSON = { name: "Ivo Stackman", email: `ivo@${SLUG}.test`, role: "member" as const, stackAdmin: true };
const LABELS = ["Overview", "Setup", "Access", "Connectors", "Assistant and data protection", "Company data", "Routing review", "Support access"];

let company: TestCompany;

async function consoleAsAdmin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code:visible").fill(company.people[ADMIN.name].code);
  await page.locator("#totp:visible").fill(totpAt(company.people[ADMIN.name].totpSecret, Date.now()));
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

/** Signs in to the app itself. A manager is asked for the authenticator code, a member is not. */
async function appAs(browser: Browser, person: { name: string; role: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.locator("#code:visible").fill(company.people[person.name].code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  if (person.role === "manager") {
    await page.locator("#totp:visible").fill(totpAt(company.people[person.name].totpSecret, Date.now()));
    await page.locator("form button[type=submit]").last().click();
  }
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

const phaseOf = (page: Page, key: string) => vis(page, `setup-phase-${key}`);
const linkOf = (page: Page, key: string) => phaseOf(page, key).getByTestId("setup-phase-link");
const statusOf = (page: Page, key: string) => phaseOf(page, key).getByTestId("setup-phase-status");
const PHASE_ROWS = /^setup-phase-(server|signIn|connectors|context|company|open)$/;

test.describe.serial("ITC acceptance", () => {
  test.beforeAll(async () => {
    await deleteTestCompany(SLUG);
    company = await createTestCompany(SLUG, [ADMIN, MANAGER, IT_PERSON]);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("ITC acceptance: the console shows only the own company and no platform page", async ({ browser }) => {
    // A stack admin: personal code and authenticator code. The nav is the eight sections, in order.
    const admin = await consoleAsAdmin(browser);
    const nav = admin.getByRole("navigation", { name: "Admin" });
    expect(CONSOLE_SECTIONS.map((s) => s.key)).toHaveLength(8);
    await expect(nav.getByRole("link")).toHaveText(LABELS);

    // No platform page: companies, requests, tickets and connections live on admin.sellux.ch.
    for (const path of ["companies", "requests", "tickets", "connections"]) {
      const res = await admin.goto(`/admin/${path}`);
      expect(res?.status(), `/admin/${path}`).toBe(404);
    }

    // A manager who is no console admin is sent to the login.
    const plain = await (await browser.newContext()).newPage();
    await plain.goto("/login");
    await plain.locator("#code:visible").fill(company.people[MANAGER.name].code);
    await plain.getByRole("button", { name: "Log in", exact: true }).click();
    await plain.locator("#totp:visible").fill(totpAt(company.people[MANAGER.name].totpSecret, Date.now()));
    await plain.locator("form button[type=submit]").last().click();
    await expect(plain).not.toHaveURL(/\/login/);
    await plain.goto("/admin");
    await expect(plain).toHaveURL(/\/admin\/login$/);
    await plain.context().close();

    // Open support access: the code is shown once.
    await admin.goto("/admin/support");
    await vis(admin, "console-support-open").click();
    const code = (await vis(admin, "console-support-code").innerText()).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    await admin.getByRole("button", { name: "Log out" }).click();
    await expect(admin).toHaveURL(/\/admin\/login$/);

    // Sign in with the support code: the banner shows, Connectors only reads.
    const support = await (await browser.newContext()).newPage();
    await support.goto("/admin/login");
    await support.locator("#supportCode:visible").fill(code);
    await vis(support, "console-support-signin").getByRole("button").click();
    await expect(support).toHaveURL(/\/admin$/);
    await expect(vis(support, "console-support-banner")).toContainText("NextUp support until");
    await support.goto("/admin/connectors");
    await expect(support.getByText("This is a support session: you can look, not change.")).toBeVisible();
    await expect(vis(support, "console-connectors-jira-save")).toBeDisabled();

    // The stack admin revokes; the support session ends on the next page.
    const again = await consoleAsAdmin(browser);
    await again.goto("/admin/support");
    await vis(again, "console-support-revoke").click();
    await expect(vis(again, "console-support-state")).toContainText("Support access is closed.");
    await support.goto("/admin/connectors");
    await expect(support.getByTestId("console-support-banner")).toHaveCount(0);
    await expect(support.getByTestId("console-connectors-jira")).toHaveCount(0);
    await again.context().close();
    await support.context().close();
    await admin.context().close();
  });

  // The story above only opens three sections; a section that throws on its own query needs opening
  // to be seen. The error screen comes after the loading boxes, so wait for a heading before judging.
  test("every console section opens, and Access lists the company's people", async ({ browser }) => {
    const admin = await consoleAsAdmin(browser);
    for (const { path } of CONSOLE_SECTIONS) {
      await admin.goto(path);
      const heading = admin.getByRole("heading", { level: 1 }).first();
      await expect(heading, path).toBeVisible();
      await expect(heading, path).not.toHaveText("This page could not be shown");
    }

    await admin.goto("/admin/people");
    await admin.getByTestId("console-people-picker").click();
    for (const person of [ADMIN, MANAGER]) {
      await admin.getByRole("combobox").fill(person.name);
      await expect(admin.getByRole("option", { name: new RegExp(person.name) })).toBeVisible();
    }
    await admin.context().close();
  });

  test("the account menu leads to Settings, and to the console for a console admin", async ({ browser }) => {
    const signIn = async (person: { name: string }) => {
      const page = await (await browser.newContext()).newPage();
      await page.goto("/login");
      await page.locator("#code:visible").fill(company.people[person.name].code);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await page.locator("#totp:visible").fill(totpAt(company.people[person.name].totpSecret, Date.now()));
      await page.locator("form button[type=submit]").last().click();
      await expect(page).not.toHaveURL(/\/login/);
      await page.getByRole("button", { name: "Profile" }).click();
      return page;
    };
    const admin = await signIn(ADMIN);
    const menu = admin.getByRole("dialog", { name: "Profile" });
    await expect(menu.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
    await menu.getByRole("link", { name: /IT console/ }).click();
    await expect(admin).toHaveURL(/\/admin\/login$/);
    await admin.context().close();

    const plain = await signIn(MANAGER);
    const plainMenu = plain.getByRole("dialog", { name: "Profile" });
    await plainMenu.getByRole("link", { name: /Settings/ }).click();
    await expect(plain).toHaveURL(/\/settings/);
    await plain.getByRole("button", { name: "Profile" }).click();
    await expect(plain.getByRole("dialog", { name: "Profile" }).getByRole("link", { name: /IT console/ })).toHaveCount(0);
    await plain.context().close();
  });

  test("setup overview: a stack admin works the IT phases, the rest only reads", async ({ browser }) => {
    const it = await appAs(browser, IT_PERSON);
    await it.goto("/setup");
    await expect(vis(it, "setup-overview")).toBeVisible();
    await expect(it.getByTestId(PHASE_ROWS)).toHaveCount(6);

    // The IT phases are theirs, and lead to the console. Nothing in the app changes the server.
    await expect(linkOf(it, "server")).toHaveCount(0);
    await expect(statusOf(it, "signIn")).toHaveText("Your turn");
    await expect(linkOf(it, "signIn")).toHaveAttribute("href", "/admin/people#microsoft");
    await expect(statusOf(it, "connectors")).toHaveText("Your turn");
    await expect(linkOf(it, "connectors")).toHaveAttribute("href", "/admin/connectors");

    // The rest is not their turn and has nowhere to go.
    await expect(statusOf(it, "company")).toHaveText("Open");
    for (const key of ["context", "company", "open"]) await expect(linkOf(it, key)).toHaveCount(0);

    // Behind the links are the manager's own pages: the same answer as for anyone else.
    await it.goto("/setup/company");
    await expect(it.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await it.context().close();
  });

  test("setup overview: a manager works the company phases and has no way into the console", async ({ browser }) => {
    const plain = await appAs(browser, MANAGER);
    await plain.goto("/setup");
    await expect(vis(plain, "setup-overview")).toBeVisible();
    await expect(statusOf(plain, "signIn")).toHaveText("Open");
    for (const key of ["server", "signIn", "connectors"]) await expect(linkOf(plain, key)).toHaveCount(0);
    await expect(statusOf(plain, "company")).toHaveText("Your turn");
    await expect(linkOf(plain, "company")).toHaveAttribute("href", "/setup/company");
    await expect(linkOf(plain, "context")).toHaveAttribute("href", "/setup/company#context");
    await expect(linkOf(plain, "open")).toHaveAttribute("href", "/setup/open");
    await plain.context().close();
  });

  test("setup overview: someone who is both works every phase", async ({ browser }) => {
    const both = await appAs(browser, ADMIN);
    await both.goto("/setup");
    await expect(linkOf(both, "signIn")).toHaveAttribute("href", "/admin/people#microsoft");
    await expect(linkOf(both, "company")).toHaveAttribute("href", "/setup/company");
    await both.context().close();
  });

  test("setup overview: a waiting directory sync turns to done without a reload", async ({ browser }) => {
    const { companyId } = company;
    const db = getDb();
    await db.company.update({ where: { id: companyId }, data: { entraTenantId: "00000000-0000-0000-0000-000000000000" } });
    await setDirectoryOn(companyId, true, "graph", null);
    const it = await appAs(browser, IT_PERSON);
    try {
      await it.goto("/setup");
      const signIn = phaseOf(it, "signIn");
      await expect(signIn).toHaveAttribute("data-status", "waiting");
      await expect(vis(it, "setup-line-directory")).toHaveText("The directory sync is on. Waiting for its first good run.");
      await expect(vis(it, "setup-overview")).toHaveAttribute("data-polling");
      await it.evaluate(() => { (window as unknown as { stillHere: boolean }).stillHere = true; });

      await recordDirectoryRun(companyId, { counts: { added: 1, updated: 0, deactivated: 0, handed: 0 } });

      await expect(signIn).toHaveAttribute("data-status", "done", { timeout: 45_000 });
      expect(await it.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
    } finally {
      await it.context().close();
      await db.directoryRun.deleteMany({ where: { companyId } });
      await db.company.update({ where: { id: companyId }, data: { entraTenantId: null } });
    }
  });

  test("setup overview: /admin/setup shows the same phases read-only, also to NextUp support", async ({ browser }) => {
    // A stack admin in the console reads it too: the work is done from the links.
    const admin = await consoleAsAdmin(browser);
    await admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Setup" }).click();
    await expect(admin).toHaveURL(/\/admin\/setup$/);
    await expect(admin.getByTestId(PHASE_ROWS)).toHaveCount(6);
    await expect(statusOf(admin, "company")).toHaveText("Open");

    await admin.goto("/admin/support");
    await vis(admin, "console-support-open").click();
    const code = (await vis(admin, "console-support-code").innerText()).trim();
    await admin.getByRole("button", { name: "Log out" }).click();

    const support = await (await browser.newContext()).newPage();
    await support.goto("/admin/login");
    await support.locator("#supportCode:visible").fill(code);
    await vis(support, "console-support-signin").getByRole("button").click();
    await expect(support).toHaveURL(/\/admin$/);
    await support.goto("/admin/setup");
    await expect(vis(support, "console-support-banner")).toBeVisible();
    await expect(vis(support, "setup-overview")).toBeVisible();

    // Nothing is anyone's turn here, nothing is actionable, and the only links are console pages.
    await expect(support.getByTestId(PHASE_ROWS)).toHaveCount(6);
    await expect(support.locator("[data-can-act]")).toHaveCount(0);
    await expect(support.getByText("Your turn")).toHaveCount(0);
    for (const key of ["server", "context", "company", "open"]) await expect(linkOf(support, key)).toHaveCount(0);
    await expect(linkOf(support, "signIn")).toHaveText("View");
    await expect(linkOf(support, "connectors")).toHaveAttribute("href", "/admin/connectors");

    // Behind the link, the console's own rule holds: a support session cannot write.
    await linkOf(support, "connectors").click();
    await expect(support.getByText("This is a support session: you can look, not change.")).toBeVisible();
    await expect(vis(support, "console-connectors-jira-save")).toBeDisabled();

    // Once the company revokes, the page is gone.
    const again = await consoleAsAdmin(browser);
    await again.goto("/admin/support");
    await vis(again, "console-support-revoke").click();
    await expect(vis(again, "console-support-state")).toContainText("Support access is closed.");
    await support.goto("/admin/setup");
    await expect(support.getByTestId("setup-overview")).toHaveCount(0);
    await support.context().close();
    await again.context().close();
    await admin.context().close();
  });

  test("a company stack has no static demo: /demo answers 404", async ({ request }) => {
    for (const path of ["/demo", "/demo/raise"]) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  });
});
