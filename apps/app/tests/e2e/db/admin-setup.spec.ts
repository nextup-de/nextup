// ADM acceptance (plan ADM, ADM-Z1): a company created empty and closed is configured in the app by
// its manager - second factor, setup wizard, seat link on Members - and opened. Nobody else can sign in
// before that, invitations wait for it, and the first case a member raises reaches the leader who holds
// the route's owner seat. The fixture creates the company in the database and deletes it. Own company, like
// structure.spec.ts. Runs on its own server, with a mail relay and a backup file (playwright.db.config.ts).
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, passSecondFactor, publishIdea, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `adm-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const MANAGER = { name: "Wilhelmina Quarterfoil", email: `wilhelmina@${SLUG}.test` };
const LEADER = { name: "Ottokar Brindlemoor", email: `ottokar@${SLUG}.test` };
const MEMBER = { name: "Primrose Tallowby", email: `primrose@${SLUG}.test` };

const codes = new Map<string, string>();

/** An empty, closed sandbox company with one manager. */
async function createCompany() {
  const made = await createTestCompany({
    slug: SLUG, name: `ADM ${STAMP}`, template: "empty", stage: "sandbox", closed: true,
    people: [{ ...MANAGER, role: "manager", dept: "Management" }],
  });
  for (const [name, code] of made) codes.set(name, code);
}

async function signIn(browser: Browser, name: string, next = ""): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** The mails the relay kept for this address. */
async function mailsTo(email: string): Promise<string[]> {
  const res = await fetch(`${process.env.E2E_SMTP_SINK}/mails`);
  const mails = (await res.json()) as { to: string[]; data: string }[];
  return mails.filter((m) => m.to.includes(email)).map((m) => m.data);
}

/** Next moves to the next page; it only opens once the step is done. */
const next = (page: Page) => vis(page, "setup-next").click();

/** Invite a person on the Members step; the mail carries the code, so a fresh one is issued from their row to read it. */
async function invite(page: Page, who: { name: string; email: string }, role: "leader" | "member") {
  await vis(page, "settings-members-open-invite").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add and invite by mail" }) });
  await form.locator("input[name=name]").fill(who.name);
  await form.locator("input[name=email]").fill(who.email);
  await form.locator("select[name=role]").selectOption(role);
  await form.getByRole("button", { name: "Add and invite by mail" }).click();
}

/** Issue a fresh code from the person's row on the Members page and keep it: the invite mail carries the first one. */
async function readCode(page: Page, who: { name: string; email: string }) {
  const row = page.locator('li[data-testid^="settings-member-"]').filter({ hasText: who.email });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('[data-testid^="settings-member-menu-"]').click(); // "New code" sits in the row's ··· menu
  const shown = page.locator('[class*="codeValue"]');
  const before = (await shown.count()) ? await shown.innerText() : ""; // the invite's own code may be on screen still
  await row.getByRole("button", { name: "New code" }).click();
  await expect(page.getByText(`Login code for ${who.name}`)).toBeVisible({ timeout: 15_000 });
  if (before) await expect(shown).not.toHaveText(before, { timeout: 15_000 });
  codes.set(who.name, (await shown.innerText()).trim());
}

test.describe.serial("ADM acceptance: an empty company is configured in the app and its first case is routed", () => {
  test.beforeAll(async () => {
    await createCompany();
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("the manager sets the company up and opens it, the member's case reaches the leader of the owner seat", async ({ browser }) => {
    const title = `Reserve the test rig for a week ${STAMP}`;

    // Sign in: code, then the second factor enrolment. While the company is closed, setup is home.
    const manager = await signIn(browser, MANAGER.name);
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup$`));
    await manager.goto(`/${SLUG}/settings`);
    await expect(manager).toHaveURL(/\/settings\/company/); // Settings holds the results; the pill leads to setup
    await vis(manager, "settings-setup-pill").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup$`));
    await vis(manager, "setup-phase-company").getByTestId("setup-phase-link").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup/company`));
    await expect(vis(manager, "setup-step-company")).toBeVisible();
    // A later step in the address leads back to the first one not done.
    await manager.goto(`/${SLUG}/setup/routes`);
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup/company`));

    // Step company: only the name is required.
    await vis(manager, "setup-company-name").fill(`ADM Test Works ${STAMP}`);
    await expect(vis(manager, "setup-next")).toBeDisabled();
    await vis(manager, "setup-company-save").click();
    await next(manager);

    // Step units: Next stays closed until the first unit is there.
    await expect(vis(manager, "setup-step-units")).toBeVisible();
    await expect(vis(manager, "setup-next")).toBeDisabled();
    await vis(manager, "setup-unit-new").click();
    await vis(manager, "setup-unit-name").fill("Engineering");
    await vis(manager, "setup-unit-key").fill("ENG");
    await vis(manager, "setup-unit-add").click();
    await expect(vis(manager, "setup-unit-ENG")).toBeVisible();
    await next(manager);

    // Step roles: a role with two seats. The manager holds one, the other stays vacant for the leader.
    await expect(vis(manager, "setup-step-roles")).toBeVisible();
    await vis(manager, "setup-role-new").click();
    await vis(manager, "setup-role-title").fill("Engineering lead");
    await vis(manager, "setup-seat-add").click();
    await manager.getByTestId("setup-seat-link").nth(1).selectOption({ label: MANAGER.name });
    await vis(manager, "setup-role-add").click();
    await expect(manager.locator('li[data-testid^="setup-role-"]')).toHaveCount(1);
    await next(manager);

    // Step routes.
    await expect(vis(manager, "setup-step-routes")).toBeVisible();
    await vis(manager, "setup-route-new").click();
    await vis(manager, "setup-route-type").fill("Test rig time");
    await vis(manager, "settings-routing-keywords").fill("rig, test");
    await vis(manager, "setup-route-owner").selectOption({ index: 1 });
    await vis(manager, "setup-route-add").click();
    await expect(manager.locator('li[data-testid^="setup-route-"]')).toHaveCount(1);
    // A half-filled form stays in its drawer, over Next: closing the drawer drops it, and nothing is saved.
    await vis(manager, "setup-route-new").click();
    await vis(manager, "setup-route-type").fill("Half a route");
    await manager.keyboard.press("Escape");
    await expect(manager.getByTestId("setup-route-drawer")).toHaveCount(0);
    await expect(manager.locator('li[data-testid^="setup-route-"]')).toHaveCount(1);
    await next(manager);

    // Step members: invite the leader. One more person than the admin and Setup is done.
    await expect(vis(manager, "setup-step-members")).toBeVisible();
    await vis(manager, "setup-member-new").click();
    await vis(manager, "setup-member-name").fill(LEADER.name);
    await vis(manager, "setup-member-email").fill(LEADER.email);
    await vis(manager, "setup-member-role").selectOption("leader");
    await vis(manager, "setup-member-add").click();
    const leaderAdded = manager.locator(`li[data-testid^="setup-member-"]`).filter({ hasText: LEADER.name });
    await expect(leaderAdded).toBeVisible();
    // The company is closed, so the invitation waits: no mail yet, and no code on screen.
    await expect(leaderAdded.getByTestId("setup-member-held")).toBeVisible();
    await expect(manager.getByTestId("setup-member-code")).toHaveCount(0);
    expect(await mailsTo(LEADER.email)).toEqual([]);
    await next(manager);
    await expect(vis(manager, "setup-step-done")).toBeVisible();

    // The rest happens on the Members page: the member, their code by hand, and the leader's seat.
    await manager.goto(`/${SLUG}/settings/members`);
    await invite(manager, MEMBER, "member");
    await expect(manager.getByTestId("settings-member-held")).toBeVisible();
    await readCode(manager, MEMBER);
    const leaderRow = manager.locator("li").filter({ hasText: LEADER.email });
    // Seats are linked in a dialog opened from the row's menu.
    await leaderRow.locator('summary[data-testid^="settings-member-menu-"]').click();
    await leaderRow.getByRole("button", { name: /^Seats/ }).click();
    const seats = manager.getByRole("dialog");
    await seats.getByLabel(`Free seat for ${LEADER.name}`).selectOption({ index: 1 });
    await expect(seats.getByRole("button", { name: /^Unlink / })).toBeVisible();

    // A member cannot sign in while the company is closed, and the login page says why.
    const early = await (await browser.newContext()).newPage();
    await early.goto(`/${SLUG}/login`);
    await expect(early.getByTestId("login-not-open")).toBeVisible();
    await early.locator("#code:visible").fill(codes.get(MEMBER.name) ?? "");
    await early.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(early.getByText("NextUp is not open yet at")).toBeVisible();
    await expect(early).toHaveURL(/\/login/);
    await early.context().close();

    // A `next` target wins over setup as home.
    const again = await signIn(browser, MANAGER.name, "/settings/members");
    await expect(again).toHaveURL(new RegExp(`/${SLUG}/settings/members`));
    await again.context().close();

    // The finish page leads to Open. The calendar was never saved, so a needed check is open and Open is refused.
    await manager.goto(`/${SLUG}/setup/done`);
    await vis(manager, "setup-to-open").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup/open`));
    await expect(vis(manager, "setup-open-check-calendar")).toHaveAttribute("data-state", "needs");
    await expect(vis(manager, "setup-open-button")).toBeDisabled();

    // Fix it where the check's link leads, and check again.
    await vis(manager, "setup-open-check-calendar").getByRole("link").click();
    await expect(manager).toHaveURL(/\/settings\/calendar/);
    await expect(vis(manager, "settings-setup-pill")).toBeVisible(); // the pill shows while closed
    await manager.getByTestId("settings-calendar-save").click();
    await expect(manager.getByTestId("settings-calendar-saved")).toBeVisible();
    await manager.goto(`/${SLUG}/setup/open`);
    await expect(vis(manager, "setup-open-check-calendar")).toHaveAttribute("data-state", "done");
    await expect(vis(manager, "setup-open-held")).toBeVisible();

    // The agreements are a needed check too (Q9.4): record the DPA and "no works council" on Go-live.
    await expect(vis(manager, "setup-open-check-agreements")).toHaveAttribute("data-state", "needs");
    await expect(vis(manager, "setup-open-button")).toBeDisabled();
    await manager.goto(`/${SLUG}/settings/go-live`);
    await vis(manager, "settings-agreement-edit-dpa").click();
    await vis(manager, "settings-agreement-date-dpa").fill("2026-11-02");
    await vis(manager, "settings-agreement-signer-dpa").fill("Managing director");
    await vis(manager, "settings-agreement-save-dpa").click();
    await expect(vis(manager, "settings-agreement-state-dpa")).toContainText("Managing director");
    await vis(manager, "settings-agreement-edit-works").click();
    await vis(manager, "settings-agreement-notneeded-works").check();
    await vis(manager, "settings-agreement-reason-works").fill("The plant has no works council");
    await vis(manager, "settings-agreement-save-works").click();
    await expect(vis(manager, "settings-agreement-state-works")).toContainText("No works council");
    await expect(vis(manager, "settings-golive-check-agreements")).toHaveAttribute("data-state", "done");
    await manager.goto(`/${SLUG}/setup/open`);
    await expect(vis(manager, "setup-open-check-agreements")).toHaveAttribute("data-state", "done");

    // Open asks once more, then opens. The held invitation goes out with a code that works.
    await vis(manager, "setup-open-button").click();
    await expect(manager.getByTestId("setup-open-dialog")).toContainText("Every needed check is done");
    await manager.getByRole("button", { name: "Yes, open NextUp" }).click();
    await expect(vis(manager, "setup-open-opened")).toBeVisible({ timeout: 30_000 });
    await expect(vis(manager, "setup-open-sent")).toContainText("1 invitation sent");
    const [mail] = await mailsTo(LEADER.email);
    const mailed = new RegExp(`${SLUG}-[a-z0-9-]+`, "i").exec(mail ?? "")?.[0];
    expect(mailed).toBeTruthy();
    codes.set(LEADER.name, mailed ?? "");
    await manager.goto(`/${SLUG}/settings/company`);
    await expect(manager.getByTestId("settings-setup-pill")).toHaveCount(0);
    // Open: the pill is gone, a plain link still leads to the setup overview.
    await expect(vis(manager, "settings-setup-link")).toHaveText("Setup overview");
    await vis(manager, "settings-setup-link").click();
    await expect(manager).toHaveURL(new RegExp(`/${SLUG}/setup$`));
    await manager.context().close();

    // The member raises a case about the rig; the leader sees it in the inbox.
    const member = await signIn(browser, MEMBER.name);
    await publishIdea(member, title, "Engineering lead"); // the route owner is offered by its seat name
    await member.context().close();

    const leader = await signIn(browser, LEADER.name);
    await leader.goto(`/${SLUG}/leader`);
    await expect(leader.getByRole("main").getByText(title).first()).toBeVisible();
    await leader.context().close();
  });
});
