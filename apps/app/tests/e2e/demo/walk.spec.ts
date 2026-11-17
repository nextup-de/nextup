// The whole way in one go (DESIGN_RULES.md §8 and §9), in demo mode: an employee raises an idea, the desk says yes, the
// draft is set up and the project starts. At every step the screen shows at most one filled button, and it is the
// viewer's next move. One browser plays everyone through the dev panel.
import type { Page } from "@playwright/test";
import { expect, publishIdea, setupStep, showSidebar, test, yourMove } from "../helpers";

const TITLE = "A tool cart beside press 3 so changeovers stop waiting for tools";
// The coach gives the idea a short title; lists and the idea's page show that one.
const SHOWN = "A tool cart beside press 3";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "Inbox of" a desk: the leader persona acts as that seat's holder. */
async function actAs(page: Page, seat: string) {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: new RegExp("^" + seat.replace(".", "\\.")) }).click();
  await page.keyboard.press("Escape");
}

/** The filled blue buttons to press that are in view now: in the open dialog if there is one, else on the page. */
async function filled(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span"); probe.style.color = "var(--nh-brand)"; document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color; probe.remove();
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().width > 2 && !d.closest('[aria-label="Demo controls"]'));
    const root = dialogs.at(-1) ?? document.querySelector("main");
    if (!root) return [];
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert], [hidden]") && !el.closest("details:not([open]) > :not(summary)");
    };
    const on = (el: Element, a: string) => { const v = el.getAttribute(a); return v !== null && v !== "false"; };
    const chosen = (el: Element) => ["aria-pressed", "aria-current", "aria-selected", "aria-checked"].some((a) => on(el, a));
    return [...root.querySelectorAll("button, a, [role=button]")]
      .filter((el) => seen(el) && !chosen(el) && !(el as HTMLButtonElement).disabled && getComputedStyle(el).backgroundColor === brand)
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || el.getAttribute("aria-label") || "(no name)");
  });
}

/** The screen's one filled button is `name`. */
async function oneMove(page: Page, name: RegExp, where: string) {
  await expect.poll(() => filled(page), { message: `${where}: the one filled button`, timeout: 15_000 }).toEqual([expect.stringMatching(name)]);
}

test("an idea becomes a running project, and every screen on the way has one next move", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/acme");
  await expect(page).toHaveURL(/\/acme\/raise$/);

  await test.step("the employee raises it; the chat says where it went and links to Mine", async () => {
    await publishIdea(page, TITLE);
    // The Ideas area's pages sit in its side view (the raise page's own sidebar); a phone's strip is not drawn here.
    await showSidebar(page);
    await page.getByRole("link", { name: "Mine", exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/acme\/ideas$/);
    await expect(page.getByRole("main")).toContainText(SHOWN);
    expect(await filled(page), "Mine has nothing to press").toEqual([]);
  });

  await test.step("the desk finds it under Decide and opens it: one move is filled", async () => {
    await viewAs(page, "Team leader");
    await expect(page).toHaveURL(/\/acme\/inbox$/);
    expect(await filled(page), "the inbox list has nothing filled").toEqual([]);
    await page.getByTestId("inbox-row").filter({ hasText: SHOWN }).click();
    await expect(page.getByRole("heading", { name: new RegExp("^" + SHOWN), level: 1 })).toBeVisible();
    expect((await filled(page)).length, "the opened idea has one filled button").toBe(1);
  });

  await test.step("the desk says yes: the sheet asks one thing and has one filled button", async () => {
    await (await yourMove(page, /^Yes, do it/)).click();
    const sheet = page.getByRole("dialog", { name: "Yes, do it" });
    await expect(sheet).toBeVisible();
    await oneMove(page, /^Say yes/, "the yes sheet");
    await sheet.getByRole("button", { name: /^Say yes/ }).click();
    await oneMove(page, /^Open P-\d+/, "after the yes");
    await page.getByRole("link", { name: /^Open P-\d+$/ }).click();
    await expect(page).toHaveURL(/\/acme\/projects\/p_/);
  });

  await test.step("setup: every step has at most one filled button; the goal and the baseline are saved", async () => {
    await expect(page.getByTestId("draft-progress")).toBeVisible();
    for (const step of ["Template", "Team"] as const) {
      await setupStep(page, step);
      expect((await filled(page)).length, `the ${step} step`).toBeLessThanOrEqual(1);
    }
    await setupStep(page, "Goal");
    await page.getByLabel("Goal", { exact: true }).fill("Line 3 changes over without waiting for tools");
    await page.getByLabel("Done when").fill("Five changeovers in a row start with the cart in place");
    await oneMove(page, /^Save/, "the Goal step");
    await page.getByRole("button", { name: /^Save/ }).first().click();
    await setupStep(page, "Baseline");
    await page.getByLabel("What is measured").fill("Waiting for tools per changeover");
    await page.getByLabel(/Today.s number/).fill("20");
    await page.getByLabel("Unit").fill("minutes");
    await oneMove(page, /^Save the baseline/, "the Baseline step");
    await page.getByRole("button", { name: "Save the baseline" }).click();
  });

  await test.step("the lead reads who confirms the baseline; that person confirms it with one button", async () => {
    await setupStep(page, "Start");
    await expect(page.getByRole("main")).toContainText(/Waits for M\. Roth/);
    expect(await filled(page), "nothing to press while it waits for someone else").toEqual([]);
    const project = new URL(page.url()).pathname;
    await actAs(page, "M. Roth");
    await page.goto(project);
    await oneMove(page, /^Confirm/, "the confirmer's project page");
    await page.getByRole("button", { name: /^Confirm/ }).click();
    await actAs(page, "T. Vogel");
    await page.goto(project);
  });

  await test.step("the lead starts it, and the running project asks for its first step", async () => {
    await setupStep(page, "Start");
    await oneMove(page, /^Start the project/, "the Start step");
    await page.getByRole("button", { name: "Start the project" }).click();
    await expect(page.getByTestId("draft-progress")).toHaveCount(0);
    expect((await filled(page)).length, "the running project's page").toBeLessThanOrEqual(1);
  });
});
