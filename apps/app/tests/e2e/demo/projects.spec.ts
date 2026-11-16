// The second half of the loop through the real UI (docs/plans/2026-10-15_idea-to-project.md §3-5): the
// lead of a planned project adds steps (one suggested by the idea's brief), takes the baseline and
// starts it; the board is worked and the project done; the clock moves 30 days at a time to each
// measure check; then the manager finds no reward due on the unconfirmed typed measures. Demo mode: one browser
// plays every person via the dev panel, on acme's seeded P-4 (T. Vogel's, from c9's yes).
import type { Locator, Page } from "@playwright/test";
import { addPages, expect, filesSheet, test } from "../helpers";

const FIRST = "Move the spare bench from line 1 next to the press for two weeks";
const TYPED = "Time the queue at five shift starts";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "+30 days", `times` times. */
async function plus30(page: Page, times = 1) {
  await page.getByRole("button", { name: "Dev" }).click();
  const panel = page.getByRole("dialog", { name: "Demo controls" });
  for (let k = 0; k < times; k++) await panel.getByRole("button", { name: /\+30 days/i }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "Inbox of" a desk: the leader persona acts as that seat's holder. */
async function actAs(page: Page, seat: string) {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: new RegExp("^" + seat.replace(".", "\\.")) }).click();
  await page.keyboard.press("Escape");
}

/**
 * Where a reward is possible the baseline waits for a second person before the start (RES D16, D29). On P-4 the route's deputy is M. Roth: the
 * demo plays him through the dev panel, confirms the number and hands back to the lead, who starts the project.
 */
async function deputyConfirmsBaseline(page: Page) {
  // Switching the desk sends the leader to their inbox: come back to the project page (the demo's log stays in this browser).
  // The baseline sits in the Overview tool; the project's head, with Start, shows on that page too.
  await actAs(page, "M. Roth");
  await page.goto("/acme/projects/pj4?page=project-overview");
  await page.getByRole("button", { name: "Confirm the baseline" }).click();
  await expect(page.getByTestId("baseline-confirmed")).toContainText("Confirmed by M. Roth");
  await actAs(page, "T. Vogel");
  await page.goto("/acme/projects/pj4?page=project-overview");
}

// The project page; its state ("P-4 · Running") is in the header, the baseline in its section and the summary.
const head = (page: Page) => page.getByRole("main");

/** Open the page by its stable id; navigation is covered separately by the sidebar task. */
/** The Results tool keeps its measure checks in the drawer behind the result card (HUB, #888). */
async function openResult(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Results", exact: true });
  if (!(await drawer.isVisible())) await page.getByRole("button", { name: "Open result", exact: true }).click();
  await expect(drawer).toBeVisible();
}

/** The open drawer makes the rest of the page inert, so the Dev panel is used with it closed. */
async function plus30WithResult(page: Page, times = 1) {
  await page.getByRole("button", { name: "Close result", exact: true }).click();
  await plus30(page, times);
  await openResult(page);
}

const TITLES = { overview: "Overview", steps: "Steps", team: "Team", results: "Results", activity: "Activity" } as const;

/** A project starts with its Idea and Files: a page the story needs is added first (the project Overview's id is its own). */
async function projectPage(page: Page, id: keyof typeof TITLES | "files") {
  const url = new URL(page.url());
  url.search = "";
  if (id !== "files") await addPages(page, url.pathname, [TITLES[id]]);
  url.searchParams.set("page", id === "overview" ? "project-overview" : id);
  await page.goto(url.pathname + url.search);
  await expect(page.getByRole("navigation", { name: "Project sections" })).toHaveCount(0);
}

/** The details behind the (i) next to the title: status, origin, team and the tools in use. */
async function about(page: Page) {
  const info = page.locator('summary[aria-label="About this project"]');
  if (!(await page.getByRole("dialog", { name: "About this project" }).isVisible())) await info.click();
  return page.getByRole("dialog", { name: "About this project" });
}

/** Find a board card by its title; the List tool shows the same steps. */
function stepCard(scope: Page | Locator, text: string) {
  return scope.getByRole("article").filter({ hasText: text });
}

