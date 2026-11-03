// ADM acceptance (plan ADM, ADM-Z1): a company created empty in /admin is configured in the app by
// its manager - second factor, setup wizard, seat link on Members - and the first case a member
// raises reaches the leader who holds the route's owner seat. /admin is used only to create the
// company and to delete it. Own company, like structure.spec.ts.
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, passSecondFactor, publishIdea, test } from "../helpers";

const STAMP = Date.now().toString(36);
const SLUG = `adm-${STAMP}`;
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE;
test.skip(!ADMIN_CODE || !process.env.DATABASE_URL, "needs DATABASE_URL and ADMIN_ACCESS_CODE (.env.local)");

const MANAGER = { name: "Wilhelmina Quarterfoil", email: `wilhelmina@${SLUG}.test` };
const LEADER = { name: "Ottokar Brindlemoor", email: `ottokar@${SLUG}.test` };
const MEMBER = { name: "Primrose Tallowby", email: `primrose@${SLUG}.test` };

const codes = new Map<string, string>();

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code").fill(ADMIN_CODE ?? "");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

/** The last thing /admin does: an empty sandbox company with one manager. */
async function createCompany(browser: Browser) {
  const page = await adminPage(browser);
  await page.goto("/admin/companies");
  await page.locator("#name").fill(`ADM ${STAMP}`);
  await page.locator("#slug").fill(SLUG);
  await page.locator("#template").selectOption("empty");
  await page.locator("#stage").selectOption("sandbox");
  await page.getByLabel("Name 1").fill(MANAGER.name);
  await page.getByLabel("Email 1").fill(MANAGER.email);
  await page.getByLabel("Role 1").selectOption("manager");
  await page.getByLabel("Department 1").fill("Management");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText(`${SLUG} is live.`)).toBeVisible({ timeout: 30_000 });
  const own = page.locator("div").filter({ has: page.locator(`strong:text-is("${MANAGER.name}")`) }).last();
  codes.set(MANAGER.name, (await own.locator('[class*="code"]').innerText()).trim());
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

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** A test id as it is on screen: a page kept from the step before may still sit hidden in the DOM. */
const vis = (from: Page | Locator, id: string) => from.locator(`[data-testid="${id}"]:visible`);
const setup = (page: Page) => page.goto(`/${SLUG}/settings/setup`);

/** Invite a person on the Members step; the mail carries the code, so a fresh one is issued from their row to read it. */
async function invite(page: Page, who: { name: string; email: string }, role: "leader" | "member") {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add and invite by mail" }) });
  await form.locator("input[name=name]").fill(who.name);
  await form.locator("input[name=email]").fill(who.email);
  await form.locator("select[name=role]").selectOption(role);
  await form.getByRole("button", { name: "Add and invite by mail" }).click();
}

/** Issue a fresh code from the person's row on the Members page and keep it: the invite mail carries the first one. */
async function readCode(page: Page, who: { name: string; email: string }) {
  const row = page.locator("li").filter({ hasText: who.email });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const shown = page.locator('[class*="codeValue"]');
  const before = (await shown.count()) ? await shown.innerText() : ""; // the invite's own code may be on screen still
  await row.getByRole("button", { name: "New code" }).click();
  await expect(page.getByText(`Login code for ${who.name}`)).toBeVisible({ timeout: 15_000 });
  if (before) await expect(shown).not.toHaveText(before, { timeout: 15_000 });
  codes.set(who.name, (await shown.innerText()).trim());
}

