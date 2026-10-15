// The discussion stage and the yes that opens a project (docs/plans/2026-10-15_idea-to-project.md
// sections 1-2), through the real UI: the employee raises an idea -> the leader says "Discuss first"
// and invites someone -> the employee posts v2 -> two check-ins, a day apart -> the leader says yes,
// which opens P-1 -> the idea leaves the open list and shows in the Archive. Demo mode: one browser
// plays every person via the dev panel; the flags are on for demo companies.
import type { Page } from "@playwright/test";
import { expect, publishIdea, test } from "../helpers";

const TITLE = "Setters walk to the tool crib before every changeover on line 3";
const V2 = "Every changeover on line 3 loses about 20 minutes because the setter walks to the tool crib. First step: a one-week pilot with one tool cart on line 3, about €800 for the cart. It serves the changeover goal on every shift.";

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Employee" | "Team leader") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "+1 day". */
async function nextDay(page: Page) {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: /\+1 day/ }).click();
  await page.keyboard.press("Escape");
}

/** The opened idea's decision card (the list beside it is tucked to avatars, its lines hidden). */
const decision = (page: Page) => page.getByRole("region", { name: "Your decision" });

/** The leader's inbox with the idea open. */
async function openInInbox(page: Page) {
  await page.goto("/acme/leader");
  await page.getByRole("main").getByText(TITLE).first().click();
}

/** "Check in" on the open idea: pick the outcome, keep the drafted note, send. */
async function checkIn(page: Page, outcome: "Another round" | "Ready to decide") {
  await page.getByRole("button", { name: /^Check in/ }).click();
  const sheet = page.getByRole("dialog", { name: "Check in" });
  await expect(sheet.getByRole("textbox", { name: "Note to everyone" })).not.toBeEmpty();
  await sheet.getByRole("button", { name: new RegExp("^" + outcome) }).click();
  await sheet.getByRole("button", { name: outcome === "Ready to decide" ? "Send: ready to decide" : "Send: another round" }).click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/acme");
});

test("an idea is discussed, revised, checked in twice, then becomes a project", async ({ page }) => {
  await test.step("the employee raises it; it lands on T. Vogel's desk", async () => {
    await expect(page).toHaveURL(/\/acme\/raise$/);
    await publishIdea(page, TITLE);
  });

  await test.step("the leader says 'Discuss first' and invites someone from the directory", async () => {
    await viewAs(page, "Team leader");
    await openInInbox(page);
    await page.getByRole("button", { name: /^Discuss first/ }).click();
    const sheet = page.getByRole("dialog", { name: "Discuss first" });
    await sheet.getByRole("textbox", { name: "What is still missing" }).fill("A rough cost for the cart");
    await sheet.getByRole("textbox", { name: "Search people" }).fill("Brandt");
    await sheet.getByRole("button", { name: /L\. Brandt/ }).click();
    await sheet.getByRole("button", { name: "Start with 1 person" }).click();
    await expect(sheet).toBeHidden();
    // The inbox now counts down to the check-in, and the decision card offers it.
    await expect(page.getByRole("main").getByText("check-in in 3 d").first()).toBeVisible();
    await expect(decision(page)).toContainText("In discussion · round 1 of 3");
    await expect(page.getByRole("button", { name: "Ask a question" })).toHaveCount(0);
  });

  await test.step("the employee sees the discussion and posts v2, scored again", async () => {
    await viewAs(page, "Employee");
    await page.goto("/acme/team");
    const card = page.getByRole("article", { name: TITLE });
    await expect(card).toContainText("In discussion");
    await expect(card).toContainText(/round 1 of 3/);
    await card.getByRole("link", { name: /Revise it/ }).click();
    await page.getByRole("button", { name: "Revise" }).click();
    await page.getByRole("textbox", { name: "The idea, v2" }).fill(V2);
    await page.getByRole("button", { name: "Post v2" }).click();
    const versions = page.getByRole("region", { name: "Versions" });
    await expect(versions.getByText("v2", { exact: true })).toBeVisible();
  });

  await test.step("two check-ins a day apart: another round, then ready to decide", async () => {
    await viewAs(page, "Team leader");
    await nextDay(page);
    await openInInbox(page);
    await checkIn(page, "Another round");
    await expect(decision(page)).toContainText("In discussion · round 2 of 3");
    await nextDay(page);
    await openInInbox(page);
    await checkIn(page, "Ready to decide");
    await expect(decision(page)).toContainText("Ready to decide");
  });

  await test.step("yes opens P-1 with a lead and a first step; the idea leaves the inbox", async () => {
    await page.getByRole("button", { name: /^Yes, do it/ }).click();
    const sheet = page.getByRole("dialog", { name: "Yes, do it" });
    await expect(sheet.getByRole("combobox", { name: "Who leads it" })).toHaveValue("T. Vogel");
    await sheet.getByRole("textbox", { name: "First step (optional)" }).fill("Build one cart for line 3");
    await sheet.getByRole("button", { name: "Say yes and open the project" }).click();
    await expect(sheet).toContainText("P-1 is open");
    await expect(sheet.getByRole("link", { name: "Open P-1" })).toHaveAttribute("href", /\/acme\/projects\/p_/);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("main").getByText(TITLE)).toHaveCount(0);
  });

  await test.step("the author's line says Planning, and the idea is in the Archive as a project", async () => {
    await viewAs(page, "Employee");
    await page.goto("/acme/team");
    const card = page.getByRole("article", { name: TITLE });
    await expect(card).toContainText("Planning");
    await expect(card.getByRole("link", { name: /P-1/ })).toBeVisible();
    await card.getByRole("link", { name: /Full history/ }).click();
    await expect(page.getByRole("note", { name: "Archived" })).toContainText(/Accepted today by T\. Vogel → P-1/);

    await page.goto("/acme/overview");
    await expect(page.getByRole("main").getByText(TITLE)).toHaveCount(0);
    await page.getByRole("tab", { name: /Archive/ }).click();
    await page.getByRole("button", { name: /Became a project/ }).click();
    await expect(page.getByRole("main").getByText(TITLE)).toBeVisible();
  });
});
