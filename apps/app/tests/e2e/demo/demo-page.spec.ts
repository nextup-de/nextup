// The static demo (/demo, docs/IDEAS.md "The demo page"): no company, no login, driven from the demo
// controls under the Dev button (components/shell/DemoControls.tsx). Every click the story needs is a step
// there: fill the sample idea, send it, two answers each filled and sent, the last look, Finalize, send it,
// switch to the team leader, open the idea, accept it, open the project, and the manager's Dashboard. A step
// taken on the page itself is passed over, the leader's and manager's too. A company's /raise offers none of it.
import { aiMessages, ANSWER, expect, START, test } from "../helpers";

const TITLE = "A reporting screen at each assembly station";

test("the demo controls click through the whole story: raise, publish, accept, dashboard", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/demo\/raise$/);

  const start = page.getByRole("textbox", { name: START });
  // The controls: the next step's title over the arrow that takes it (the arrow is named after its step).
  const controls = page.getByRole("group", { name: "Demo controls" });
  const step = (name: string) => controls.getByRole("button", { name, exact: true });
  const take = async (name: string) => { await expect(step(name)).toBeEnabled({ timeout: 30_000 }); await step(name).click(); };

  await test.step("no Start step: the sample idea is the first", async () => {
    await expect(controls).toContainText("Fill sample idea");
    await expect(controls.getByRole("button", { name: "Start demo" })).toHaveCount(0);
  });

  await test.step("fill and send: the chat shows the reply, its short read and what is still unclear", async () => {
    await take("Fill sample idea");
    await expect(start).toHaveValue(TITLE);
    await take("Send to NextUp");
    await expect(aiMessages(page).first()).toContainText("I can see the value here.", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Close analysis" })).toHaveCount(0); // the full analysis stays closed
    const read = page.getByRole("group", { name: "AI analysis" });
    for (const label of ["Value", "Feasibility", "Cost", "Fit", "Risk"]) await expect(read.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Still unclear" }).getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0); // not after one exchange
  });

  await test.step("View full analysis opens it, and only that", async () => {
    await page.getByRole("button", { name: /View full analysis/ }).click();
    await page.getByRole("button", { name: "Close analysis" }).click();
  });

  await test.step("two answers: the first sent from the controls, the second from the composer itself", async () => {
    await take("First answer");
    await take("Send answer");
    await expect(aiMessages(page).last()).toContainText("loses its owner", { timeout: 30_000 });
    await take("Second answer");
    await page.getByRole("textbox", { name: ANSWER }).press("Enter"); // sent on the page: the controls follow
    await expect(aiMessages(page).last()).toContainText("clear baseline", { timeout: 30_000 });
    await expect(controls).toContainText("Preview");
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(1); // one button, after three exchanges
    await expect(page.getByRole("button", { name: "Publish now" })).toHaveCount(0);
  });

  await test.step("preview, finalize, send: published to the first suggestion", async () => {
    await take("Preview");
    await expect(page.getByRole("dialog", { name: "Last look before it goes out" })).toBeVisible();
    await take("Finalize");
    await expect(page.getByRole("article", { name: "Idea document" })).toContainText(TITLE);
    await take("Send idea");
    await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
  });

  await test.step("the team leader opens it, says yes and opens the project; then the manager's Dashboard", async () => {
    await take("Switch to team leader");
    await expect(page).toHaveURL(/\/demo\/leader$/);
    await take("Open the idea");
    await expect(page).toHaveURL(/\/demo\/leader\?id=/);
    await expect(page.getByRole("main")).toContainText(TITLE);
    await take("Accept it");
    await take("Open the project");
    await expect(page).toHaveURL(/\/demo\/projects\/[^/]+$/);
    await expect(page.getByRole("main")).toContainText(TITLE);
    await take("Manager view");
    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    await expect(controls).toContainText("Demo done");
  });
});

test("the leader's and manager's steps taken on the page itself: the controls follow along", async ({ page }) => {
  await page.goto("/demo");
  const controls = page.getByRole("group", { name: "Demo controls" });
  const step = (name: string) => controls.getByRole("button", { name, exact: true });
  const take = async (name: string) => { await expect(step(name)).toBeEnabled({ timeout: 30_000 }); await step(name).click(); };
  const viewAs = async (persona: "Employee" | "Team leader" | "Manager") => {
    await page.getByRole("button", { name: "Dev" }).click();
    await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
    await page.keyboard.press("Escape");
  };

  for (const name of ["Fill sample idea", "Send to NextUp", "First answer", "Send answer", "Second answer", "Send answer", "Preview", "Finalize", "Send idea"]) await take(name);
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });

  await test.step("back to the employee before the yes: the switch is offered again", async () => {
    await take("Switch to team leader");
    await expect(step("Open the idea")).toBeEnabled();
    await viewAs("Employee");
    await expect(step("Switch to team leader")).toBeEnabled();
  });

  await test.step("switched, opened and accepted on the page: the next step is the project", async () => {
    await viewAs("Team leader");
    await expect(step("Open the idea")).toBeEnabled();
    await page.getByRole("main").getByRole("button", { name: new RegExp(TITLE) }).first().click();
    await expect(step("Accept it")).toBeEnabled();
    await page.getByRole("button", { name: /^Yes, do it/ }).click();
    await page.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: "Say yes and open the project" }).click();
    await expect(step("Open the project")).toBeEnabled();
  });

  await test.step("the manager's view by hand ends the demo", async () => {
    await viewAs("Manager");
    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    await expect(controls).toContainText("Demo done");
  });
});

test("a company's raise page has no demo script", async ({ page }) => {
  await page.goto("/acme/raise");
  await expect(page.getByRole("textbox", { name: START })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fill sample idea" })).toHaveCount(0);
});
