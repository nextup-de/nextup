// LOOP acceptance (plan LOOP, LOOP-Z1): the whole case loop on a real company (sandbox stage, empty
// template) with the AI and every integration off (D2): a member raises an idea to a desk, sees the answer
// date, the holder and the routing, the desk says yes, the project is measured with a typed result and a
// CO₂ figure, a second person confirms it, the reward falls due and is recorded, the decision log lists
// the yes, and switching projects off on the Rules page takes Projects out of the member's nav.
// Own company, made straight in the database and deleted at the end, like flr.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { answerCoach, DEVELOP, DEVELOP_MORE, expect, passSecondFactor, raiseLine, test, vis } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { workdayOf } from "../../../src/features/clock/calendar";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `loop-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood";
const LEAD = "Quentin Qualityfield";
const PLANT = "Paula Plantbridge"; // manager, on the Plant manager seat (the route's deputy)
const SECOND = "Maxim Secondgate"; // manager, no seat
const UNIT = "QA";
const OWNER_ROLE = "Quality lead";
const DEPUTY_ROLE = "Plant manager";
const TITLE = "Scrap bins overflow on line 4, rework every shift";
const BASELINE = { metric: "Scrap parts per week", unit: "parts", value: "120" };
const RESULT = "80";
const CO2 = "1200";
const WORKING_DAYS_BACK = 31;

const codes = new Map<string, string>();
let companyId = "";
let ownerRoleId = "";
let projectId = "";

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** The project page's Results tab: the measure card and the reward panel are there. */
async function openResults(page: Page) {
  await page.goto(`/${SLUG}/projects/${projectId}`);
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /^Results/ }).click();
  await expect(page).toHaveURL(/tab=results/);
}

const userId = async (name: string) => (await getDb().user.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })).id;