/** Open a card's sheet - where its moves, owner, due day and details are. */
async function openStep(page: Page, text: string) {
  await page.getByRole("region", { name: "Board", exact: true }).getByRole("button", { name: "Open step: " + text, exact: true }).click();
  // Stacked tools share ?step=; act on the sheet rendered above the others.
  return page.getByRole("dialog", { name: text, exact: true }).last();
}

test("a lead plans, runs and measures a project; no reward is due on unconfirmed measures", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox$/);

  await test.step("the lead finds P-4 under Planning", async () => {
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    const planning = page.getByRole("region", { name: "Planning" });
    await expect(planning).toContainText("Take the baseline");
    await planning.getByRole("link", { name: /P-4 Second deburring bench/ }).click();
    await expect(page).toHaveURL(/\/acme\/projects\/pj4$/);
    await expect(page.getByRole("status").filter({ hasText: "Your move" })).toContainText("Take the baseline");
  });

  await test.step("adds a step the brief suggests and one of their own", async () => {
    await projectPage(page, "steps");
    await page.getByRole("button", { name: "Add step: " + FIRST }).click();
    await page.getByRole("button", { name: "Add a step to To do" }).click();
    await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
    await page.getByRole("group", { name: "To do" }).getByRole("button", { name: "Add", exact: true }).click();
    const todo = page.getByRole("group", { name: "To do" });
    await expect(todo.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Add step: " + FIRST })).toHaveCount(0);
  });

  await test.step("Start stays locked until the baseline is taken", async () => {
    await projectPage(page, "overview");
    await expect(page.getByRole("button", { name: "Start the project" })).toBeDisabled();
    await page.getByLabel("What is measured").fill("Deburring queue");
    await page.getByLabel(/Today.s number/).fill("25");
    await page.getByLabel("Unit").fill("minutes");
    await page.getByLabel("Lower is better").check();
    await page.getByLabel("Where the number comes from").fill("Stopwatch, five shift starts");
    await page.getByRole("button", { name: "Save the baseline" }).click();
    await deputyConfirmsBaseline(page);
    await expect(head(page)).toContainText("25 minutes");
    await expect(head(page)).toContainText("Deburring queue · lower is better");
    await page.getByRole("button", { name: "Start the project" }).click();
    // A running project's head sits on its Idea page; its Overview is a page like the Jira ones (Paper "Jira pages · new header").
    await page.goto(new URL(page.url()).pathname + "?page=overview");
    await expect(head(page)).toContainText("P-4 · Running");
  });

  await test.step("works the board from the card sheets: blocked asks why, then both steps are done", async () => {
    await projectPage(page, "steps");
    let sheet = await openStep(page, TYPED);
    await sheet.getByRole("button", { name: "Mark blocked", exact: true }).click();
    await sheet.getByRole("textbox", { name: "Question or reason" }).fill("Stopwatch is at the other site");
    await sheet.getByRole("form", { name: "What is it waiting for?" }).getByRole("button", { name: "Mark blocked" }).click();
    await expect(page.getByRole("group", { name: "Blocked" })).toContainText(TYPED);
    await expect(sheet).toContainText("Stopwatch is at the other site");
    await sheet.getByRole("button", { name: "Mark done", exact: true }).click();
    await page.keyboard.press("Escape");
    sheet = await openStep(page, FIRST);
    await sheet.getByRole("button", { name: "Mark done", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("group", { name: "Done" }).getByRole("article")).toHaveCount(2);
  });

  await test.step("marks it done; the 30-day check opens 30 days later", async () => {
    // Every step is done, so the Overview's done card offers the same sheet as Manage › Mark it done (Kevin, 16 Nov 2026).
    // The Overview is "project-overview"; "overview" is the project's Idea page since #958.
    await page.goto("/acme/projects/pj4?page=project-overview");
    const doneCard = page.getByRole("region", { name: "All 2 steps done" });
    await doneCard.getByRole("button", { name: "Mark it done…" }).click();
    await page.getByRole("textbox", { name: "What is done" }).fill("Second bench in use on every shift");
    await page.getByRole("form", { name: "Mark the project done" }).getByRole("button", { name: "Mark it done", exact: true }).click();
    await expect(head(page)).toContainText("P-4 · Measuring");
    await projectPage(page, "results");
    await openResult(page);
    const check30 = page.getByRole("group", { name: "30-day check" });
    await expect(check30).toContainText("Opens");
    await plus30WithResult(page);
    await check30.getByLabel(/The number now/).fill("12");
    await expect(check30.getByRole("status")).toContainText("better");
    await check30.getByRole("button", { name: "Record the measure" }).click();
    await expect(check30).toContainText("25 → 12 minutes");
    await expect(check30).toContainText("−52 %");
  });

  await test.step("records the 90-day check, worse than the 30-day one but still better than before", async () => {
    await plus30WithResult(page, 2);
    const check90 = page.getByRole("group", { name: "90-day check" });
    await check90.getByLabel(/The number now/).fill("14");
    await check90.getByRole("button", { name: "Record the measure" }).click();
    await expect(check90).toContainText("25 → 14 minutes");
    await expect(head(page)).toContainText(/4-series\s*Measured/); // the sidebar's status under the title; the head is on the Idea page
    // The lead does not record a reward: that is the manager's.
    await expect(page.getByRole("button", { name: "Record the reward" })).toHaveCount(0);
    // The drawer makes the page inert; the next step switches the person from the Dev panel.
    await page.getByRole("button", { name: "Close result", exact: true }).click();
  });

  await test.step("a typed measure does not make the reward due until a second person confirms it (LOOP/D18)", async () => {
    // The manager sees no reward offered on an unconfirmed measure; the panel says when one will be due (LOOP-U1).
    await viewAs(page, "Manager");
    await page.goto("/acme/projects/pj4?page=results");
    await expect(head(page)).toContainText(/4-series\s*Measured/);
    await openResult(page);
    await expect(page.getByRole("region", { name: "Reward" })).toContainText("A reward is due after a confirmed better result.");
    await expect(page.getByRole("button", { name: "Record the reward" })).toHaveCount(0);
  });
});

