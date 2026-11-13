// RES acceptance (plan RES, RES-Z1): a result is questioned, confirmed and closes, on a real company (sandbox stage, empty template) with the AI,
// Teams, Jira and Microsoft 365 off (D4). One test, one project, the steps of the plan:
//  1. before the start a reward is possible, so the baseline waits for a second person (D16): the lead's start is refused; the lead and who
//     typed the number may not confirm it, the sponsor does in the UI; then the lead starts the project;
//     where the lead is the only holder of the route's deputy seat that seat counts as empty (D30), and a manager confirms instead;
//  2. two steps on the board (the dropped one counts in no total: the overview reads 1 / 1, D31); the Done sheet refuses Done until one step is finished and the other dropped with a reason (D13), and so does the server;
//  3. at the first check the lead types a number; the deputy of the route sends it back with a reason (D14), the lead hears of it and enters it again;
//     a confirmation that names the number before the replacement is refused; the sponsor confirms the new number (D15): the lead and the raiser
//     hear of it and the project's reward falls due (D17);
//  4. ten working days later the clock reminds every manager (reminder.reward); the manager records the reward in the UI: the project is recognised,
//     and the reminder is not written again;
//  5. the raiser, who is not on the team, sees only the raiser panel (D21);
//  6. a sandbox sends no mail: every outside row is skipped, to the right person, and every in-app row is sent.
//
// Set up in the database where the UI is not the point: the org, the raised idea, the draft project up to its baseline and the planner and
// clock passes. The UI works out "today" from the real clock, so to reach the first check the project's history is moved back by CHECK_DAYS
// working days once the project is marked done (see `moveHistoryBack`): the check then opens today. Own company, made straight in the database
// and deleted at the end, like mov.spec.ts, set.spec.ts and loop.spec.ts. Run on any weekday.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { meFor, type Actor } from "../../../src/features/auth/identity";
import { reduce } from "../../../src/features/cases/reducer";
import { DEFAULT_CALENDAR } from "../../../src/features/clock";
import { dateOfWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { mayAppendProject } from "../../../src/features/projects/permissions";
import { getDb } from "../../../src/lib/db/client";
import { loadSeed } from "../../../src/lib/db/companies";
import { appendEventRow, loadLog } from "../../../src/lib/db/events";
import { loadSeats } from "../../../src/lib/db/holders";
import { loadLoopRules, saveLoopRules } from "../../../src/lib/db/loop";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { ensureMovSinceDay } from "../../../src/lib/db/rules";
import { loadLogFor } from "../../../src/lib/db/viewer-log";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `res-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood"; // member: raised the idea, on no team
const DESK = "Quentin Qualityfield"; // leader on the Quality lead seat: the route's owner, says yes
const DEPUTY = "Dora Deputyfield"; // leader on the Line lead seat: the route's deputy, may send a result back
const LEAD = "Lena Linefield"; // leader on a Setter seat: leads the project, types the baseline and the numbers
const SPONSOR = "Sven Sponsorfield"; // leader on an Operator seat: the accepted sponsor
const MEMBER = "Max Memberfield"; // member on an Operator seat: on the team, owns the step that is finished
const MANAGER = "Mona Managerfield"; // manager on the Plant manager seat: hears that the reward is due
const UNIT = "OPS";
const OWNER_ROLE = "Quality lead";
const DEPUTY_ROLE = "Line lead";
const LEAD_ROLE = "Setter";
const TEAM_ROLE = "Operator";
const TOP_ROLE = "Plant manager";
const SOLO_ROLE = "Solo deputy"; // the deputy role of the second route, held by the lead alone

const TITLE = "Crane queue at the changeover";
const STEP_DONE = "Measure the crane queue";
const STEP_DROP = "Buy a second crane";
const DROP_WHY = "The plant will not pay for a second crane";
const BACK_WHY = "Only the morning shift was counted";
const CHECK_DAYS = 10;
const BASELINE = 45;
const FIRST = 30; // the number the lead types first, and the deputy sends back
const SECOND = 28; // the number the lead enters again, and the sponsor confirms

const codes = new Map<string, string>();
let companyId = "";
let routeKey = "r-res";
let soloRouteKey = "r-res-solo";
let n = 0;
type Person = "raiser" | "desk" | "deputy" | "lead" | "sponsor" | "member" | "manager";
const id: Record<Person, string> = { raiser: "", desk: "", deputy: "", lead: "", sponsor: "", member: "", manager: "" };

/** Today's working-day number, the way the app counts it on a sandbox company (the default calendar). */
const D = workdayOf(new Date(), DEFAULT_CALENDAR);
/** A moment on working day `day`: what the clock is run with to be "later". */
const on = (day: number) => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T10:00:00Z`);

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

