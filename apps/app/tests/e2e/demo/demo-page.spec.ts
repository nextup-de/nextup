// The static demo (/demo, docs/IDEAS.md "The demo page"): no company, no login, driven from the demo
// controls under the Dev button (components/shell/DemoControls.tsx). Start demo starts it over as Jonas, in
// the same tab; the sample idea and two answers are filled one by one and
// sent by the presenter, the coach's prepared replies come after a short pause and the rail of eight
// topics fills; the rest of the conversation comes in one go, then publish it - the Overview and the
// Feed show it, the receiver has it in their inbox, the manager has the Dashboard. A company's /raise
// offers none of it.
import { aiMessages, ANSWER, expect, publishTo, START, test } from "../helpers";

const TITLE = "A reporting screen at each assembly station";

test("the demo controls walk the story: idea, answers, published, inbox, dashboard", async ({ page, context }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/demo\/raise$/);
  await expect(page.getByRole("button", { name: /Insert the / })).toHaveCount(0); // no fill chips in the composer any more

  // Start demo: the demo starts over in this tab - no second tab.
  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page).toHaveURL(/\/demo\/raise$/);
  expect(context.pages()).toHaveLength(1);

  const start = page.getByRole("textbox", { name: START });
  // The controls: the next step's title over the arrow that takes it (the arrow is named after its step).
  const controls = page.getByRole("group", { name: "Demo controls" });
  const step = async (name: string) => controls.getByRole("button", { name, exact: true });

  await test.step("the controls are always there, the sample idea the step to take", async () => {
    await expect(controls).toContainText("Fill sample idea");
    await expect(await step("Fill sample idea")).toBeEnabled();
  });

  await test.step("the sample idea fills the start view, its analysis opens first, then the coach's answer", async () => {
    await (await step("Fill sample idea")).click();
    await expect(start).toHaveValue(TITLE); // the title field; the description under it holds what more there is to say
    await expect(page.getByText("We should put a simple reporting screen")).toBeVisible();
    await expect(page.getByRole("group", { name: /^Prompts/ }).getByRole("button")).toHaveCount(5); // the prompts under the box
    await page.getByRole("button", { name: "Ask NextUp" }).click();
    await page.getByRole("button", { name: "Close analysis" }).click({ timeout: 30_000 });
    await expect(aiMessages(page).first()).toContainText("I can see the value here.", { timeout: 30_000 });
    await expect(page.getByRole("group", { name: "AI analysis" })).toHaveCount(0);
    await expect(page.locator("[data-rail-seg]")).toHaveCount(8);
  });

  await test.step("two answers, each filled by the controls and sent by the presenter", async () => {
    const box = page.getByRole("textbox", { name: ANSWER });
    for (const [label, reply] of [["First answer", "loses its owner"], ["Second answer", "clear baseline"]]) {
      await expect(await step(label)).toBeEnabled({ timeout: 15_000 });
      await (await step(label)).click();
      await expect(box).not.toHaveValue("");
      await box.press("Enter");
      await expect(aiMessages(page).last()).toContainText(reply, { timeout: 30_000 });
    }
    await expect(page.locator('[data-rail-seg][aria-label$="clear"]')).toHaveCount(2);
  });

  await test.step("three texts are enough: Finalize is there before the rest of the conversation", async () => {
    await expect(page.getByRole("button", { name: "Finalize", exact: true }).first()).toBeVisible();
  });

  await test.step("the full conversation answers the rest of the rail, and it is ready to publish", async () => {
    await (await step("Full conversation")).click();
    await expect(aiMessages(page).last()).toContainText("Everything on the right is answered");
    await expect(page.locator('[data-rail-seg][aria-label$="clear"]')).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Publish now" })).toBeVisible();
  });

  await test.step("publishing opens the last look: the idea as the inbox shows it, the author's part editable", async () => {
    await page.getByRole("button", { name: "Publish now" }).click();
    const look = page.getByRole("dialog", { name: "Last look before it goes out" });
    await expect(look).toContainText("NextUp analysis is attached below this");
    await expect(look.getByRole("textbox", { name: "Title" })).toHaveValue(TITLE);
    await look.getByRole("textbox", { name: "Description" }).fill("A tablet at station 4: operators report a problem in three taps.");
    await look.getByRole("button", { name: "Back" }).click(); // closing keeps the edit
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(look.getByRole("textbox", { name: "Description" })).toHaveValue(/three taps/);
    await expect(page.getByRole("dialog", { name: "Who should get this?" })).toHaveCount(0); // no receiver search yet
    await look.getByRole("button", { name: /Looks good/ }).click();
    // ...then the final document, with the last look's words, not yet the receiver search.
    await expect(page.getByRole("article", { name: "Idea document" })).toContainText("three taps");
    await expect(page.getByRole("dialog", { name: "Who should get this?" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit details" }).click(); // back to the last look, so publishTo below goes the same way
    await expect(look).toBeVisible();
  });

  await test.step("published: the Overview and the Feed show it, with the edited description", async () => {
    await publishTo(page, "Thomas Vogel");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("main")).toContainText(TITLE);
    await page.getByRole("link", { name: "Feed", exact: true }).click();
    await expect(page.getByRole("main")).toContainText(TITLE);
  });

  await test.step("the receiver view is the inbox of whoever got it, the manager view the Dashboard, and a step back the inbox again", async () => {
    await (await step("Receiver view")).click();
    await expect(page).toHaveURL(/\/demo\/leader$/);
    await expect(page.getByRole("main")).toContainText(TITLE);
    await expect(page.getByRole("main")).toContainText("operators report a problem in three taps"); // the last look's edit reached the inbox
    await (await step("Manager view")).click();
    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    await expect(controls).toContainText("Demo done");
    await controls.getByRole("button", { name: "Demo menu" }).click();
    await controls.getByRole("menuitem", { name: "Back a step" }).click();
    await expect(page).toHaveURL(/\/demo\/leader$/);
    await expect(await step("Manager view")).toBeEnabled();
  });
});

test("a company's raise page has no demo script", async ({ page }) => {
  await page.goto("/acme/raise");
  await expect(page.getByRole("textbox", { name: START })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start demo" })).toHaveCount(0);
});

test("three texts, then Finalize skips the rest of the conversation: document, send, the controls go on to the receiver view", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Start demo" }).click();
  const controls = page.getByRole("group", { name: "Demo controls" });
  const step = (name: string) => controls.getByRole("button", { name, exact: true });
  await step("Fill sample idea").click();
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  await page.getByRole("button", { name: "Close analysis" }).click({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Finalize", exact: true })).toHaveCount(0); // not before the third text
  const box = page.getByRole("textbox", { name: ANSWER });
  for (const label of ["First answer", "Second answer"]) {
    await expect(step(label)).toBeEnabled({ timeout: 15_000 });
    await step(label).click();
    await box.press("Enter");
    await expect(aiMessages(page).last()).toBeVisible({ timeout: 30_000 });
  }

  await page.getByRole("button", { name: "Finalize", exact: true }).first().click();
  const doc = page.getByRole("article", { name: "Idea document" });
  await expect(doc).toContainText(TITLE);
  for (const heading of ["Summary", "The idea", "Assessment", "Sources"]) await expect(doc.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Send idea" }).click();
  const who = page.getByRole("dialog", { name: "Who should get this?" });
  await expect(who).toBeVisible({ timeout: 30_000 });
  await who.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
  await expect(step("Receiver view")).toBeEnabled(); // the optional full conversation is passed over
});