test("RES demo: the lead finishes and drops open steps at done, and a stop returns the idea to its desk", async ({ page }) => {
  const DROP_WHY = "Not needed after the trial";
  const IDEA = "A second deburring bench next to the 4-series press";
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects/pj4");

  await test.step("the lead starts P-4 with two steps still open", async () => {
    await projectPage(page, "steps");
    await page.getByRole("button", { name: "Add step: " + FIRST }).click();
    await page.getByRole("button", { name: "Add a step to To do" }).click();
    await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
    await page.getByRole("group", { name: "To do" }).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("group", { name: "To do" }).getByRole("article")).toHaveCount(2);
    await projectPage(page, "overview");
    await page.getByLabel("What is measured").fill("Deburring queue");
    await page.getByLabel(/Today.s number/).fill("25");
    await page.getByLabel("Unit").fill("minutes");
    await page.getByLabel("Lower is better").check();
    await page.getByLabel("Where the number comes from").fill("Stopwatch, five shift starts");
    await page.getByRole("button", { name: "Save the baseline" }).click();
    await deputyConfirmsBaseline(page);
    await page.getByRole("button", { name: "Start the project" }).click();
    // A running project's head sits on its Idea page; its Overview is a page like the Jira ones (Paper "Jira pages · new header").
    await page.goto(new URL(page.url()).pathname + "?page=overview");
    await expect(head(page)).toContainText("P-4 · Running");
  });

  await test.step("done waits until every open step is finished or dropped with a reason", async () => {
    await page.locator('summary[aria-label="Manage the project"]').click(); // the moves are behind Manage, right of the title
    await page.getByRole("button", { name: "Mark it done…" }).click();
    const sheet = page.getByRole("form", { name: "Mark the project done" });
    await expect(sheet).toContainText("No done-when was set");
    const submit = sheet.getByRole("button", { name: "Mark it done", exact: true });
    await expect(submit).toBeDisabled();
    await sheet.getByRole("group", { name: FIRST }).getByLabel("Done", { exact: true }).check();
    await expect(submit).toBeDisabled(); // the other step has no end yet
    await sheet.getByRole("group", { name: TYPED }).getByLabel("Drop", { exact: true }).check();
    await expect(submit).toBeDisabled(); // a drop needs its reason
    await sheet.getByLabel("Why is “" + TYPED + "” dropped?").fill(DROP_WHY);
    await expect(submit).toBeEnabled();
    await sheet.getByRole("textbox", { name: "What is done" }).fill("The bench is in use");
    await submit.click();
    await expect(head(page)).toContainText("P-4 · Measuring");
    await projectPage(page, "steps");
    await expect(page.getByRole("group", { name: "Done" })).toContainText(FIRST);
  });

  await test.step("a stop with 'Return the idea to its desk' puts the idea back in the inbox", async () => {
    await page.goto("/acme/projects/pj4?page=overview"); // the project's head and its actions are on the Idea page
    await page.locator('summary[aria-label="Manage the project"]').click(); // the moves are behind Manage, right of the title
    await page.getByRole("button", { name: "Stop the project" }).click();
    const form = page.getByRole("form", { name: "Stop the project" });
    await form.getByRole("textbox", { name: "Why does it stop?" }).fill("The queue went away by itself");
    await expect(form.getByLabel("Keep the idea archived")).toBeChecked(); // the default
    await form.getByLabel("Return the idea to its desk").check();
    await form.getByRole("button", { name: "Stop it" }).click();
    await expect(head(page)).toContainText("P-4 · Stopped");
    await page.goto("/acme/inbox");
    await expect(page.getByTestId("inbox-row").filter({ hasText: IDEA })).toHaveCount(1);
  });
});