test.describe.serial("LOOP acceptance: raise to project on a real company with AI and integrations off", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `LOOP ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: PLANT, role: "manager", dept: UNIT, email: emailOf(PLANT, SLUG) },
        { name: SECOND, role: "manager", dept: UNIT, email: emailOf(SECOND, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    const db = getDb();
    companyId = (await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;

    // The structure: a unit, two roles with one seat each, and the route between them.
    const unit = await addUnit(companyId, "loop-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string) => addRole(companyId, "loop-z1", { orgUnitId: unit, title, reportsToId: null, decides: [], spendLimitEur: null });
    ownerRoleId = await role(OWNER_ROLE);
    const deputyRoleId = await role(DEPUTY_ROLE);
    await addSeat(companyId, ownerRoleId, LEAD, await userId(LEAD));
    await addSeat(companyId, deputyRoleId, PLANT, await userId(PLANT));
    await saveRoute(companyId, "loop-z1", {
      key: "r-scrap", type: "Scrap and rework", keywords: ["scrap", "rework"],
      ownerRoleId, deputyRoleId, buddyRoleId: null, wait: "3 d",
    });

    // One check, 30 days after done: a project counts as measured (and a reward can fall due) once every check
    // has a result, and the 90-day check cannot be reached on a clock that does not move.
    await db.companyConfig.update({ where: { companyId }, data: { measureDays: [30] } });

    // D2: nothing that calls out is on for this company.
    const config = await db.companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db.integration.count({ where: { companyId } }), "Jira (or any other integration) rows").toBe(0);
    expect(await db.connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db.company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);
  });

  test.afterAll(async () => {
    if (process.env.LOOP_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("the raiser sends the idea to the Quality lead desk and sees the date, the holder and the routing", async ({ browser }) => {
    const page = await signIn(browser, RAISER);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/raise$`));

    await test.step("raises the idea and answers the coach", async () => {
      await raiseLine(page, TITLE);
      await answerCoach(page, DEVELOP);
      await answerCoach(page, DEVELOP_MORE);
    });

    await test.step("'Where should it go?' proposes the desk by keywords, and the send names the role and a date", async () => {
      const show = page.getByRole("button", { name: "Show sidebar" });
      if (await show.isVisible()) await show.click();
      await page.getByRole("button", { name: "Publish idea" }).click();
      const look = page.getByRole("dialog", { name: "Last look before it goes out" });
      await look.getByRole("button", { name: /Choose a desk/ }).click({ timeout: 30_000 });
      const who = page.getByRole("dialog", { name: "Where should it go?" });
      await expect(who).toBeVisible({ timeout: 30_000 });
      const desk = vis(who, `raise-desk-${ownerRoleId}`);
      await expect(desk).toContainText(OWNER_ROLE);
      await expect(desk).toContainText("Proposed");
      await expect(desk).not.toContainText("by the AI");
      await expect(desk).toContainText(LEAD);
      await expect(who).toContainText("Routed by keywords");
      await expect(desk).toContainText(/scrap/i); // the reasons: the idea mentions the route's keywords
      await vis(who, "raise-send").click();
      const sent = vis(who, "raise-sent");
      await expect(sent).toBeVisible({ timeout: 30_000 });
      await expect(sent).toContainText(`Sent to ${OWNER_ROLE}`);
      await expect(sent).toContainText(/\d{4}-\d{2}-\d{2}|\d{1,2}[./]\s?\d{1,2}|\d{1,2}\s+\w{3,}/); // a date
      await who.getByRole("button", { name: "Close", exact: true }).last().click();
    });

    await test.step("the case page shows the answer-by line, who holds it and the Routing panel", async () => {
      await page.getByRole("link", { name: "Open the case" }).click();
      await expect(page).toHaveURL(new RegExp(`/${SLUG}/`));
      await expect(vis(page, "case-answer-by")).toContainText(/\d/);
      await expect(vis(page, "case-holder")).toContainText(OWNER_ROLE);
      await expect(vis(page, "case-holder")).toContainText(LEAD);
      await expect(page.getByText("With", { exact: true }).first()).toBeVisible();
      const routing = vis(page, "case-routing");
      await expect(routing).toContainText(`Proposed and sent to ${OWNER_ROLE} · by keywords`);
    });
    await page.context().close();
  });

  test("the quality lead says yes and the project opens", async ({ browser }) => {
    const page = await signIn(browser, LEAD);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/leader$`));
    await page.getByRole("main").getByText(TITLE).first().click();
    await page.getByRole("button", { name: "Yes, do it" }).click();
    await page.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: "Say yes and open the project" }).click();

    await expect.poll(async () => {
      const row = await getDb().caseEvent.findFirst({ where: { companyId, type: "case.decided" } });
      const id = (row?.payload as { projectId?: string } | undefined)?.projectId;
      if (id) projectId = id;
      return id ?? null;
    }, { message: "the yes carries the id of the project it opened" }).not.toBeNull();
    await page.goto(`/${SLUG}/projects/${projectId}`);
    await expect(page.getByRole("main")).toContainText(TITLE);
    await expect(page.getByRole("main")).toContainText("Planning");
    await page.context().close();
  });

  test("the lead sets the baseline; the start and done are written 31 working days back so the 30-day check is open", async ({ browser }) => {
    const page = await signIn(browser, LEAD);
    await page.goto(`/${SLUG}/projects/${projectId}`);
    await page.getByLabel("What is measured").filter({ visible: true }).fill(BASELINE.metric);
    await page.getByLabel(/Today.s number/).filter({ visible: true }).fill(BASELINE.value);
    await page.getByLabel("Unit").filter({ visible: true }).fill(BASELINE.unit);
    await page.getByLabel("Lower is better").filter({ visible: true }).check();
    await page.getByLabel("Where the number comes from").filter({ visible: true }).fill("Weekly scrap report");
    await page.getByRole("button", { name: "Save the baseline" }).click();
    await expect(page.getByRole("main")).toContainText(`${BASELINE.value} ${BASELINE.unit}`);

    // The page shows the baseline before the server has stored it; the two events below must come after it.
    await expect.poll(() => getDb().caseEvent.count({ where: { companyId, type: "project.baseline", targetId: projectId } })).toBe(1);

    // A sandbox clock cannot be moved: the two events carry a day 31 working days before today.
    const db = getDb();
    const now = new Date();
    const back = workdayOf(now, await loadCalendar(companyId)) - WORKING_DAYS_BACK;
    const lead = await userId(LEAD);
    const row = (suffix: string, type: "project.started" | "project.done", payload: object) => ({
      id: `loop-z1-${STAMP}-${suffix}`, companyId, ts: now, day: back, type, actor: LEAD, actorUserId: lead,
      targetId: projectId, source: "app", payload,
    });
    await db.caseEvent.createMany({ data: [row("started", "project.started", {}), row("done", "project.done", { note: "Bins resized" })] });
    await rebuildProjections(companyId, now);

    await page.reload();
    await expect(page.getByRole("main")).toContainText(/P-\d+ · Measuring/);
    await page.context().close();
  });

  test("the lead types the 30-day result with a CO₂ figure; it is not confirmed and the lead cannot confirm it", async ({ browser }) => {
    const page = await signIn(browser, LEAD);
    await openResults(page);
    // the "type the figure" form starts open, so there is nothing to click first
    await page.getByLabel(/The number now/).filter({ visible: true }).fill(RESULT);
    await page.getByLabel("CO₂ per year (kg)").filter({ visible: true }).fill(CO2);
    await page.getByRole("button", { name: "Record the measure" }).click();

    await expect(vis(page, "measure-source-30")).toContainText(`Typed by ${LEAD} · not confirmed`); // the page names the holder's seat label (the person), not the role
    await expect(page.getByRole("main")).toContainText("Not confirmed yet");
    await expect(page.getByRole("main")).toContainText(/1[ ,.’']?200/); // the CO₂ figure
    await expect(page.getByTestId("measure-confirm-30")).toHaveCount(0);
    await page.reload();
    await expect(vis(page, "measure-source-30")).toBeVisible();
    await expect(page.getByTestId("measure-confirm-30")).toHaveCount(0);
    await page.context().close();
  });

  test("the second manager confirms; the verdict is better, the reward is due and a manager records it", async ({ browser }) => {
    const page = await signIn(browser, SECOND);
    await openResults(page);
    await expect(page.getByRole("main")).toContainText("Not confirmed yet");
    await vis(page, "measure-confirm-30").click();
    await page.getByRole("button", { name: "Yes, the number is right" }).click();

    await expect(vis(page, "measure-source-30")).toContainText(`Confirmed by`);
    await expect(page.getByRole("main")).toContainText(/better/i);
    await expect(page.getByRole("main")).toContainText(/Reward due by (your|the company.s) rule/);

    await page.getByRole("button", { name: "Record the reward" }).click();
    await expect(page.getByRole("main")).toContainText(/Recorded .* by /);
    await page.context().close();
  });

  test("the decision log lists the yes with the desk's role, for the manager and for the raiser", async ({ browser }) => {
    for (const who of [PLANT, RAISER]) {
      const page = await signIn(browser, who);
      await page.goto(`/${SLUG}/decisions`);
      // visible: for a moment after a load the streamed page holds a hidden second copy of the row.
      const row = page.getByTestId("decisions-row").filter({ hasText: TITLE, visible: true });
      await expect(row, `${who} sees the yes`).toHaveCount(1);
      await expect(row).toContainText(OWNER_ROLE);
      await expect(row).toContainText("Yes");
      await page.context().close();
    }
  });

  test("the manager switches Projects off on the Rules page and the raiser's nav loses Projects", async ({ browser }) => {
    const raiser = await signIn(browser, RAISER);
    await raiser.goto(`/${SLUG}/raise`);
    await expect(raiser.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible();

    const manager = await signIn(browser, PLANT);
    await manager.goto(`/${SLUG}/settings/rules`);
    // visible: streaming can add a hidden staging copy of the switch after the first one has rendered.
    const projects = manager.getByTestId("settings-rules-step-projects").filter({ visible: true });
    await expect(projects).toHaveCount(1);
    await expect(projects).toBeChecked();
    await projects.uncheck();
    await vis(manager, "settings-rules-save").click();
    await expect(vis(manager, "settings-rules-saved")).toBeVisible();

    await raiser.goto(`/${SLUG}/raise`);
    await raiser.waitForLoadState("networkidle");
    await expect(raiser.getByRole("link", { name: "Projects", exact: true })).toHaveCount(0);
    await raiser.context().close();
    await manager.context().close();
  });
});
