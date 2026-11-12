// AGT acceptance (plan AGT, AGT-Z1): a suggestion is accepted and rides on the clock, on a real company (sandbox stage, empty template) with the
// brain on this stack (the recorded brain answers it, D20) and Teams, Jira and Microsoft 365 off (D4).
//
// The story, in one test, over one running project that the lead and the sponsor already accepted:
//  1. the lead switches the agent on in the Agent tab;
//  2. five quiet working days: the clock's one in-app reminder reaches the lead. The agent runs (in this process, the recorded brain): the lead's
//     Agent tab shows the Unblock and the Plan, the lead's inbox one suggestion row, and the lead has still exactly the one in-app row of that day;
//  3. the lead edits and accepts the Unblock: the step's owner gets one notice, with the edited text and "Drafted with AI". The agent's own events
//     move no escalation: three working days later the stalled fact and the sponsor's inbox item come on their day;
//  4. the lead accepts the Plan: the board has the new step. The next run proposes no second Unblock for the nudged step on the fact it rode on
//     (the nudge was that fact's reminder; only a newer fact can ask again);
//  5. what the review of 12 Nov asked for: a follow-up that cannot be written rolls the acceptance back; two acceptors at once have one winner;
//     a suggestion whose words were removed shows that and cannot be accepted; with the AI gate closed an open suggestion stays visible and only
//     the expiry runs, which dismisses it as expired.
//
// Set up in the database where the UI is not the point: the org, the raised idea, the running project and the clock, planner and agent passes. Own
// company, made straight in the database and deleted at the end, like mov.spec.ts. Run on any weekday: every day below is a working-day number
// counted from today. The recorded brain tests the path and the schema; it says nothing of the German plan quality or of the cost in production.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { followUpIdOf } from "../../../src/features/agent/accept";
import { AI_SYSTEM } from "../../../src/features/ai/settings";
import { DEFAULT_CALENDAR } from "../../../src/features/clock";
import { dateOfWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { getDb } from "../../../src/lib/db/client";
import { appendEventRow } from "../../../src/lib/db/events";
import { saveIntegration, setIntegrationOn } from "../../../src/lib/db/integrations";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { ensureMovSinceDay } from "../../../src/lib/db/rules";
import { runAgentForCompany } from "../../../src/server/agent/daily";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { recordedBrainFetch } from "../../helpers/recorded-brain";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `agt-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood"; // member: raised the idea, on no team
const DESK = "Quentin Qualityfield"; // leader on the Quality lead seat: the route's owner, says yes
const LEAD = "Lena Linefield"; // leader on the Line lead seat (the route's deputy): leads the project
const MEMBER = "Max Memberfield"; // member on an Operator seat: owns step s2
const SPONSOR = "Sven Sponsorfield"; // leader on an Operator seat: the accepted sponsor
const UNIT = "OPS";
const OWNER_ROLE = "Quality lead";
const LINE_ROLE = "Line lead";
const TEAM_ROLE = "Operator";

/** The project the recorded brain knows (services/brain/eval/recorded/agent.json, case `accept`): its steps are s1 to s3, as the recording has them. */
const TITLE = "AGT acceptance line 3 changeover";
const UNBLOCK_TITLE = "Order the second tool cart";
const PLAN_STEP = "Agree who stocks the cart before the trial";
const EDITED = "Please say today whether the cart is ordered - the trial on line 3 waits on it.";

const codes = new Map<string, string>();
let companyId = "";
let routeKey = "r-agt";
let n = 0;
type Person = "raiser" | "desk" | "lead" | "member" | "sponsor";
const id: Record<Person, string> = { raiser: "", desk: "", lead: "", member: "", sponsor: "" };
const CASE_ID = `${SLUG}-case`;
// An id as the app mints it for a project (newId("p"): a prefix and the time in base 36).
const PROJECT_ID = `p_${STAMP}`;

const D = workdayOf(new Date(), DEFAULT_CALENDAR);
/** A moment on working day `day`: what the clock and the agent are run with to be "later". */
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
const eventsOf = (type: string, targetId: string | null = PROJECT_ID) => db().caseEvent.findMany({ where: { companyId, type, ...(targetId ? { targetId } : {}) }, orderBy: { seq: "asc" } });
const factsOf = async (kind: string) => (await eventsOf("clock.due")).filter((e) => (e.payload as { kind?: string }).kind === kind);
const payloadOf = (e: { payload: unknown }) => e.payload as Record<string, unknown>;
const noticesOf = (who: string, template?: string, channel?: string) =>
  db().outboxMessage.findMany({ where: { companyId, recipientUserId: who, ...(template ? { template } : {}), ...(channel ? { channel } : {}) }, orderBy: { createdAt: "asc" } });
const company = () => db().company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, slug: true, stage: true, seedJson: true } });
const suggestionsOf = async (kind: string) => (await eventsOf("agent.suggested")).filter((e) => payloadOf(e).suggestionKind === kind);
/** The words of a suggestion, from AgentText by the id its event carries. */
const wordsOf = async (e: { payload: unknown }) => JSON.parse((await db().agentText.findFirstOrThrow({ where: { companyId, id: payloadOf(e).textId as string } })).text) as { title: string; step: { title: string } | null };

async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>): Promise<string> {
  const eventId = `${SLUG}-e${n++}`;
  const r = await appendEventRow(companyId, { id: eventId, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
  return eventId;
}

/** Run the clock on working day `day` and the planner until `rows` finds something. */
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

/** The planner (and the clock at its real moment) until `rows` finds something: for notices that follow a UI action. */
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

const brain = recordedBrainFetch("agent");
/** The agent run on working day `day` in this process, the way the daily loop runs it, with the recorded brain. */
const runAgent = async (day: number) => runAgentForCompany(await company(), on(day), { fetch: brain, force: true });

const agentTab = (page: Page) => page.goto(`/${SLUG}/projects/${PROJECT_ID}?tab=agent`);
const cards = (page: Page, kind?: string) => page.locator(`[data-testid="agent-card"]${kind ? `[data-kind="${kind}"]` : ""}`);

test.describe("AGT acceptance: the project agent", () => {
  const saved: Record<string, string | undefined> = {};

  test.beforeAll(async () => {
    // The brain on this stack: the run is made in this process, with the recorded brain behind `fetch`.
    for (const [k, v] of [["BRAIN_URL", "http://brain:8000"], ["BRAIN_API_KEY", "agt-acceptance"]] as const) { saved[k] = process.env[k]; process.env[k] = v; }
    const made = await createTestCompany({
      slug: SLUG, name: `AGT ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: MEMBER, role: "member", dept: UNIT, email: emailOf(MEMBER, SLUG) },
        { name: SPONSOR, role: "leader", dept: UNIT, email: emailOf(SPONSOR, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER);
    id.desk = await userId(DESK);
    id.lead = await userId(LEAD);
    id.member = await userId(MEMBER);
    id.sponsor = await userId(SPONSOR);

    const unit = await addUnit(companyId, "agt-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string, reportsToId: string | null) => addRole(companyId, "agt-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
    const ownerRole = await role(OWNER_ROLE, null);
    const lineRole = await role(LINE_ROLE, ownerRole);
    const teamRole = await role(TEAM_ROLE, lineRole);
    await addSeat(companyId, ownerRole, DESK, id.desk);
    await addSeat(companyId, lineRole, LEAD, id.lead);
    for (const [name, uid] of [[MEMBER, id.member], [SPONSOR, id.sponsor]] as const) await addSeat(companyId, teamRole, name, uid);
    routeKey = "r-agt";
    await saveRoute(companyId, "agt-z1", { key: routeKey, type: "Changeover", keywords: ["changeover", "cart"], ownerRoleId: ownerRole, deputyRoleId: lineRole, buddyRoleId: null, wait: "3 d" });

    // D4: nothing that calls out is on, except the brain on this stack that the agent needs (a model on this stack, no data leaves it).
    await db().companyConfig.update({ where: { companyId }, data: { notifications: true, noticeChannels: { loop: "mail", reminders: "mail" } } });
    await saveIntegration({ companyId, system: AI_SYSTEM, settings: { choice: "local", region: "eu-central-1", model: "", endpoint: null, deployment: null }, updatedBy: null });
    await setIntegrationOn(companyId, AI_SYSTEM, true, null);
    const config = await db().companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db().integration.count({ where: { companyId, on: true, system: { not: AI_SYSTEM } } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db().connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db().company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);
    await ensureMovSinceDay(companyId, 0); // MOV counts from day 0 here, so what the test writes is old enough to count
    await dispatchOnce(); // the planner starts at the newest event the first time it sees a company
  });

  test.afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    if (process.env.AGT_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("AGT acceptance: a suggestion is accepted and rides on the clock", async ({ browser }) => {
    test.setTimeout(600_000);

    // ── the running project: lead, sponsor who accepted, a member who owns s2, a raiser; nothing happens on it after the start ─────────────
    await append("case.raised", RAISER, id.raiser, CASE_ID, { kind: "idea", title: TITLE, body: "The setters wait for the second tool cart at every changeover.", assignee: DESK, fromDept: UNIT, routeId: routeKey, visibility: "everyone" });
    await append("case.decided", DESK, id.desk, CASE_ID, { answer: "yes", projectId: PROJECT_ID, lead: LEAD, leadUserId: id.lead, title: TITLE, draft: true });
    await append("project.lead.answered", LEAD, id.lead, PROJECT_ID, { take: true });
    const invite = await append("project.invited", LEAD, id.lead, PROJECT_ID, { userId: id.sponsor, role: "sponsor" });
    await append("project.invite.answered", SPONSOR, id.sponsor, PROJECT_ID, { userId: id.sponsor, inviteId: invite, take: true });
    await append("project.goal", LEAD, id.lead, PROJECT_ID, { goal: "Changeover on line 3 under twenty minutes", doneWhen: "Three shifts in a row under the target" });
    await append("project.baseline", LEAD, id.lead, PROJECT_ID, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" });
    await append("project.started", LEAD, id.lead, PROJECT_ID, {});
    await append("project.step.added", LEAD, id.lead, PROJECT_ID, { stepId: "s1", text: "Measure today's changeover on line 3", owner: LEAD, ownerUserId: id.lead });
    await append("project.step.added", LEAD, id.lead, PROJECT_ID, { stepId: "s2", text: UNBLOCK_TITLE, owner: MEMBER, ownerUserId: id.member });
    await append("project.step.added", LEAD, id.lead, PROJECT_ID, { stepId: "s3", text: "Trial the cart for one week" });
    await dispatchOnce();

    // ── the lead switches the agent on ──────────────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead switches the agent on in the Agent tab; the raiser and the member have no such tab", async () => {
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      await expect(lead.getByTestId("agent-tab")).toBeVisible();
      await expect(lead.getByText("The agent is off for this project.")).toBeVisible();
      await lead.getByRole("button", { name: "Switch the agent on for this project" }).click();
      await expect.poll(async () => (await eventsOf("agent.switched")).length).toBe(1);
      expect((await eventsOf("agent.switched"))[0]).toMatchObject({ actorUserId: id.lead, payload: { on: true } });
      await expect(lead.getByRole("button", { name: "Switch the agent off for this project" })).toBeVisible();
      await lead.context().close();

      for (const name of [MEMBER, RAISER]) {
        const page = await signIn(browser, name);
        await agentTab(page);
        await expect(page.getByTestId("agent-tab"), `no Agent tab for ${name}`).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Agent", exact: true })).toHaveCount(0);
        await page.context().close();
      }
    });

    // ── five quiet working days: the clock's reminder; then the agent ───────────────────────────────────────────────────────────────────────
    let before = 0;
    await test.step("five quiet working days give the lead the clock's one in-app reminder; the agent switch is no activity", async () => {
      const reminders = (await settleAt(D + 5, () => noticesOf(id.lead, "reminder.quiet", "inapp"), "the lead is reminded that the project is quiet")).filter((r) => r.subject.includes(TITLE) || r.text.includes(TITLE));
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({ status: "sent", address: null });
      const quiet = await factsOf("quiet");
      expect(quiet).toHaveLength(1);
      expect(quiet[0]).toMatchObject({ actor: "system:clock", payload: { kind: "quiet", dueDay: D + 5, userId: id.lead } });
      before = (await noticesOf(id.lead, undefined, "inapp")).length;
    });

    await test.step("the agent runs: an Unblock riding on the quiet fact and a Plan, no notice of their own", async () => {
      const first = await runAgent(D + 5);
      expect(first, first.refused ?? "the run").toMatchObject({ projectsRun: 1, suggestionsMade: 2 });
      const [unblock] = await suggestionsOf("unblock");
      const [plan] = await suggestionsOf("plan");
      expect(unblock, "an Unblock").toBeTruthy();
      expect(plan, "a Plan").toBeTruthy();
      const quiet = (await factsOf("quiet"))[0];
      expect(unblock).toMatchObject({ actor: "system:agent", payload: { ridesOn: quiet.id, stepId: "s2" } });
      expect((await wordsOf(unblock)).title).toBe(UNBLOCK_TITLE);
      expect((await wordsOf(plan)).step?.title).toBe(PLAN_STEP);
      // Again that day and the next: nothing is written twice and the unchanged project is not asked again.
      await runAgent(D + 5);
      await runAgent(D + 6);
      expect(await suggestionsOf("unblock")).toHaveLength(1);
      expect(await suggestionsOf("plan")).toHaveLength(1);
      expect(brain.calls, "one call for the project").toHaveLength(1);

      // No notice of the agent's own (D12, D18): the lead has exactly the rows of before, the clock's one among them.
      await runClockOnce(on(D + 5));
      await dispatchOnce();
      expect((await noticesOf(id.lead, undefined, "inapp")).length, "the lead's in-app rows").toBe(before);
      expect((await noticesOf(id.lead, "reminder.quiet", "inapp")).filter((r) => r.subject.includes(TITLE) || r.text.includes(TITLE))).toHaveLength(1);
      const all = await db().outboxMessage.findMany({ where: { companyId } });
      expect(all.filter((r) => /agent/i.test(r.template) || r.key.includes(unblock.id) || r.key.includes(plan.id)), "no outbox row for a suggestion").toHaveLength(0);
    });

    await test.step("the lead's Agent tab shows the Unblock with its fact and the Plan, labelled AI; the inbox has one suggestion row", async () => {
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      await expect(cards(lead)).toHaveCount(2);
      const unblock = cards(lead, "unblock");
      await expect(unblock).toContainText(UNBLOCK_TITLE);
      await expect(unblock).toContainText("Rides on the reminder “quiet”");
      await expect(unblock).toContainText("Drafted with AI");
      await expect(cards(lead, "plan")).toContainText("Add a step to agree who stocks the cart");
      await expect(cards(lead, "plan")).toContainText("Drafted with AI");
      await lead.goto(`/${SLUG}/inbox`);
      const row = lead.locator('[data-testid="inbox-row"][data-kind="suggestion"]').filter({ hasText: TITLE });
      await expect(row).toHaveCount(1);
      await expect(lead.locator('[data-testid="inbox-row"][data-kind="suggestion"]')).toHaveCount(1);
      await row.click();
      await expect(lead).toHaveURL(new RegExp(`/projects/${PROJECT_ID}\\?tab=agent$`));
      await lead.context().close();
      // The sponsor, a manager's role aside, is asked nothing about it: it is the lead's row.
      const sponsor = await signIn(browser, SPONSOR);
      await sponsor.goto(`/${SLUG}/inbox`);
      await expect(sponsor.locator('[data-testid="inbox-row"][data-kind="suggestion"]')).toHaveCount(0);
      await sponsor.context().close();
    });

    // ── the lead edits and accepts the Unblock ──────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead edits and accepts the Unblock: the step's owner gets one notice with the edited text and 'Drafted with AI'", async () => {
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      const card = cards(lead, "unblock");
      await card.getByRole("button", { name: "Edit" }).click();
      await card.getByRole("textbox", { name: "Your words" }).fill(EDITED);
      await card.getByRole("button", { name: "Accept and send" }).click();
      await expect.poll(async () => (await eventsOf("agent.accepted")).length).toBe(1);
      const accepted = (await eventsOf("agent.accepted"))[0];
      expect(accepted).toMatchObject({ actorUserId: id.lead, payload: { suggestionKind: "unblock", edited: true, text: EDITED, toUserIds: [id.member], stepId: "s2" } });
      await expect(cards(lead, "unblock")).toHaveCount(0);
      await expect(lead.getByTestId("agent-past").first()).toContainText("the nudge about");
      await lead.context().close();

      const notes = await settle(() => noticesOf(id.member, "loop.agent.accepted", "inapp"), "the step's owner is told");
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ status: "sent", address: null });
      expect(notes[0].subject).toContain(UNBLOCK_TITLE);
      expect(notes[0].text).toContain(EDITED);
      expect(notes[0].text).toContain(`Drafted with AI, sent by ${LEAD}`);
      const mail = await noticesOf(id.member, "loop.agent.accepted", "mail");
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(MEMBER, SLUG) });
      expect(await noticesOf(id.lead, "loop.agent.accepted"), "the sender is not told").toHaveLength(0);
      expect(await noticesOf(id.sponsor, "loop.agent.accepted"), "nobody else is told").toHaveLength(0);
    });

    // ── three more working days: the escalation is the clock's, unmoved by the agent ────────────────────────────────────────────────────────
    await test.step("three working days later the stalled fact and the sponsor's inbox item come on their day, as without the agent", async () => {
      const stalled = (await settleAt(D + 8, () => noticesOf(id.sponsor, "reminder.stalled", "inapp"), "the sponsor is told that the project stalled")).filter((r) => r.subject.includes(TITLE) || r.text.includes(TITLE));
      expect(stalled[0]).toMatchObject({ status: "sent", address: null });
      const facts = await factsOf("stalled");
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ actor: "system:clock", payload: { kind: "stalled", dueDay: D + 8, userId: id.sponsor } });
      expect(await factsOf("quiet"), "the quiet fact is not written again").toHaveLength(1);
      const sponsor = await signIn(browser, SPONSOR);
      await sponsor.goto(`/${SLUG}/inbox`);
      await expect(sponsor.locator('[data-testid="inbox-row"][data-kind="stalled"]').filter({ hasText: TITLE })).toHaveCount(1);
      await sponsor.context().close();
    });

    // ── the Plan ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead accepts the Plan: the board has the new step", async () => {
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      await cards(lead, "plan").getByRole("button", { name: "Accept", exact: true }).click();
      await expect.poll(async () => (await eventsOf("project.step.added")).length).toBe(4);
      const added = (await eventsOf("project.step.added")).at(-1)!;
      expect(added).toMatchObject({ actorUserId: id.lead, payload: { text: PLAN_STEP, aiDrafted: true } });
      const accepted = (await eventsOf("agent.accepted")).at(-1)!;
      expect(accepted).toMatchObject({ payload: { suggestionKind: "plan", followUpId: added.id } });
      await lead.goto(`/${SLUG}/projects/${PROJECT_ID}?tab=board`);
      await expect(lead.getByText(PLAN_STEP)).toBeVisible();
      await lead.context().close();
    });

    await test.step("the next run proposes no second Unblock for the nudged step on the fact it rode on", async () => {
      const quietId = (await factsOf("quiet"))[0].id;
      const result = await runAgent(D + 9);
      expect(result, "the changed project is asked").toMatchObject({ projectsRun: 1 });
      const rides = (await suggestionsOf("unblock")).map((e) => payloadOf(e).ridesOn);
      expect(rides.filter((r) => r === quietId), "no second Unblock on the quiet fact").toHaveLength(1);
    });

    // ── what the review of 12 Nov asked for ─────────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("a follow-up that cannot be written rolls the acceptance back: no acceptance, no step, the suggestion stays open", async () => {
      const [, plan] = await suggestionsOf("plan");
      expect(plan, "the run after the accepted Plan offers another one").toBeTruthy();
      // A row already holds the id the step's event is going to use: the write fails inside the transaction.
      await appendEventRow(companyId, { id: followUpIdOf(plan.id), day: 0, type: "case.commented", actor: RAISER, targetId: CASE_ID, payload: { text: "occupied" } } as never, { actorUserId: id.raiser });
      const accepts = (await eventsOf("agent.accepted")).length;
      const steps = (await eventsOf("project.step.added")).length;
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      await cards(lead, "plan").getByRole("button", { name: "Accept", exact: true }).click();
      await lead.waitForTimeout(2_000); // the server answered with its refusal by now: what was written is checked below
      expect((await eventsOf("agent.accepted")).length, "no acceptance").toBe(accepts);
      expect((await eventsOf("project.step.added")).length, "no step").toBe(steps);
      expect(await db().agentText.count({ where: { companyId, text: { contains: "occupied" } } })).toBe(0);
      await expect(cards(lead, "plan")).toHaveCount(1); // still open
      await lead.context().close();
      await db().caseEvent.deleteMany({ where: { companyId, id: followUpIdOf(plan.id) } });
    });

    await test.step("two acceptors at once have one winner: one acceptance, one step", async () => {
      const [, plan] = await suggestionsOf("plan");
      const accepts = (await eventsOf("agent.accepted")).length;
      const steps = (await eventsOf("project.step.added")).length;
      const [a, b] = [await signIn(browser, LEAD), await signIn(browser, LEAD)];
      await Promise.all([agentTab(a), agentTab(b)]);
      await Promise.all([cards(a, "plan").getByRole("button", { name: "Accept", exact: true }).click(), cards(b, "plan").getByRole("button", { name: "Accept", exact: true }).click()]);
      await expect.poll(async () => (await eventsOf("agent.accepted")).length, { timeout: 15_000 }).toBe(accepts + 1);
      await expect.poll(async () => (await eventsOf("project.step.added")).length).toBe(steps + 1);
      await new Promise((r) => setTimeout(r, 1_500));
      expect((await eventsOf("agent.accepted")).filter((e) => payloadOf(e).suggestionId === plan.id)).toHaveLength(1);
      expect((await eventsOf("project.step.added")).filter((e) => e.id === followUpIdOf(plan.id))).toHaveLength(1);
      await a.context().close();
      await b.context().close();
    });

    await test.step("words removed by the retention run show that and cannot be accepted; with the gate closed the suggestion stays and only the expiry runs", async () => {
      await runAgent(D + 10); // the accepted step changed the project: a fresh Plan
      const open = (await suggestionsOf("plan")).at(-1)!;
      expect(payloadOf(open).suggestionKind).toBe("plan");
      const textId = payloadOf(open).textId as string;
      await db().agentText.deleteMany({ where: { companyId, id: textId } });
      const lead = await signIn(browser, LEAD);
      await agentTab(lead);
      const card = cards(lead, "plan").last();
      await expect(card).toContainText("Removed after the retention period");
      await expect(card.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Dismiss" })).toBeVisible();

      // The AI gate closes: nothing new is asked, the open suggestion is still there; later the expiry (no model) dismisses it.
      await setIntegrationOn(companyId, AI_SYSTEM, false, null);
      const calls = brain.calls.length;
      const closed = await runAgent(D + 11);
      expect(closed.refused, "a closed gate says why").toBeTruthy();
      expect(brain.calls.length, "no call with the gate closed").toBe(calls);
      await lead.reload();
      await expect(cards(lead, "plan").last()).toContainText("Removed after the retention period");
      const gone = await runAgent(D + 15);
      expect(gone.expired).toBeGreaterThan(0);
      const expired = (await eventsOf("agent.dismissed")).filter((e) => payloadOf(e).suggestionId === open.id);
      expect(expired).toHaveLength(1);
      expect(expired[0]).toMatchObject({ actor: "system:agent", actorUserId: null, payload: { why: "expired" } });
      await lead.reload();
      await expect(cards(lead)).toHaveCount(0);
      await expect(lead.getByText("No suggestions today")).toBeVisible();
      await expect(lead.getByText("Expired: nobody answered in time").first()).toBeVisible();
      await lead.context().close();
    });

    // ── a sandbox sends nothing; the agent sent nothing but the one nudge ───────────────────────────────────────────────────────────────────
    await test.step("a sandbox sent no mail and no Teams message; the only agent notice is the accepted nudge; the agent moved no clock fact", async () => {
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.filter((r) => r.channel === "teams" || r.channel === "webhook"), "Teams and webhook rows").toHaveLength(0);
      const outside = rows.filter((r) => r.channel !== "inapp");
      expect(outside.length).toBeGreaterThan(0);
      expect(outside.every((r) => r.status === "skipped" && r.lastError === "sandbox"), "every outside row is skipped").toBe(true);
      expect(rows.filter((r) => /agent/i.test(r.template)).map((r) => r.template).every((t) => t === "loop.agent.accepted")).toBe(true);
      const agentFacts = await db().caseEvent.count({ where: { companyId, type: "clock.due", actor: "system:agent" } });
      expect(agentFacts, "the agent writes no clock fact").toBe(0);
      expect(await factsOf("stalled"), "the escalation date is the clock's").toHaveLength(1);
      expect(await db().integration.count({ where: { companyId, on: true, system: { not: AI_SYSTEM } } }), "integrations stayed off").toBe(0);
    });
  });
});