test("projects and ideas sit side by side on one page", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Overview" })).toHaveCount(0);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Projects\s*\d+$/, level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ideas", level: 2 })).toBeVisible();
  await expect(page.getByRole("table", { name: "Problems and ideas" })).toBeVisible();
  await page.goto("/acme/overview");
  await expect(page.getByRole("heading", { name: "Ideas", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Projects\s*\d+$/, level: 2 })).toBeVisible();
});

test("an idea opened on the Projects page has its own address, /idea?id=", async ({ page }) => {
  const idea = /\/acme\/idea\?id=[^&]+$/;
  const projects = /\/acme\/projects$/;
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects");
  const table = page.getByRole("table", { name: "Problems and ideas" });
  const row = table.getByRole("row").nth(1);
  const title = (await row.getByRole("cell").first().locator("span").first().innerText()).trim();
  await row.click();
  await expect(page).toHaveURL(idea);
  const heading = page.getByRole("heading", { name: title, level: 1 });
  await expect(heading).toBeVisible();
  const at = page.url();

  // A reload and a link land on the same idea; the nav still shows where it opened from.
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(at);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects", exact: true })).toHaveAttribute("aria-current", "page");

  // Closing goes to the table; Back reopens the idea and Forward closes it again.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(projects);
  await expect(table).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(at);
  await expect(heading).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(projects);
  await expect(table).toBeVisible();

  // The nav link leaves an idea opened in place, and the old addresses still land on the idea.
  await table.getByRole("row").nth(1).click();
  await expect(page).toHaveURL(idea);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(projects);
  await expect(table).toBeVisible();
  const id = new URL(at).searchParams.get("id") ?? "";
  for (const old of ["/acme/projects", "/acme/overview"]) {
    await page.goto(old + "?id=" + encodeURIComponent(id));
    await expect(page).toHaveURL(at);
    await expect(heading).toBeVisible();
  }
});

test("Back right after closing an idea reopens it, on a slow machine too", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects");
  const table = page.getByRole("table", { name: "Problems and ideas" });
  const row = table.getByRole("row").nth(1);
  const title = (await row.getByRole("cell").first().locator("span").first().innerText()).trim();
  await row.click();
  const heading = page.getByRole("heading", { name: title, level: 1 });
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  // The address follows at once, the router's copy of it later: this is the gap that lost the Back.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/acme\/projects$/);
  await expect(table).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/acme\/idea\?id=/);
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("Back out of the Projects page goes to the page before it", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/feed");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/acme\/projects$/);
  const row = page.getByRole("table", { name: "Problems and ideas" }).getByRole("row").nth(1);
  await row.click();
  await expect(page).toHaveURL(/\/acme\/idea\?id=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/acme\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/acme\/feed$/);
});