test.describe.serial("ADM acceptance: an empty company is configured in the app and its first case is routed", () => {
  test.beforeAll(async ({ browser }) => {
    await createCompany(browser);
  });

  test.afterAll(async ({ browser }) => {
    await deleteCompany(browser);
  });

  test("the manager sets the company up in the wizard, the member's case reaches the leader of the owner seat", async ({ browser }) => {
    const title = `Reserve the test rig for a week ${STAMP}`;

    // Sign in: code, then the second factor enrolment, then Setup.
    const manager = await signIn(browser, MANAGER.name);
    await manager.goto(`/${SLUG}/settings`);
    await expect(manager).toHaveURL(/\/settings\/setup/);
    await expect(vis(manager, "setup-step-company")).toBeVisible();

    // Step company.
    await vis(manager, "settings-company-name").fill(`ADM Test Works ${STAMP}`);
    await vis(manager, "settings-company-mission").fill("We build and test machines.");
    await vis(manager, "settings-company-save").click();
    // Saving makes the page derive the next step: the form gives way to Units on its own.

    // Step units.
    await expect(vis(manager, "setup-step-units")).toBeVisible();
    await vis(manager, "settings-org-unit-key").fill("ENG");
    await vis(manager, "settings-org-unit-name").fill("Engineering");
    await vis(manager, "settings-org-unit-add").click();
    await expect(vis(manager, "settings-org-unit-ENG")).toBeVisible();

    // Step roles: a role with two seats; the manager holds one, so the step is done; the other waits for the leader.
    await setup(manager);
    await expect(vis(manager, "setup-step-roles")).toBeVisible();
    await vis(manager, "settings-org-role-title").fill("Engineering lead");
    await vis(manager, "settings-org-role-add").click();
    const role = manager.locator('li[data-testid^="settings-org-role-"]');
    await expect(role).toHaveCount(1);
    await vis(role, "settings-org-seat-name").fill("Lead seat");
    await vis(role, "settings-org-seat-add").click();
    await expect(role.getByText("Lead seat")).toBeVisible();
    await vis(role, "settings-org-seat-name").fill("Deputy seat");
    await vis(role, "settings-org-seat-add").click();
    await expect(role.getByText("Deputy seat")).toBeVisible();
    await role.locator('div[data-testid^="settings-org-seat-"]').filter({ hasText: "Deputy seat" })
      .getByTestId("settings-org-seat-link").selectOption({ label: MANAGER.name });

    // Step routes.
    await setup(manager);
    await expect(vis(manager, "setup-step-routes")).toBeVisible();
    // The route form is a drawer; its key comes from the request type.
    await vis(manager, "settings-routing-open-new").click();
    const route = vis(manager, "settings-routing-new");
    await vis(route, "settings-routing-type").fill("Test rig time");
    await vis(route, "settings-routing-keywords").fill("rig, test");
    await vis(route, "settings-routing-owner").selectOption({ index: 1 });
    await vis(route, "settings-routing-add").click();

    // Step members: invite the leader and the member (the saved route moved the wizard on).
    await expect(vis(manager, "setup-step-members")).toBeVisible();
    await invite(manager, LEADER, "leader");
    // One more person than the admin and Setup is done: the wizard says so by itself.
    await expect(vis(manager, "setup-step-done")).toBeVisible();

    // The rest happens on the Members page: the member, both codes, and the leader's seat.
    await manager.goto(`/${SLUG}/settings/members`);
    await invite(manager, MEMBER, "member");
    await readCode(manager, MEMBER);
    await readCode(manager, LEADER);
    const leaderRow = manager.locator("li").filter({ hasText: LEADER.email });
    await leaderRow.getByLabel(`Free seat for ${LEADER.name}`).selectOption({ index: 1 });
    await expect(leaderRow.getByRole("button", { name: /^Unlink / })).toBeVisible();
    await manager.context().close();

    // The member raises a case about the rig; the leader sees it in the inbox.
    const member = await signIn(browser, MEMBER.name);
    await publishIdea(member, title, "Lead seat"); // the route owner is offered by its seat name
    await member.context().close();

    const leader = await signIn(browser, LEADER.name);
    await leader.goto(`/${SLUG}/leader`);
    await expect(leader.getByRole("main").getByText(title).first()).toBeVisible();
    await leader.context().close();
  });
});
