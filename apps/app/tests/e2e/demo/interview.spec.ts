// The interview script: the exact path we click through when we show NextUp to someone. If this
// fails, the interview would have too.
//
//   Employee     chats with the coach in the raise window: one line, the coach's first read, two
//                more messages, then raises it and opens the case.
//   Team leader  (a second window) finds it in the inbox and opens it.
//   Manager      ends on the overview.
//
// It runs twice: here in the demo suite (`npm run e2e`, no database, the built-in acme), and as
// the live check against a stack that is already up (`npm run e2e:live`, playwright.live.config.ts),
// where the company has a database and the demo login. Everything else is the same clicks.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const TITLE = "A shared setup cart for line 3, so a changeover never waits for tools";
// The two answers to the coach. Together they lift the one-liner over the publish line (docs/IDEAS.md).
const MORE = [
  "It serves the changeover goal: every changeover on line 3 loses about 20 minutes looking for tools, on all three shifts.",
  "First step: a one-week pilot with one cart on line 3, built from what maintenance already has. No spend needed.",
];

const dev = (page: Page) => page.getByRole("button", { name: "Dev", exact: true });
const controls = (page: Page) => page.getByRole("dialog", { name: "Demo controls" });

/** Open a page of the company. A stack with a database asks who you are first: the demo button answers. */
async function open(page: Page, url: string) {
  await page.goto(url);
  const demoLogin = page.getByRole("button", { name: /^Open the demo as / });
  await expect(dev(page).or(demoLogin).first(), "needs a demo-stage company: the Dev panel, or the demo button on its login").toBeVisible();
  if (await demoLogin.isVisible()) await demoLogin.click();
  await expect(dev(page)).toBeVisible();
}

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Team leader" | "Manager") {
  await dev(page).click();
  await controls(page).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** How many cases the Dev panel counts on top of the seed ("Delete added cases · 2"). */
async function addedCases(page: Page): Promise<number> {
  await dev(page).click();
  const label = await controls(page).getByRole("button", { name: /^Delete added cases/ }).innerText();
  await page.keyboard.press("Escape");
  return Number(/· (\d+)/.exec(label)?.[1] ?? 0);
}

test("the interview script: employee raises, team leader finds it, manager sees the overview", async ({ page, context, baseURL }, info) => {
  // Live: the address given to the live config, which may be a host (single-company stack) or end in /acme.
  const home = info.config.metadata.live ? (baseURL ?? "").replace(/\/+$/, "") : "/acme";
  const chat = page.getByRole("region", { name: "Idea chat" });
  // One <li> per message: mine, then the coach's.
  const messages = chat.getByRole("list").first().locator(":scope > li");
  const score = page.getByRole("img", { name: /^Score \d+ of 100$/ });
  const box = page.getByRole("textbox", { name: "Your idea" });
  let addedBefore = 0;

  await test.step("employee: the raise window opens", async () => {
    await open(page, home + "/raise");
    await expect(page).toHaveURL(/\/raise$/);
    await expect(box).toBeVisible();
    addedBefore = await addedCases(page);
  });

  await test.step("employee: one line, and the coach answers with a first read and four benchmarks", async () => {
    await box.fill(TITLE);
    await box.press("Enter");
    await expect(messages).toHaveCount(2, { timeout: 30_000 });
    await expect(messages.nth(0)).toContainText(TITLE);
    await expect(messages.nth(1).getByRole("paragraph").first()).toHaveText(/\S.{40,}/);
    const bench = page.getByRole("region", { name: "Benchmarks" });
    for (const label of ["Strategic fit", "Impact & reach", "Feasibility", "Novelty & clarity"]) await expect(bench.getByText(label)).toBeVisible();
    await expect(score).toBeVisible();
    // A one-liner is not enough yet - that is the point of the coach.
    await expect(page.getByRole("button", { name: "Publish idea" })).toBeDisabled();
  });

  await test.step("employee: keeps writing, twice, and each time the coach answers", async () => {
    for (const [i, text] of MORE.entries()) {
      await box.fill(text);
      await box.press("Enter");
      await expect(messages).toHaveCount(4 + 2 * i, { timeout: 30_000 });
      await expect(messages.nth(3 + 2 * i).getByRole("paragraph").first()).toHaveText(/\S.{40,}/);
    }
    await expect(page.getByRole("button", { name: "Publish idea" })).toBeEnabled();
  });

  await test.step("employee: raises it, and it lands on T. Vogel's desk with an answer date", async () => {
    await page.getByRole("button", { name: "Publish idea" }).click();
    const done = page.getByRole("dialog", { name: "Publishing your idea" });
    await expect(done.getByText(/On T\. Vogel’s desk/)).toBeVisible({ timeout: 30_000 });
    await expect(done.getByText(/Answer owed in 5 d/)).toBeVisible();
    await done.getByRole("link", { name: "Open the case" }).click();
  });

  await test.step("employee: sees the details of the case", async () => {
    await expect(page).toHaveURL(/\/cases\/c_\w+$/);
    const main = page.getByRole("main");
    await expect(main).toContainText(TITLE);
    await expect(main).toContainText(MORE[0]);
    await expect(main).toContainText("5 d left on the promise");
    await expect(main).toContainText(/T\. Vogel\s*on whose desk it is/);
    // "What happened": the log so far is one line.
    await expect(main.getByRole("listitem").filter({ hasText: "raised this" })).toBeVisible();
  });

  // The second window. Same browser, so it is the same session (or, without a database, the same log).
  const leader = await context.newPage();

  await test.step("team leader: a second window, and the raise is in the inbox", async () => {
    await open(leader, home + "/raise");
    await viewAs(leader, "Team leader");
    await expect(leader).toHaveURL(/\/leader$/);
    await expect(leader.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
    const row = leader.getByRole("region", { name: "Fresh ideas" }).getByRole("button", { name: new RegExp("^" + TITLE) });
    await expect(row).toBeVisible();
    await row.click();
  });

  await test.step("team leader: sees the details of the case and what he can do with it", async () => {
    const detail = leader.getByRole("article");
    await expect(detail.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    await expect(detail).toContainText(MORE[0]);
    await expect(detail).toContainText("5 d left");
    await expect(leader.getByRole("region", { name: "What the AI found" })).toBeVisible();
    const decision = leader.getByRole("region", { name: "Your decision" });
    for (const name of [/^Yes, do it/, "No, and why", "Ask a question"]) await expect(decision.getByRole("button", { name })).toBeVisible();
  });

  await test.step("manager: the overview", async () => {
    await viewAs(leader, "Manager");
    await expect(leader).toHaveURL(/\/manager$/);
    const main = leader.getByRole("main");
    await expect(main.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    for (const part of ["Waiting on you", "What people say is broken", "Ideas people have", "Who is working with who"]) await expect(main.getByText(part, { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Team-level spend authority/ })).toBeVisible();
  });

  await test.step("leave the company as it was found", async () => {
    // "Delete added cases" drops every case on top of the seed, for everyone. Only safe when this
    // run's case is the only one - otherwise somebody prepared something here, and it stays.
    if (addedBefore > 0) {
      info.annotations.push({ type: "left behind", description: `"${TITLE}" - ${addedBefore} other added case(s) were already here, so nothing was deleted` });
      return;
    }
    await dev(leader).click();
    await controls(leader).getByRole("button", { name: "Delete added cases · 1" }).click();
    await expect(leader.getByText(/^Deleted 1 case you added/)).toBeVisible();
  });
});