const db = () => getDb();
const userId = async (name: string) => (await db().user.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })).id;
const eventsOf = (type: string, targetId: string) => db().caseEvent.findMany({ where: { companyId, type, targetId }, orderBy: { seq: "asc" } });
const noticesOf = (userIdOf: string, template: string, channel?: string) =>
  db().outboxMessage.findMany({ where: { companyId, recipientUserId: userIdOf, template, ...(channel ? { channel } : {}) }, orderBy: { createdAt: "asc" } });
const aboutProject = (rows: { subject: string; text: string }[], title: string) => rows.filter((r) => r.subject.includes(title) || r.text.includes(title));

/** Append an event the way the app would store it; returns its id. */
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>): Promise<string> {
  const eventId = `${SLUG}-e${n++}`;
  const r = await appendEventRow(companyId, { id: eventId, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
  return eventId;
}

/** The clock and the planner until `rows` finds something: for notices that follow a UI action, or a clock day (the app's own loops may hold a lease for a moment). */
async function settle<T>(rows: () => Promise<T[]>, message: string, day?: number): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce(day === undefined ? undefined : on(day));
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

/** The server's own rights check for an event, on the reduced state of the company as it is now: what appendEventAction would say. */
async function verdictFor(who: { name: string; id: string; role: "leader" | "member" | "manager" }, type: string, target: string, payload: Record<string, unknown>) {
  const company = await db().company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } });
  const seed = (await loadSeed(company.slug))!;
  const seats = await loadSeats(companyId);
  const state = reduce({ ...seed, seats }, await loadLog(companyId));
  const actor: Actor = { role: who.role, userId: who.id, me: meFor(who.id, seats), name: who.name, handle: null };
  return mayAppendProject(actor, { type: type as never, target, payload }, state, "en");
}

/** The project's history and its idea's, moved back by `days` working days: the UI's "today" is the real clock, so this is how a check that opens `days` after the done day opens now. */
async function moveHistoryBack(targets: string[], days: number) {
  await db().caseEvent.updateMany({ where: { companyId, targetId: { in: targets } }, data: { day: { decrement: days } } });
}