test("a step is dragged to another column; a drop on Blocked asks why", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await addPages(page, "/acme/projects/pj4", ["Steps"]);
  await page.goto("/acme/projects/pj4?page=steps");
  await page.getByRole("button", { name: "Add a step to To do" }).click();
  await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
  await page.getByRole("group", { name: "To do" }).getByRole("button", { name: "Add", exact: true }).click();
  const todo = page.getByRole("group", { name: "To do" });
  const card = stepCard(todo, TYPED);
  await card.dragTo(page.getByRole("group", { name: "Doing" }));
  await expect(stepCard(page.getByRole("group", { name: "Doing" }), TYPED)).toBeVisible();
  await stepCard(page.getByRole("group", { name: "Doing" }), TYPED).dragTo(page.getByRole("group", { name: "Blocked" }));
  const why = page.getByRole("textbox", { name: "Question or reason" });
  await expect(why).toBeVisible();
  await expect(stepCard(page.getByRole("group", { name: "Doing" }), TYPED)).toBeVisible(); // not moved until the reason is given
  await why.fill("Waiting for the stopwatch");
  await page.getByRole("button", { name: "Mark blocked" }).click();
  await expect(page.getByRole("group", { name: "Blocked" }).getByRole("article").filter({ hasText: TYPED })).toBeVisible();
  await expect(await openStep(page, TYPED)).toContainText("Waiting for the stopwatch");
});

test("a step goes straight into Doing, gets an owner and details in its sheet, and is dragged to the top", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await addPages(page, "/acme/projects/pj2", ["Steps"]);
  await page.goto("/acme/projects/pj2?page=steps");
  const doing = page.getByRole("group", { name: "Doing" });
  await page.getByRole("button", { name: "Add a step to Doing" }).click();
  await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
  await page.getByRole("textbox", { name: "New step" }).press("Enter");
  await expect(doing.getByRole("article")).toHaveCount(3);
  await expect(doing.getByRole("article").last()).toContainText(TYPED);

  const sheet = await openStep(page, TYPED);
  await sheet.getByRole("combobox", { name: "Owner" }).selectOption({ label: "L. Brandt" });
  await sheet.getByRole("button", { name: "+1 week" }).click();
  await sheet.getByLabel("Details").fill("Five shift starts, stopwatch from the Ulm depot");
  await sheet.getByLabel("Details").blur();
  await expect(sheet).toContainText("changed “" + TYPED + "”: updated the details");
  await page.keyboard.press("Escape");
  const card = stepCard(doing, TYPED);
  await expect(card).toContainText("L. Brandt");

  await card.dragTo(doing.getByRole("article").first(), { targetPosition: { x: 20, y: 4 } });
  await expect(doing.getByRole("article").first()).toContainText(TYPED);
  await projectPage(page, "overview");
  // The Overview tool (HUB-A1) shows the new owner in its activity and in what happens next.
  // "Latest from Jira" while the project syncs with Jira, "Latest activity" otherwise.
  await expect(page.getByRole("region", { name: /^Latest (activity|from Jira)$/ })).toContainText("changed “" + TYPED + "”: gave it to L. Brandt");
  await expect(page.getByRole("region", { name: "What happens next" }).getByRole("listitem").filter({ hasText: TYPED })).toContainText("L. Brandt");
});

