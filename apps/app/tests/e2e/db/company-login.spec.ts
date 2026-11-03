// Database suite: a real company, real login codes, real sessions - the part the demo suite cannot
// reach. Replaces tests/e2e/admin-flow.cjs, which still logged in with the shared company code
// that #47 removed.
//
// It makes its own company straight in the database ("e2e-<time>", sandbox stage = real-people rules) and
// deletes it afterwards, so it leaves acme and everyone's codes alone on a shared dev database.
import type { Browser, Page } from "@playwright/test";
import { confirmSheet, expect, passSecondFactor, publishIdea, test } from "../helpers";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const SLUG = `e2e-${Date.now().toString(36)}`;
// Names from the demo seed, so the router and the inboxes have someone to match.
const PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "T. Vogel", role: "leader", dept: "Production" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;
type Person = (typeof PEOPLE)[number]["name"];
const codes = new Map<string, string>();

test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

/** A fresh browser (own cookies) signed in as one person with their personal code. */
async function signIn(browser: Browser, person: Person | string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code").fill(codes.get(person) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${person}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.describe.serial("a new company, from its codes to a decided case", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: "E2E Maschinenbau", template: "demo", stage: "sandbox",
      people: PEOPLE.map((p) => ({ ...p, email: emailOf(p.name, SLUG) })),
    });
    for (const [name, code] of made) codes.set(name, code);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("every person got a code of the form slug-xxxx-xxxx-xxxx", () => {
    for (const p of PEOPLE) expect(codes.get(p.name)).toMatch(new RegExp(`^${SLUG}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$`));
  });

  test("a wrong code is refused; a right one lands on that person's home", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`/${SLUG}/login`);
    await page.locator("#code").fill(`${SLUG}-aaaa-bbbb-cccc`);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/login`));
    await expect(page.getByRole("alert").or(page.locator(".nh-error")).first()).toBeVisible();

    const member = await signIn(browser, "J. Schmidt");
    await expect(member).toHaveURL(new RegExp(`/${SLUG}/raise$`));
    const leader = await signIn(browser, "T. Vogel");
    await expect(leader).toHaveURL(new RegExp(`/${SLUG}/leader$`));
  });

  test("a real company shows no demo controls and keeps members out of settings", async ({ browser }) => {
    const member = await signIn(browser, "J. Schmidt");
    await expect(member.getByRole("button", { name: "Dev" })).toHaveCount(0);
    await member.goto(`/${SLUG}/settings/members`);
    await expect(member).not.toHaveURL(/settings/);
  });

  test("raised by one person, answered by another, seen by the first", async ({ browser }) => {
    const title = "Changeover on line 3 needs a second fitter on Fridays";
    const member = await signIn(browser, "J. Schmidt");
    await publishIdea(member, title);

    const leader = await signIn(browser, "T. Vogel");
    const row = leader.getByRole("main").getByText(title).first();
    await expect(row).toBeVisible();
    await row.click();
    await leader.getByRole("button", { name: "Ask a question" }).click();
    await confirmSheet(leader, "Which fitter - from line 2 or from maintenance?", "Send the question");

    await member.goto(`/${SLUG}/team`);
    await member.getByRole("button", { name: "Answer T. Vogel" }).click();
    await confirmSheet(member, "From maintenance.", "Send the answer");

    await leader.reload();
    await leader.getByRole("main").getByText(title).first().click();
    await leader.getByRole("button", { name: "Yes, do it" }).click();
    // Projects are on by default, so the yes opens a sheet that names the project's lead.
    await leader.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: "Say yes and open the project" }).click();

    await member.reload();
    await expect(member.getByRole("article", { name: title })).toContainText("Approved");
  });

  test("the manager adds a person in Settings, and their code works", async ({ browser }) => {
    const manager = await signIn(browser, "B. Hartmann");
    await manager.goto(`/${SLUG}/settings/members`);
    for (const p of PEOPLE) await expect(manager.getByText(p.name, { exact: false }).first()).toBeVisible();

    // Adding a person happens in a drawer.
    await manager.getByTestId("settings-members-open-add").click();
    const drawer = manager.getByTestId("settings-members-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByLabel("Name").fill("S. Dahl");
    await drawer.getByLabel("Work email").fill(`s.dahl@${SLUG}.test`);
    await drawer.getByRole("combobox", { name: "Role", exact: true }).selectOption("leader");
    await drawer.getByRole("button", { name: "Add and issue a code" }).click();
    const box = manager.getByRole("status").filter({ hasText: "Login code for S. Dahl" });
    await expect(box).toBeVisible();
    codes.set("S. Dahl", (await box.locator("span").first().innerText()).trim());

    const added = await signIn(browser, "S. Dahl");
    await expect(added).toHaveURL(new RegExp(`/${SLUG}/leader$`));
  });
});