test.describe("RES acceptance: a result that closes properly", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `RES ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: DEPUTY, role: "leader", dept: UNIT, email: emailOf(DEPUTY, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: SPONSOR, role: "leader", dept: UNIT, email: emailOf(SPONSOR, SLUG) },
        { name: MEMBER, role: "member", dept: UNIT, email: emailOf(MEMBER, SLUG) },
        { name: MANAGER, role: "manager", dept: UNIT, email: emailOf(MANAGER, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER);
    id.desk = await userId(DESK);
    id.deputy = await userId(DEPUTY);
    id.lead = await userId(LEAD);
    id.sponsor = await userId(SPONSOR);
    id.member = await userId(MEMBER);
    id.manager = await userId(MANAGER);

    // The structure: the Quality lead desk (the route's owner) and the Line lead (its deputy) report to the Plant manager; the lead sits on a
    // Setter seat and the sponsor and the member on Operator seats. The deputy holds no part in the project but the right to confirm.
    const unit = await addUnit(companyId, "res-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string, reportsToId: string | null) => addRole(companyId, "res-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
    const topRole = await role(TOP_ROLE, null);
    const ownerRole = await role(OWNER_ROLE, topRole);
    const deputyRole = await role(DEPUTY_ROLE, topRole);
    const leadRole = await role(LEAD_ROLE, deputyRole);
    const teamRole = await role(TEAM_ROLE, leadRole);
    await addSeat(companyId, topRole, MANAGER, id.manager);
    await addSeat(companyId, ownerRole, DESK, id.desk);
    await addSeat(companyId, deputyRole, DEPUTY, id.deputy);
    await addSeat(companyId, leadRole, LEAD, id.lead);
    for (const [name, uid] of [[MEMBER, id.member], [SPONSOR, id.sponsor]] as const) await addSeat(companyId, teamRole, name, uid);
    routeKey = "r-res";
    await saveRoute(companyId, "res-z1", { key: routeKey, type: "Changeover", keywords: ["changeover", "crane"], ownerRoleId: ownerRole, deputyRoleId: deputyRole, buddyRoleId: null, wait: "3 d" });
    // A second route whose deputy desk is held by the lead alone (D30): nobody on that desk may confirm the lead's baseline.
    const soloRole = await role(SOLO_ROLE, topRole);
    await addSeat(companyId, soloRole, LEAD, id.lead);
    soloRouteKey = "r-res-solo";
    await saveRoute(companyId, "res-z1", { key: soloRouteKey, type: "Packing", keywords: ["packing", "pallet"], ownerRoleId: ownerRole, deputyRoleId: soloRole, buddyRoleId: null, wait: "3 d" });

    // The rules: a reward is possible (measure and recognition on, the default thanks), and one measure check, so one result settles the project.
    await saveLoopRules(companyId, { ...(await loadLoopRules(companyId)), measureDays: [CHECK_DAYS] });

    // D4: nothing that calls out is on, and every notice of the loop and the reminders goes by mail (skipped on a sandbox).
    await db().companyConfig.update({ where: { companyId }, data: { notifications: true, noticeChannels: { loop: "mail", reminders: "mail" } } });
    const config = await db().companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db().integration.count({ where: { companyId, on: true } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db().connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db().company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);

    // MOV counts from day 0 on this company, so what the test writes is old enough to count (RES D17: no burst for a company that is live).
    await ensureMovSinceDay(companyId, 0);
    // The planner starts at the newest event the first time it sees a company: one pass now, events after it.
    await dispatchOnce();
  });

  test.afterAll(async () => {
    if (process.env.RES_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("RES acceptance: a result is questioned, confirmed and closes", async ({ browser }) => {
    test.setTimeout(240_000);
    const caseId = `${SLUG}-case`;
    const projectId = `${SLUG}-p`;
    let page: Page;

    // ── the draft: an idea said yes to, a lead, a sponsor who accepted, a goal and a baseline the lead typed ──────────────
    await append("case.raised", RAISER, id.raiser, caseId, { kind: "idea", title: TITLE, body: "The setters wait for the crane at every changeover.", assignee: DESK, fromDept: UNIT, routeId: routeKey, visibility: "everyone" });
    await append("case.decided", DESK, id.desk, caseId, { answer: "yes", projectId, lead: LEAD, leadUserId: id.lead, title: TITLE, draft: true });
    await append("project.lead.answered", LEAD, id.lead, projectId, { take: true });
    const invite = await append("project.invited", LEAD, id.lead, projectId, { userId: id.sponsor, role: "sponsor" });
    await append("project.invite.answered", SPONSOR, id.sponsor, projectId, { userId: id.sponsor, inviteId: invite, take: true });
    await append("project.member", LEAD, id.lead, projectId, { name: MEMBER, userId: id.member, on: true });
    await append("project.goal", LEAD, id.lead, projectId, { goal: `${TITLE}: halve the waiting`, doneWhen: "Three shifts in a row without waiting for the crane" });
    const baselineId = await append("project.baseline", LEAD, id.lead, projectId, { metric: "Waiting", unit: "min", value: BASELINE, better: "down", source: "Stopwatch" });

    // ── a second draft: the lead holds the route's deputy desk alone (D30) ───────────────────────────────────────────────
    const soloCase = `${SLUG}-case-solo`;
    const soloProject = `${SLUG}-p-solo`;
    const SOLO_TITLE = "Pallet labels at goods out";
    await append("case.raised", RAISER, id.raiser, soloCase, { kind: "idea", title: SOLO_TITLE, body: "The labels peel off in the cold store.", assignee: DESK, fromDept: UNIT, routeId: soloRouteKey, visibility: "everyone" });
    await append("case.decided", DESK, id.desk, soloCase, { answer: "yes", projectId: soloProject, lead: LEAD, leadUserId: id.lead, title: SOLO_TITLE, draft: true });
    await append("project.lead.answered", LEAD, id.lead, soloProject, { take: true });
    await append("project.goal", LEAD, id.lead, soloProject, { goal: `${SOLO_TITLE}: labels that stay`, doneWhen: "No label comes off in a week" });
    const soloBaseline = await append("project.baseline", LEAD, id.lead, soloProject, { metric: "Labels lost", unit: "per week", value: 12, better: "down", source: "Count" });

    // ── the baseline waits for a second person ─────────────────────────────────────────────────────────────────────────
    await test.step("the lead cannot start: the baseline waits for the sponsor or the route's deputy, and neither the lead nor who typed it may confirm it", async () => {
      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await expect(page.getByTestId("draft-baseline-waits")).toBeVisible();
      await expect(page.getByRole("button", { name: "Start the project" })).toBeDisabled();
      await expect(page.getByTestId("baseline-confirm"), "the lead has no confirm button").toHaveCount(0);
      await expect(page.getByTestId("baseline-waits")).toContainText("The sponsor or the route's deputy confirms it");
      await page.context().close();
      // The server says the same: not the lead, and not the start.
      const lead = { name: LEAD, id: id.lead, role: "leader" as const };
      expect(await verdictFor(lead, "project.baseline.confirmed", projectId, { baselineEventId: baselineId }), "the lead confirms the baseline").toMatchObject({ ok: false });
      expect(await verdictFor(lead, "project.started", projectId, {}), "the start before the confirmation").toMatchObject({ ok: false });
      expect(await eventsOf("project.started", projectId)).toHaveLength(0);
    });

    await test.step("D30: the lead is the only holder of the route's deputy seat and there is no sponsor, so the seat counts as empty and a manager confirms the baseline", async () => {
      const other = { name: DEPUTY, id: id.deputy, role: "leader" as const }; // holds the other route's deputy seat, not this one
      const manager = { name: MANAGER, id: id.manager, role: "manager" as const };
      const lead = { name: LEAD, id: id.lead, role: "leader" as const };
      expect(await verdictFor(lead, "project.baseline.confirmed", soloProject, { baselineEventId: soloBaseline }), "the lead holds the seat but may not confirm").toMatchObject({ ok: false });
      expect(await verdictFor(other, "project.baseline.confirmed", soloProject, { baselineEventId: soloBaseline }), "the deputy of another route").toMatchObject({ ok: false });
      expect(await verdictFor(manager, "project.baseline.confirmed", soloProject, { baselineEventId: soloBaseline }), "a manager, the deputy desk being empty").toMatchObject({ ok: true });
      // And the manager does not confirm where the deputy desk is staffed by somebody else (the first project).
      expect(await verdictFor(manager, "project.baseline.confirmed", projectId, { baselineEventId: baselineId }), "a manager where the deputy and the sponsor exist").toMatchObject({ ok: false });

      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${soloProject}`);
      await expect(page.getByRole("button", { name: "Start the project" })).toBeDisabled();
      await page.context().close();

      page = await signIn(browser, MANAGER);
      await page.goto(`/${SLUG}/projects/${soloProject}`);
      await page.getByTestId("baseline-confirm").click();
      await expect.poll(async () => (await eventsOf("project.baseline.confirmed", soloProject)).length).toBe(1);
      expect((await eventsOf("project.baseline.confirmed", soloProject))[0]).toMatchObject({ actorUserId: id.manager });
      await page.context().close();

      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${soloProject}`);
      await expect(page.getByRole("button", { name: "Start the project" })).toBeEnabled();
      await page.context().close();
    });

    await test.step("the sponsor confirms the baseline in the UI; the lead is told and starts the project", async () => {
      page = await signIn(browser, SPONSOR);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await page.getByTestId("baseline-confirm").click();
      await expect.poll(async () => (await eventsOf("project.baseline.confirmed", projectId)).length).toBe(1);
      expect((await eventsOf("project.baseline.confirmed", projectId))[0]).toMatchObject({ actorUserId: id.sponsor });
      await expect(page.getByTestId("baseline-confirmed")).toContainText("Confirmed by");
      await page.context().close();
      const told = aboutProject(await settle(() => noticesOf(id.lead, "loop.project.baseline.confirmed", "inapp"), "the lead is told that the baseline is confirmed"), TITLE);
      expect(told[0]).toMatchObject({ status: "sent", address: null });
      expect(aboutProject(await noticesOf(id.sponsor, "loop.project.baseline.confirmed"), TITLE), "the one who confirmed is not told").toHaveLength(0);

      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await expect(page.getByTestId("draft-baseline-waits")).toHaveCount(0);
      await page.getByRole("button", { name: "Start the project" }).click();
      await expect.poll(async () => (await eventsOf("project.started", projectId)).length).toBe(1);
      await page.context().close();
    });

    // ── two steps, and the Done sheet ──────────────────────────────────────────────────────────────────────────────────
    await append("project.step.added", LEAD, id.lead, projectId, { stepId: "s_done", text: STEP_DONE, owner: MEMBER, ownerUserId: id.member });
    await append("project.step.added", LEAD, id.lead, projectId, { stepId: "s_drop", text: STEP_DROP, owner: LEAD, ownerUserId: id.lead });

    await test.step("Done is refused until one step is finished and the other dropped with a reason: in the sheet and on the server", async () => {
      const lead = { name: LEAD, id: id.lead, role: "leader" as const };
      expect(await verdictFor(lead, "project.done", projectId, {}), "done with two open steps and no list").toMatchObject({ ok: false });
      expect(await verdictFor(lead, "project.done", projectId, { openSteps: [{ stepId: "s_done", end: "done" }] }), "done with one step missing from the list").toMatchObject({ ok: false });
      expect(await verdictFor(lead, "project.done", projectId, { openSteps: [{ stepId: "s_done", end: "done" }, { stepId: "s_drop", end: "dropped" }] }), "a drop without a reason").toMatchObject({ ok: false });
      expect(await eventsOf("project.done", projectId)).toHaveLength(0);

      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await page.getByRole("button", { name: "Mark it done…" }).click();
      const sheet = page.getByRole("form", { name: "Mark the project done" });
      await expect(sheet.getByTestId("done-when")).toContainText("Three shifts in a row without waiting for the crane");
      const submit = sheet.getByRole("button", { name: "Mark it done", exact: true });
      await expect(submit, "nothing chosen").toBeDisabled();
      await sheet.getByTestId("done-step-s_done").getByRole("radio", { name: "Done", exact: true }).check();
      await expect(submit, "one step chosen").toBeDisabled();
      await sheet.getByTestId("done-step-s_drop").getByRole("radio", { name: "Drop", exact: true }).check();
      await expect(submit, "a drop without a reason").toBeDisabled();
      await sheet.getByTestId("done-step-s_drop").getByRole("textbox").fill(DROP_WHY);
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect.poll(async () => (await eventsOf("project.done", projectId)).length).toBe(1);
      expect((await eventsOf("project.done", projectId))[0]).toMatchObject({
        actorUserId: id.lead, payload: { openSteps: [{ stepId: "s_done", end: "done" }, { stepId: "s_drop", end: "dropped", why: DROP_WHY }] },
      });
      // D31: the dropped step counts in no total, so the overview reads 1 / 1 and not 1 / 2.
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await expect(page.getByRole("region", { name: "Where it stands" }).locator("div").filter({ has: page.getByText("Steps done", { exact: true }) }).first()).toContainText("1 / 1");
      await page.goto(`/${SLUG}/projects/${projectId}?tab=board`);
      await expect(page.getByText("1 of 1 done", { exact: true }), "the board header counts the dropped step in no total").toBeVisible();
      await page.context().close();
    });

    // The UI's today is the real clock: move the project's days back so that its first check opens now.
    await moveHistoryBack([projectId, caseId], CHECK_DAYS);

    // ── the first check: typed, sent back, entered again, confirmed ──────────────────────────────────────────────────
    await test.step("the lead types the first result", async () => {
      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectId}?tab=results`);
      await page.getByTestId(`measure-type-${CHECK_DAYS}`).click();
      const form = page.getByRole("form", { name: `Record the ${CHECK_DAYS}-day measure` });
      await form.getByLabel("The number now").fill(String(FIRST));
      await form.getByRole("button", { name: "Record the measure" }).click();
      await expect.poll(async () => (await eventsOf("project.measured", projectId)).length).toBe(1);
      expect((await eventsOf("project.measured", projectId))[0]).toMatchObject({ actorUserId: id.lead, payload: { check: CHECK_DAYS, value: FIRST } });
      await expect(page.getByTestId(`measure-waiting-${CHECK_DAYS}`)).toBeVisible();
      await expect(page.getByTestId(`measure-confirm-${CHECK_DAYS}`), "the lead does not confirm their own number").toHaveCount(0);
      await page.context().close();
    });

    await test.step("the deputy of the route sends it back with a reason; the lead is told", async () => {
      page = await signIn(browser, DEPUTY);
      await page.goto(`/${SLUG}/projects/${projectId}?tab=results`);
      await page.getByTestId(`measure-sendback-${CHECK_DAYS}`).click();
      const form = page.getByRole("form", { name: "Send it back" });
      await form.getByLabel("What looks wrong?").fill(BACK_WHY);
      await form.getByRole("button", { name: "Send it back" }).click();
      await expect.poll(async () => (await eventsOf("project.measure.questioned", projectId)).length).toBe(1);
      expect((await eventsOf("project.measure.questioned", projectId))[0]).toMatchObject({ actorUserId: id.deputy, payload: { check: CHECK_DAYS, why: BACK_WHY } });
      await expect(page.getByTestId(`measure-sentback-${CHECK_DAYS}`)).toContainText(BACK_WHY);
      await page.context().close();
      const told = aboutProject(await settle(() => noticesOf(id.lead, "loop.project.measure.questioned", "inapp"), "the lead is told that the number was sent back"), TITLE);
      expect(told[0]).toMatchObject({ status: "sent", address: null });
      expect(aboutProject(await noticesOf(id.manager, "loop.project.measure.questioned"), TITLE), "a first questioning is not for the managers").toHaveLength(0);
    });

    let firstRevision = "";
    await test.step("the lead enters it again; the old number is kept in the history", async () => {
      firstRevision = (await eventsOf("project.measured", projectId))[0].id;
      page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectId}?tab=results`);
      await expect(page.getByTestId(`measure-sentback-${CHECK_DAYS}`)).toContainText(BACK_WHY);
      await page.getByTestId(`measure-type-${CHECK_DAYS}`).click();
      const form = page.getByRole("form", { name: `Record the ${CHECK_DAYS}-day measure` });
      await form.getByLabel("The number now").fill(String(SECOND));
      await form.getByRole("button", { name: "Record the measure" }).click();
      await expect.poll(async () => (await eventsOf("project.measured", projectId)).length).toBe(2);
      await expect(page.getByTestId(`measure-reentered-${CHECK_DAYS}`)).toContainText(String(FIRST));
      await expect(page.getByTestId(`measure-sentback-${CHECK_DAYS}`)).toHaveCount(0);
      await page.context().close();
    });

    await test.step("a confirmation of the number that was replaced is refused; the one who typed the new number may not confirm it either", async () => {
      const sponsor = { name: SPONSOR, id: id.sponsor, role: "leader" as const };
      const stale = await verdictFor(sponsor, "project.measure.confirmed", projectId, { check: CHECK_DAYS, measureEventId: firstRevision });
      expect(stale, "a confirmation for the first number").toMatchObject({ ok: false });
      const secondRevision = (await eventsOf("project.measured", projectId))[1].id;
      expect(await verdictFor({ name: LEAD, id: id.lead, role: "leader" }, "project.measure.confirmed", projectId, { check: CHECK_DAYS, measureEventId: secondRevision }), "the lead confirms").toMatchObject({ ok: false });
      expect(await verdictFor(sponsor, "project.measure.confirmed", projectId, { check: CHECK_DAYS, measureEventId: secondRevision }), "the sponsor confirms the new number").toMatchObject({ ok: true });
    });

    await test.step("the sponsor confirms the new number: the lead and the raiser are told, the reward is due", async () => {
      page = await signIn(browser, SPONSOR);
      await page.goto(`/${SLUG}/projects/${projectId}?tab=results`);
      await page.getByTestId(`measure-confirm-${CHECK_DAYS}`).click();
      await page.getByRole("button", { name: "Yes, the number is right" }).click();
      await expect.poll(async () => (await eventsOf("project.measure.confirmed", projectId)).length).toBe(1);
      expect((await eventsOf("project.measure.confirmed", projectId))[0]).toMatchObject({ actorUserId: id.sponsor, payload: { check: CHECK_DAYS } });
      await expect(page.getByTestId("recognition-due")).toContainText("Recognition due by");
      await page.context().close();

      for (const [who, name] of [[id.lead, LEAD], [id.raiser, RAISER]] as const) {
        const app = aboutProject(await settle(() => noticesOf(who, "loop.project.measure.confirmed", "inapp"), `${name} is told that the result is confirmed`), TITLE);
        expect(app, `an in-app notice of the confirmation for ${name}`).toHaveLength(1);
        expect(app[0]).toMatchObject({ status: "sent", address: null });
        const mail = aboutProject(await noticesOf(who, "loop.project.measure.confirmed", "mail"), TITLE);
        expect(mail[0], `an outside row for ${name}`).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(name, SLUG) });
      }
      expect(aboutProject(await noticesOf(id.sponsor, "loop.project.measure.confirmed"), TITLE), "the one who confirmed is not told").toHaveLength(0);
    });

    // ── the reward ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the reward fell due: ten working days later the clock reminds every manager, once", async () => {
      const rows = aboutProject(await settle(() => noticesOf(id.manager, "reminder.reward", "inapp"), "the manager is reminded that the reward is due", D + 10), TITLE);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "sent", address: null });
      const mail = aboutProject(await noticesOf(id.manager, "reminder.reward", "mail"), TITLE);
      expect(mail[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(MANAGER, SLUG) });
      const facts = (await eventsOf("clock.due", projectId)).filter((e) => (e.payload as { kind?: string }).kind === "reward");
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "reward", dueDay: D + 10 } });
      for (const who of [id.lead, id.sponsor, id.deputy, id.raiser]) expect(await noticesOf(who, "reminder.reward"), "only the managers are reminded").toHaveLength(0);
    });

    await test.step("the raiser sees that recognition is due, and the manager records the reward in the UI: the project is recognised", async () => {
      page = await signIn(browser, RAISER);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      await expect(page.getByTestId("raiser-recognition")).toContainText("Recognition due by");
      await page.context().close();

      page = await signIn(browser, MANAGER);
      await page.goto(`/${SLUG}/projects/${projectId}?tab=results`);
      await page.getByRole("form", { name: "Record the reward" }).getByRole("button", { name: "Record the reward" }).click();
      await expect.poll(async () => (await eventsOf("project.rewarded", projectId)).length).toBe(1);
      expect((await eventsOf("project.rewarded", projectId))[0]).toMatchObject({ actorUserId: id.manager });
      await expect(page.getByRole("main")).toContainText("Recognised");
      await page.context().close();
      // Recorded: the reminder is over, however many days pass.
      await settle(async () => [1], "the clock on a later day", D + 20);
      const facts = (await eventsOf("clock.due", projectId)).filter((e) => (e.payload as { kind?: string }).kind === "reward");
      expect(facts, "no second reward fact").toHaveLength(1);
      expect(aboutProject(await noticesOf(id.manager, "reminder.reward", "inapp"), TITLE), "no second reminder").toHaveLength(1);
    });

    // ── the raiser's panel ─────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the raiser, who is not on the team, sees only the raiser panel: steps 1 of 1, the result, no board and no buttons", async () => {
      page = await signIn(browser, RAISER);
      await page.goto(`/${SLUG}/projects/${projectId}`);
      const panel = page.getByTestId("raiser-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId("raiser-steps")).toContainText("1 of 1 steps done"); // the dropped step counts in no total
      await expect(panel.getByTestId("raiser-results")).toContainText(`${CHECK_DAYS}-day check: ${SECOND}`);
      await expect(panel.getByTestId("raiser-results")).toContainText("Confirmed by a second person");
      await expect(page.getByRole("main")).toContainText("Recognised");
      for (const text of [STEP_DONE, STEP_DROP, DROP_WHY, BACK_WHY]) await expect(page.getByRole("main"), `"${text}" is not on the raiser's page`).not.toContainText(text);
      // The projects sidebar and its "Show sidebar" control are navigation, not actions on this project: count the project's own buttons only.
      const actions = page.getByRole("main").locator('button:not(aside[aria-label="Projects"] *):not([aria-label="Show sidebar"])').filter({ visible: true });
      await expect(actions, "no buttons on the raiser's page").toHaveCount(0);
      const entries = page.getByRole("main").locator('input:not(aside[aria-label="Projects"] *), textarea:not(aside[aria-label="Projects"] *)').filter({ visible: true }); // the sidebar's search is navigation
      await expect(entries, "no entry on the raiser's page").toHaveCount(0);
      await page.context().close();

      // Q1's current default: this is a presentation only. The browser's log still carries the project's events - the board, the numbers,
      // the reasons - so this step is NOT a privacy check; the cut of the data is a later release (RES D21, Q1).
      const shipped = JSON.stringify((await loadLogFor(companyId, { userId: id.raiser, role: "member" })).log.events);
      expect(shipped, "the raiser's browser still receives the project's events").toContain(projectId);
      expect(shipped).toContain("project.step.added");
    });

    // ── the sandbox sent nothing ───────────────────────────────────────────────────────────────────────────────────────
    await test.step("a sandbox sent no mail and no Teams message: every outside row is skipped, every in-app row is sent", async () => {
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.filter((r) => r.channel === "teams" || r.channel === "webhook"), "Teams and webhook rows").toHaveLength(0);
      const outside = rows.filter((r) => r.channel !== "inapp");
      expect(outside.length).toBeGreaterThan(0);
      expect(outside.every((r) => r.status === "skipped" && r.lastError === "sandbox"), "every outside row is skipped").toBe(true);
      expect(rows.filter((r) => r.channel === "inapp").every((r) => r.status === "sent" && r.sentAt !== null && r.address === null)).toBe(true);
      expect(await db().integration.count({ where: { companyId, on: true } }), "integrations stayed off").toBe(0);
    });
  });
});
