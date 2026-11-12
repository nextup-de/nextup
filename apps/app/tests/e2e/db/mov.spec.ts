// MOV acceptance (plan MOV, MOV-Z1): a quiet project reaches the sponsor, who moves it on, on a real company (sandbox stage,
// empty template) with the AI, Teams, Jira and Microsoft 365 off (D4).
//
// The story, in one test, over five running projects that the lead and the sponsor already accepted:
//  1. the weekly update: the lead sends it from the draft in the UI, and the sponsor and the raiser get it, the lead does not;
//  2. a lead who left: the leaver path (deactivateUser) vacates two projects; the page shows "No lead"; the sponsor names a new
//     lead in the UI. The project without a sponsor stays vacant and, on the fifth working day, reaches the desk's seat above;
//  3. the clock runs on later working days (runClockOnce(now)): a step past its day reminds its owner, the lead two working
//     days after; five quiet working days remind the lead; three later the project is on the sponsor's /inbox as "stalled", and
//     the sponsor sets a new done-by date in the UI, which ends it;
//  4. a project the lead paused in the UI gets no quiet reminder over the same days; an early resume starts the count again;
//  5. the server refuses a new lead who is inactive or belongs to another company; the seat above names one that is fine;
//  6. a sandbox sends no mail: every outside row is skipped, to the right person, and every in-app row is sent.
//
// Set up in the database where the UI is not the point: the org, the raised ideas, the running projects (their events carry the
// day they are written on) and the planner and clock passes. Own company, made straight in the database and deleted at the end,
// like set.spec.ts and loop.spec.ts. Run on any weekday: every day below is a working-day number counted from today.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { DEFAULT_CALENDAR } from "../../../src/features/clock";
import { dateOfWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { reduce } from "../../../src/features/cases/reducer";
import { getDb } from "../../../src/lib/db/client";
import { deactivateUser } from "../../../src/lib/db/directory";
import { appendEventRow, loadLog } from "../../../src/lib/db/events";
import { loadSeed } from "../../../src/lib/db/companies";
import { loadSeats } from "../../../src/lib/db/holders";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { ensureMovSinceDay } from "../../../src/lib/db/rules";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { prepareProjectAppend } from "../../../src/server/actions/append/project";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `mov-${STAMP}`;
const FOREIGN_SLUG = `${SLUG}-x`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood"; // member: raised every idea, on no team
const DESK = "Quentin Qualityfield"; // leader on the Quality lead seat: the route's owner, says yes
const LEAD = "Lena Linefield"; // leader on the Line lead seat (the route's deputy): leads three projects
const ABOVE = "Paula Plantbridge"; // leader (no manager) on the Plant manager seat: above the desk
const MEMBER = "Max Memberfield"; // member on an Operator seat: owns a step that falls late
const SPONSOR = "Sven Sponsorfield"; // leader on an Operator seat: the accepted sponsor
const LEAVER = "Lou Leaverfield"; // member on an Operator seat: leads a project with a sponsor, then leaves
const LEAVER2 = "Lia Leaverfield"; // member on an Operator seat: leads a project without a sponsor, then leaves
const FOREIGN = "Frieda Foreign"; // a person of another company
const UNIT = "OPS";
const OWNER_ROLE = "Quality lead";
const LINE_ROLE = "Line lead";
const ABOVE_ROLE = "Plant manager";
const TEAM_ROLE = "Operator";

const STEP_TEXT = "Measure the crane queue";
const SPONSOR_WHY = "The crane is booked until the end of the month";
const PAUSE_WHY = "The rig is away for service";
const NEW_LEAD_WHY = "Lena knows the line";

const codes = new Map<string, string>();
let companyId = "";
let foreignId = "";
let routeKey = "r-mov";
let n = 0;
type Person = "raiser" | "desk" | "lead" | "above" | "member" | "sponsor" | "leaver" | "leaver2" | "foreign";
const id: Record<Person, string> = { raiser: "", desk: "", lead: "", above: "", member: "", sponsor: "", leaver: "", leaver2: "", foreign: "" };

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
const userId = async (name: string, of = companyId) => (await db().user.findFirstOrThrow({ where: { companyId: of, name }, select: { id: true } })).id;
const eventsOf = (type: string, targetId: string) => db().caseEvent.findMany({ where: { companyId, type, targetId }, orderBy: { seq: "asc" } });
const factsOf = async (projectId: string, kind: string) => (await eventsOf("clock.due", projectId)).filter((e) => (e.payload as { kind?: string }).kind === kind);
const noticesOf = (userIdOf: string, template: string, channel?: string) =>
  db().outboxMessage.findMany({ where: { companyId, recipientUserId: userIdOf, template, ...(channel ? { channel } : {}) }, orderBy: { createdAt: "asc" } });
const aboutProject = (rows: { subject: string; text: string }[], title: string) => rows.filter((r) => r.subject.includes(title) || r.text.includes(title));

/** Append an event the way the app would store it; returns its id (an invitation's answer names it). */
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>): Promise<string> {
  const eventId = `${SLUG}-e${n++}`;
  const r = await appendEventRow(companyId, { id: eventId, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
  return eventId;
}

type Started = { caseId: string; projectId: string; title: string };
/**
 * An idea of the raiser, said yes to by the desk, led by `lead`, with the team the options name, a goal, a baseline and the start:
 * a running project, written the way SET's flow writes it. `step` adds one open step owned by the member.
 */
async function runningProject(key: string, title: string, lead: { name: string; id: string }, opts: { sponsor?: boolean; step?: boolean } = {}): Promise<Started> {
  const caseId = `${SLUG}-case-${key}`;
  const projectId = `${SLUG}-p-${key}`;
  await append("case.raised", RAISER, id.raiser, caseId, { kind: "idea", title, body: "The setters wait for the crane at every changeover.", assignee: DESK, fromDept: UNIT, routeId: routeKey, visibility: "everyone" });
  await append("case.decided", DESK, id.desk, caseId, { answer: "yes", projectId, lead: lead.name, leadUserId: lead.id, title, draft: true });
  await append("project.lead.answered", lead.name, lead.id, projectId, { take: true });
  if (opts.sponsor) {
    const invite = await append("project.invited", lead.name, lead.id, projectId, { userId: id.sponsor, role: "sponsor" });
    await append("project.invite.answered", SPONSOR, id.sponsor, projectId, { userId: id.sponsor, inviteId: invite, take: true });
  }
  await append("project.goal", lead.name, lead.id, projectId, { goal: `${title}: halve the waiting`, doneWhen: "Three shifts in a row without waiting for the crane" });
  await append("project.baseline", lead.name, lead.id, projectId, { metric: "Waiting", unit: "min", value: 45, better: "down", source: "Stopwatch" });
  await append("project.started", lead.name, lead.id, projectId, {});
  if (opts.step) {
    // Due tomorrow: it falls late the working day after, which the clock is run on below.
    await append("project.step.added", lead.name, lead.id, projectId, { stepId: `${key}_step`, text: STEP_TEXT, owner: MEMBER, ownerUserId: id.member, dueDay: D + 1 });
  }
  return { caseId, projectId, title };
}

/** Run the clock on working day `day` and the planner until `rows` finds something: the app's own loops may hold a lease for a moment. */
async function settleAt<T>(day: number, rows: () => Promise<T[]>, message: string): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce(on(day));
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

/** The planner (and the clock at its real moment) until `rows` finds something: for notices that follow a UI action, not a clock day. */
async function settle<T>(rows: () => Promise<T[]>, message: string): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce();
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

/** The clock and the planner once on `day`, with nothing to wait for: the base of a "nothing was written" claim. */
async function passAt(day: number) {
  await runClockOnce(on(day));
  await runClockOnce(on(day)); // twice: nothing is written twice
  await dispatchOnce();
}

/** The reduced company, as the append action sees it: for the server's own refusal of a lead who cannot lead. */
async function appendContext(viewerId: string) {
  const company = await db().company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } });
  const seed = (await loadSeed(company.slug))!;
  const seats = await loadSeats(companyId);
  const full = { ...seed, seats };
  return { companyId, viewer: { userId: viewerId, role: "leader" }, state: reduce(full, await loadLog(companyId)), seed: full as never, locale: "en" as const };
}

