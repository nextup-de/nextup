// Database suite: a real company, real login codes, real sessions - the part the demo suite cannot
// reach. Replaces tests/e2e/admin-flow.cjs, which still logged in with the shared company code
// that #47 removed.
//
// It makes its own company in /admin ("e2e-<time>", sandbox stage = real-people rules) and
// deletes it afterwards, so it leaves acme and everyone's codes alone on a shared dev database.
import type { Browser, Page } from "@playwright/test";
import { confirmSheet, expect, raiseProblem, test } from "../helpers";

const SLUG = `e2e-${Date.now().toString(36)}`;
// Names from the demo seed, so the router and the inboxes have someone to match.
const PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "T. Vogel", role: "leader", dept: "Production" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;
type Person = (typeof PEOPLE)[number]["name"];
const codes = new Map<string, string>();

const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE;
test.skip(!ADMIN_CODE || !process.env.DATABASE_URL, "needs DATABASE_URL and ADMIN_ACCESS_CODE (.env.local)");

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code").fill(ADMIN_CODE ?? "");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

/** A fresh browser (own cookies) signed in as one person with their personal code. */
async function signIn(browser: Browser, person: Person | string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code").fill(codes.get(person) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.describe.serial("a new company, from /admin to a decided case", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto("/admin/companies");
    await page.locator("#name").fill("E2E Maschinenbau");
    await page.locator("#slug").fill(SLUG);
    await page.locator("#stage").selectOption("sandbox");
    for (const [i, p] of PEOPLE.entries()) {
      await page.getByLabel(`Name ${i + 1}`).fill(p.name);
      await page.getByLabel(`Email ${i + 1}`).fill(`${p.name.replace(/\W+/g, ".").toLowerCase()}@${SLUG}.test`);
      await page.getByLabel(`Role ${i + 1}`).selectOption(p.role);
      await page.getByLabel(`Department ${i + 1}`).fill(p.dept);
    }
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByText(`${SLUG} is live.`)).toBeVisible({ timeout: 30_000 });
    for (const p of PEOPLE) {
      // .last(): the innermost <div> holding this name - the outer ones hold everybody's codes.
      const own = page.locator("div").filter({ has: page.locator(`strong:text-is("${p.name}")`) }).last();
      const code = await own.locator('[class*="code"]').innerText();
      codes.set(p.name, code.trim());
    }
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto("/admin/companies");
    // Delete asks you to type the slug into a prompt - that is the confirmation.
    page.on("dialog", (d) => d.accept(SLUG));
    const remove = page.locator(`form:has(input[name="slug"][value="${SLUG}"])`).filter({ has: page.getByRole("button", { name: "Delete" }) });
    await remove.getByRole("button", { name: "Delete" }).click();
    // The list does not refresh itself after a delete (deleteCompanyAction has no revalidate), so reload.
    await expect(async () => {
      await page.reload();
      await expect(remove).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.context().close();
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
    await raiseProblem(member, title);

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

    await member.reload();
    await expect(member.getByRole("article", { name: title })).toContainText("Answered: yes");
  });

  test("the manager adds a person in Settings, and their code works", async ({ browser }) => {
    const manager = await signIn(browser, "B. Hartmann");
    await manager.goto(`/${SLUG}/settings/members`);
    for (const p of PEOPLE) await expect(manager.getByText(p.name, { exact: false }).first()).toBeVisible();

    await manager.getByLabel("Name").fill("S. Dahl");
    await manager.getByLabel("Work email").fill(`s.dahl@${SLUG}.test`);
    await manager.getByRole("combobox", { name: "Role", exact: true }).selectOption("leader");
    await manager.getByRole("button", { name: "Add and issue a code" }).click();
    const box = manager.getByRole("status").filter({ hasText: "Login code for S. Dahl" });
    await expect(box).toBeVisible();
    codes.set("S. Dahl", (await box.locator("span").first().innerText()).trim());

    const added = await signIn(browser, "S. Dahl");
    await expect(added).toHaveURL(new RegExp(`/${SLUG}/leader$`));
  });
});