test("the project page shows the idea it came from and its connected tools", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects/pj4?page=files");
  // The Files page shows files only; the idea, its sources and the connected tools sit behind the gear (Paper 7.1-7.3).
  await page.getByRole("button", { name: "Page settings", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^The idea/ })).toHaveAttribute("href", /\/projects\/pj4\?page=overview$/);
  await page.keyboard.press("Escape");
  await expect((await filesSheet(page, /^Sources/)).getByRole("heading", { name: "Files and sources" })).toBeVisible();
  await page.goto("/acme/projects/pj2?page=files");
  await filesSheet(page, /^Connected tools/);
  const tools = page.getByRole("region", { name: "Connected tools" });
  await expect(tools).toContainText("Two-way sync");
  await expect(tools.getByRole("link", { name: "FS-9" })).toBeVisible();
  await expect(tools).toContainText("Microsoft Teams");
  await expect(tools).toContainText("SharePoint");
  // The tools in use also sit behind the (i) next to the title, in the header on the project's Idea page.
  await page.goto("/acme/projects/pj2?page=overview");
  await expect((await about(page)).getByLabel("Tools in use").getByRole("link", { name: /Jira FS-9/ })).toBeVisible();
});

test("the lead sends a project to Jira, links an issue and stops the sync - all simulated, no network", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await addPages(page, "/acme/projects/pj4", ["Steps"]);
  await page.goto("/acme/projects/pj4?page=steps");
  await page.getByRole("button", { name: "Add step: " + FIRST }).click();
  const tools = page.getByRole("region", { name: "Connected tools" });

  await test.step("a project that is not sent offers Send to Jira, and says what it will create", async () => {
    await expect(stepCard(page, FIRST)).not.toContainText("waiting for Jira");
    await projectPage(page, "files");
    await filesSheet(page, /^Connected tools/);
    await expect(tools).toContainText("Two-way sync");
    await expect(tools).toContainText("Creates an epic in NUP and 1 issue");
  });

  await test.step("Send to Jira shows the epic and the issue keys, with the sync chip", async () => {
    await tools.getByRole("button", { name: "Send to Jira" }).click();
    await expect(tools.getByRole("status")).toContainText(/Synced · NUP-1 · checked (just now|1 min ago)/);
    await expect(tools.getByRole("button", { name: "Send to Jira" })).toHaveCount(0);
    await page.goto("/acme/projects/pj4?page=overview"); // the (i) is in the head, on the Idea page
    await expect((await about(page)).getByLabel("Tools in use")).toContainText("Sync");
    await page.keyboard.press("Escape");
    await projectPage(page, "steps");
    await expect(stepCard(page, FIRST)).toContainText("NUP-2");
  });

  await test.step("a step added after the send waits for Jira", async () => {
    // Back on the board after the page change, the To do composer is closed again.
    await page.getByRole("button", { name: "Add a step to To do" }).click();
    await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(stepCard(page, TYPED)).toContainText("waiting for Jira");
  });

  await test.step("an existing issue is linked to a step by its key", async () => {
    await projectPage(page, "files");
    await filesSheet(page, /^Connected tools/);
    await tools.getByRole("button", { name: "Add another link to Jira" }).click();
    const form = page.getByRole("form", { name: "Link a Jira issue" });
    await form.getByLabel("Jira issue key").fill("nup");
    await expect(form.getByRole("button", { name: "Link the issue" })).toBeDisabled();
    await form.getByLabel("Jira issue key").fill("NUP-77");
    await form.getByLabel("For which step").selectOption({ label: TYPED });
    await form.getByRole("button", { name: "Link the issue" }).click();
    await projectPage(page, "steps");
    await expect(stepCard(page, TYPED)).toContainText("NUP-77");
    await expect(stepCard(page, TYPED)).not.toContainText("waiting for Jira");
  });

  await test.step("Stop syncing takes the project off Jira and offers Send again", async () => {
    await projectPage(page, "files");
    await filesSheet(page, /^Connected tools/);
    await tools.getByRole("button", { name: "Stop syncing" }).click();
    await expect(tools.getByRole("button", { name: "Send to Jira" })).toBeVisible();
    await projectPage(page, "steps");
    await expect(stepCard(page, TYPED)).not.toContainText("waiting for Jira");
  });
});

test("only the lead (or a manager) gets the Jira buttons", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Employee");
  await page.goto("/acme/projects/pj2?page=files");
  // The Employee raised the idea behind P-2 and is not on its team: they work on its pages like the team, but the Jira link stays the lead's.
  await filesSheet(page, /^Connected tools/);
  await expect(page.getByRole("region", { name: "Connected tools" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send to Jira|Stop syncing/ })).toHaveCount(0);
});