test.describe("MOV acceptance: a project that keeps moving", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `MOV ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: ABOVE, role: "leader", dept: UNIT, email: emailOf(ABOVE, SLUG) },
        { name: MEMBER, role: "member", dept: UNIT, email: emailOf(MEMBER, SLUG) },
        { name: SPONSOR, role: "leader", dept: UNIT, email: emailOf(SPONSOR, SLUG) },
        { name: LEAVER, role: "member", dept: UNIT, email: emailOf(LEAVER, SLUG) },
        { name: LEAVER2, role: "member", dept: UNIT, email: emailOf(LEAVER2, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    await createTestCompany({ slug: FOREIGN_SLUG, name: `MOV foreign ${STAMP}`, template: "empty", stage: "sandbox", people: [{ name: FOREIGN, role: "member", dept: UNIT, email: emailOf(FOREIGN, FOREIGN_SLUG) }] });
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    foreignId = (await db().company.findUniqueOrThrow({ where: { slug: FOREIGN_SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER);
    id.desk = await userId(DESK);
    id.lead = await userId(LEAD);
    id.above = await userId(ABOVE);
    id.member = await userId(MEMBER);
    id.sponsor = await userId(SPONSOR);
    id.leaver = await userId(LEAVER);
    id.leaver2 = await userId(LEAVER2);
    id.foreign = await userId(FOREIGN, foreignId);

    // The structure: the Quality lead desk (the route's owner) and the Line lead (its deputy) report to the Plant manager, who is a
    // leader, not a manager; the others are operators. Nobody but the sponsor, the desk, the deputy and the seat above has a part.
    const unit = await addUnit(companyId, "mov-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string, reportsToId: string | null) => addRole(companyId, "mov-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
    const aboveRole = await role(ABOVE_ROLE, null);
    const ownerRole = await role(OWNER_ROLE, aboveRole);
    const lineRole = await role(LINE_ROLE, aboveRole);
    const teamRole = await role(TEAM_ROLE, lineRole);
    await addSeat(companyId, aboveRole, ABOVE, id.above);
    await addSeat(companyId, ownerRole, DESK, id.desk);
    await addSeat(companyId, lineRole, LEAD, id.lead);
    for (const [name, uid] of [[MEMBER, id.member], [SPONSOR, id.sponsor], [LEAVER, id.leaver], [LEAVER2, id.leaver2]] as const) await addSeat(companyId, teamRole, name, uid);
    routeKey = "r-mov";
    await saveRoute(companyId, "mov-z1", { key: routeKey, type: "Changeover", keywords: ["changeover", "crane"], ownerRoleId: ownerRole, deputyRoleId: lineRole, buddyRoleId: null, wait: "3 d" });

    // D4: nothing that calls out is on, and every notice of the loop and the reminders goes by mail (skipped on a sandbox).
    await db().companyConfig.update({ where: { companyId }, data: { notifications: true, noticeChannels: { loop: "mail", reminders: "mail" } } });
    const config = await db().companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db().integration.count({ where: { companyId, on: true } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db().connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db().company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);

    // D17: MOV counts from day 0 on this company, so what the test writes is old enough to count. The clock writes the row once.
    await ensureMovSinceDay(companyId, 0);

    // The planner starts at the newest event the first time it sees a company: one pass now, events after it.
    await dispatchOnce();
  });

  test.afterAll(async () => {
    if (process.env.MOV_KEEP) return;
    await deleteTestCompany(SLUG);
    await deleteTestCompany(FOREIGN_SLUG);
  });

  test("MOV acceptance: a quiet project reaches the sponsor, who moves it on", async ({ browser }) => {
    test.setTimeout(540_000);
    const lead = { name: LEAD, id: id.lead };

    // ── the running projects ────────────────────────────────────────────────────────────────────────────────────────
    const quiet = await runningProject("quiet", "Crane queue at the changeover", lead, { sponsor: true, step: true });
    const paused = await runningProject("paused", "Pallet labels at goods out", lead, { sponsor: true });
    const weekly = await runningProject("weekly", "Spare gauge for line 5", lead, { sponsor: true, step: true });
    const left = await runningProject("left", "Torque tool at station 4", { name: LEAVER, id: id.leaver }, { sponsor: true });
    const vacant = await runningProject("vacant", "Barcode scanner at goods in", { name: LEAVER2, id: id.leaver2 });

    // ── the weekly update ───────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead sends the weekly update from the draft; the sponsor and the raiser get it, the lead does not", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${weekly.projectId}`);
      const block = page.getByTestId("weekly-update");
      await expect(block).toBeVisible();
      const text = block.getByRole("textbox", { name: "The update" });
      await expect(text).not.toHaveValue(""); // the draft is built from the board, offline
      await block.getByRole("button", { name: "Send the update" }).click();
      await expect.poll(async () => (await eventsOf("project.update", weekly.projectId)).length).toBe(1);
      expect((await eventsOf("project.update", weekly.projectId))[0]).toMatchObject({ actorUserId: id.lead, payload: { week: expect.any(Number) } });
      await expect(page.getByTestId("latest-update")).toBeVisible();
      await page.context().close();

      for (const [who, name] of [[id.sponsor, SPONSOR], [id.raiser, RAISER]] as const) {
        const app = aboutProject(await settleAt(D, () => noticesOf(who, "loop.project.update", "inapp"), `the update reaches ${name} in the app`), weekly.title);
        expect(app, `an in-app notice of the update for ${name}`).toHaveLength(1);
        expect(app[0]).toMatchObject({ status: "sent", address: null });
        const mail = aboutProject(await noticesOf(who, "loop.project.update", "mail"), weekly.title);
        expect(mail, `an outside row of the update for ${name}`).toHaveLength(1);
        expect(mail[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(name, SLUG) });
      }
      expect(aboutProject(await noticesOf(id.lead, "loop.project.update"), weekly.title), "the writer is not told").toHaveLength(0);
    });

    // ── a lead who left ─────────────────────────────────────────────────────────────────────────────────────────────
    const leftAt = new Date();
    await test.step("two leaders leave the company: both projects show 'No lead'", async () => {
      await deactivateUser(companyId, id.leaver);
      await deactivateUser(companyId, id.leaver2);
      for (const p of [left, vacant]) {
        const vacated = await eventsOf("project.lead.vacated", p.projectId);
        expect(vacated, `${p.title} lost its lead`).toHaveLength(1);
        expect(vacated[0]).toMatchObject({ actor: "system:directory", source: "directory" });
      }
      const sponsor = await signIn(browser, SPONSOR);
      await sponsor.goto(`/${SLUG}/projects/${left.projectId}`);
      await expect(sponsor.getByTestId("no-lead")).toContainText("No lead");
      await sponsor.context().close();
    });

    await test.step("the sponsor names a new lead in the UI; the page shows them", async () => {
      const page = await signIn(browser, SPONSOR);
      await page.goto(`/${SLUG}/projects/${left.projectId}`);
      const form = page.getByTestId("no-lead").getByRole("form", { name: "Name as lead" });
      await form.getByLabel("New lead").selectOption(id.lead);
      await form.getByRole("textbox", { name: "Why (optional)" }).fill(NEW_LEAD_WHY);
      await form.getByRole("button", { name: "Name as lead" }).click();
      await expect.poll(async () => (await eventsOf("project.lead.changed", left.projectId)).length).toBe(1);
      expect((await eventsOf("project.lead.changed", left.projectId))[0]).toMatchObject({ actorUserId: id.sponsor, payload: { toUserId: id.lead } });
      await expect(page.getByTestId("no-lead")).toHaveCount(0);
      await expect(page.getByRole("main")).toContainText(LEAD);
      await page.context().close();
    });

    // ── a project the lead pauses ───────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead pauses a project in the UI, for ten working days", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${paused.projectId}`);
      await page.getByRole("button", { name: "Pause…" }).click();
      const form = page.getByRole("form", { name: "Pause the project" });
      await form.getByRole("spinbutton").fill("10");
      await form.getByRole("textbox", { name: "Why" }).fill(PAUSE_WHY);
      await form.getByRole("button", { name: "Pause the project" }).click();
      await expect.poll(async () => (await eventsOf("project.paused", paused.projectId)).length).toBe(1);
      expect((await eventsOf("project.paused", paused.projectId))[0]).toMatchObject({ actorUserId: id.lead, payload: { why: PAUSE_WHY } });
      await expect(page.getByTestId("paused-banner")).toContainText(PAUSE_WHY);
      await page.context().close();
    });

    // ── the clock, on later working days ────────────────────────────────────────────────────────────────────────────
    await test.step("a step past its day reminds its owner the working day after, and the lead two working days later", async () => {
      const first = aboutProject(await settleAt(D + 2, () => noticesOf(id.member, "reminder.late", "inapp"), "the owner is reminded of the late step"), STEP_TEXT);
      expect(first.length).toBeGreaterThan(0);
      expect(first[0]).toMatchObject({ status: "sent", address: null });
      const facts = await factsOf(quiet.projectId, "late");
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "late", stepId: "quiet_step", userId: id.member, dueDay: D + 1 } });
      const mail = aboutProject(await noticesOf(id.member, "reminder.late", "mail"), STEP_TEXT);
      expect(mail[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(MEMBER, SLUG) });
      expect(aboutProject(await noticesOf(id.lead, "reminder.late"), STEP_TEXT), "the lead is not told on the first day").toHaveLength(0);

      const second = await settleAt(D + 4, async () => aboutProject(await noticesOf(id.lead, "reminder.late", "inapp"), STEP_TEXT), "the lead is reminded two working days later");
      expect(second[0]).toMatchObject({ status: "sent" });
      expect((await factsOf(quiet.projectId, "late")).map((f) => (f.payload as { check?: number }).check)).toEqual([undefined, 2]);
    });

    await test.step("five quiet working days remind the lead; a paused project gets none, and the vacant project reaches the seat above", async () => {
      const reminders = aboutProject(await settleAt(D + 5, () => noticesOf(id.lead, "reminder.quiet", "inapp"), "the lead is reminded that the project is quiet"), quiet.title);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({ status: "sent", address: null });
      const mail = aboutProject(await noticesOf(id.lead, "reminder.quiet", "mail"), quiet.title);
      expect(mail[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(LEAD, SLUG) });
      const fact = (await factsOf(quiet.projectId, "quiet"))[0];
      expect(fact).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "quiet", dueDay: D + 5, userId: id.lead } });

      // The paused project: no fact, no reminder, over the same days.
      await passAt(D + 5);
      await passAt(D + 8);
      for (const kind of ["quiet", "stalled", "late", "blocked"]) expect(await factsOf(paused.projectId, kind), `a ${kind} fact for the paused project`).toHaveLength(0);
      expect(aboutProject(await noticesOf(id.lead, "reminder.quiet"), paused.title), "no quiet reminder for the paused project").toHaveLength(0);
      expect(aboutProject(await noticesOf(id.sponsor, "reminder.stalled"), paused.title), "no stalled reminder for the paused project").toHaveLength(0);

      // The project that lost its lead and had a sponsor was handed on above; the one without a sponsor reaches the seat above the desk.
      expect(await factsOf(left.projectId, "vacant"), "named in time: no vacancy fact").toHaveLength(0);
      const vacantFacts = await factsOf(vacant.projectId, "vacant");
      expect(vacantFacts).toHaveLength(1);
      const aboveSeat = (await db().orgRoleHolder.findFirstOrThrow({ where: { companyId, userId: id.above }, select: { id: true } })).id;
      expect(vacantFacts[0]).toMatchObject({ actor: "system:clock", payload: { kind: "vacant", dueDay: D + 5, toRoleHolderId: aboveSeat } });
      const note = aboutProject(await settle(() => noticesOf(id.above, "reminder.vacant", "inapp"), "the seat above is told that nobody leads the project"), vacant.title);
      expect(note[0]).toMatchObject({ status: "sent", address: null });
      expect(aboutProject(await noticesOf(id.above, "reminder.vacant", "mail"), vacant.title)[0]).toMatchObject({ status: "skipped", address: emailOf(ABOVE, SLUG) });
    });

    await test.step("three working days later the quiet project is on the sponsor's inbox as stalled", async () => {
      const stalled = aboutProject(await settleAt(D + 8, () => noticesOf(id.sponsor, "reminder.stalled", "inapp"), "the sponsor is told that the project stalled"), quiet.title);
      expect(stalled[0]).toMatchObject({ status: "sent", address: null });
      const fact = (await factsOf(quiet.projectId, "stalled"))[0];
      expect(fact).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "stalled", dueDay: D + 8, userId: id.sponsor } });
      expect(await factsOf(quiet.projectId, "quiet"), "the quiet fact is not written again").toHaveLength(1);

      const page = await signIn(browser, SPONSOR);
      await page.goto(`/${SLUG}/inbox`);
      const row = page.locator('[data-testid="inbox-row"][data-kind="stalled"]').filter({ hasText: quiet.title });
      await expect(row).toHaveCount(1);
      await expect(page.locator('[data-testid="inbox-row"][data-kind="stalled"]').filter({ hasText: paused.title }), "a paused project is not stalled").toHaveCount(0);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${quiet.projectId}$`));

      await test.step("the sponsor sets a new done-by date in the UI; the escalation ends", async () => {
        await expect(page.getByTestId("done-by-line")).toContainText("Done by");
        await page.getByTestId("done-by").getByRole("button", { name: "Move", exact: true }).click();
        const form = page.getByRole("form", { name: "Move the done-by date" });
        await form.getByRole("spinbutton").fill("10");
        await form.getByRole("textbox", { name: "Why" }).fill(SPONSOR_WHY);
        await form.getByRole("button", { name: "Move the date" }).click();
        await expect.poll(async () => (await eventsOf("project.doneby.moved", quiet.projectId)).length).toBe(1);
        const moved = (await eventsOf("project.doneby.moved", quiet.projectId))[0];
        expect(moved).toMatchObject({ actorUserId: id.sponsor, payload: { why: SPONSOR_WHY } });
        expect((moved.payload as { doneBy: number }).doneBy).toBeGreaterThan(moved.day);
        await page.goto(`/${SLUG}/inbox`);
        await expect(page.locator('[data-testid="inbox-row"][data-kind="stalled"]').filter({ hasText: quiet.title })).toHaveCount(0);
      });
      await page.context().close();

      // The lead and the sponsor are told of the new date, the one who moved it is not.
      const lead = aboutProject(await settle(() => noticesOf(id.lead, "loop.project.doneby.moved", "inapp"), "the lead is told of the new date"), quiet.title);
      expect(lead[0]).toMatchObject({ status: "sent" });
      expect(aboutProject(await noticesOf(id.sponsor, "loop.project.doneby.moved"), quiet.title), "the mover is not told").toHaveLength(0);
    });

    await test.step("the lead resumes the paused project early; its quiet count starts again from that day", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${paused.projectId}`);
      await expect(page.getByTestId("paused-banner")).toBeVisible();
      await page.getByRole("button", { name: "Resume now" }).click();
      await expect.poll(async () => (await eventsOf("project.resumed", paused.projectId)).length).toBe(1);
      await expect(page.getByTestId("paused-banner")).toHaveCount(0);
      await page.context().close();
      const resumed = (await eventsOf("project.resumed", paused.projectId))[0];

      // The pause would have run to D+10; it ended on the day of the resume, so the quiet day is five working days after that one.
      const facts = await settleAt(D + 12, () => factsOf(paused.projectId, "quiet"), "the resumed project is quiet again");
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ actor: "system:clock", payload: { kind: "quiet", dueDay: resumed.day + 5, userId: id.lead } });
      expect((facts[0].payload as { dueDay: number }).dueDay).toBeLessThan(D + 10);
    });

    // ── the server's own refusal, and the seat above naming a lead ──────────────────────────────────────────────────
    await test.step("the server refuses a new lead who is inactive, who belongs to another company or who does not exist", async () => {
      const ctx = await appendContext(id.above);
      const attempt = (toUserId: string) =>
        prepareProjectAppend({ ...ctx, type: "project.lead.changed", target: vacant.projectId, payload: { toUserId, to: "Somebody" }, seed: ctx.seed });
      for (const [why, target] of [["an inactive person", id.leaver2], ["a person of another company", id.foreign], ["an id nobody has", crypto.randomUUID()]] as const) {
        const verdict = await attempt(target);
        expect(verdict, why).toMatchObject({ ok: false });
      }
      expect(await attempt(id.member), "an active person of this company is accepted").toMatchObject({ ok: true });
      // And nobody changed anything by trying.
      expect(await eventsOf("project.lead.changed", vacant.projectId)).toHaveLength(0);
    });

    await test.step("the seat above finds the project in /inbox and names a new lead in the UI", async () => {
      const page = await signIn(browser, ABOVE);
      await page.goto(`/${SLUG}/inbox`);
      const row = page.locator('[data-testid="inbox-row"][data-kind="vacant"]').filter({ hasText: vacant.title });
      await expect(row).toHaveCount(1);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${vacant.projectId}$`));
      await expect(page.getByTestId("no-lead")).toContainText("No lead");
      const form = page.getByTestId("no-lead").getByRole("form", { name: "Name as lead" });
      await form.getByLabel("New lead").selectOption(id.member);
      await form.getByRole("button", { name: "Name as lead" }).click();
      await expect.poll(async () => (await eventsOf("project.lead.changed", vacant.projectId)).length).toBe(1);
      expect((await eventsOf("project.lead.changed", vacant.projectId))[0]).toMatchObject({ actorUserId: id.above, payload: { toUserId: id.member } });
      await expect(page.getByTestId("no-lead")).toHaveCount(0);
      await expect(page.getByRole("main")).toContainText(MEMBER);
      await page.context().close();
    });

    // ── the sandbox sent nothing, and nobody who left was told ──────────────────────────────────────────────────────
    await test.step("a sandbox sent no mail and no Teams message: every outside row is skipped, every in-app row is sent; nobody who left is told", async () => {
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.filter((r) => r.channel === "teams" || r.channel === "webhook"), "Teams and webhook rows").toHaveLength(0);
      const outside = rows.filter((r) => r.channel !== "inapp");
      expect(outside.length).toBeGreaterThan(0);
      expect(outside.every((r) => r.status === "skipped" && r.lastError === "sandbox"), "every outside row is skipped").toBe(true);
      expect(rows.filter((r) => r.channel === "inapp").every((r) => r.status === "sent" && r.sentAt !== null && r.address === null)).toBe(true);
      const toLeavers = rows.filter((r) => (r.recipientUserId === id.leaver || r.recipientUserId === id.leaver2) && r.createdAt > leftAt);
      expect(toLeavers, "notices for people who left after they left").toHaveLength(0);
      expect(await db().integration.count({ where: { companyId, on: true } }), "integrations stayed off").toBe(0);
    });
  });
});
