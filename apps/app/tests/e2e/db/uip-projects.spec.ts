// UIP-P1: the Projects list and a project's tabs have the house look: every tab passes the page sweep at
// desktop and phone width, there is no Agent tab, and a step can still be added and taken off the board.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";
import type { CaseEventType } from "../../../src/features/cases/events";
import { workdayOf } from "../../../src/features/clock/calendar";
import { getDb } from "../../../src/lib/db/client";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";

const SLUG = "uip-projects";
const PROJECT = "pj-uip";
const CASE = "c-uip";
const TABS = ["overview", "board", "team", "results", "activity", "files", "agent"] as const; // agent: the manager sees the Agent tab (plan AGT, D15)
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };
const MEMBER = { name: "Milo Boardman", email: `milo@${SLUG}.test`, role: "member" as const };
const NEW_STEP = "Walk the line with the night shift";

let company: TestCompany;

type Ev = { type: CaseEventType; day: number; actor: string; actorUserId: string; target: string; payload: Record<string, unknown> };

/** The events of a running project with a baseline, steps in every column, a blocked one with its reason, and two people. */
function events(today: number, leadId: string, memberId: string): Ev[] {
  const d = (back: number) => today - back;
  const lead = (type: CaseEventType, back: number, payload: Record<string, unknown> = {}, target = PROJECT): Ev => ({ type, day: d(back), actor: MANAGER.name, actorUserId: leadId, target, payload });
  const member = (type: CaseEventType, back: number, payload: Record<string, unknown>): Ev => ({ type, day: d(back), actor: MEMBER.name, actorUserId: memberId, target: PROJECT, payload });
  return [
    lead("case.raised", 40, { title: "Job sheets are typed twice", body: "The technicians type every job sheet twice.", assignee: "Desk", fromDept: "Management", kind: "problem" }, CASE),
    lead("case.decided", 38, { answer: "yes", projectId: PROJECT, lead: MANAGER.name, leadUserId: leadId, title: "Offline job sheets for the service vans" }, CASE),
    lead("project.member", 37, { name: MEMBER.name, userId: memberId, on: true }),
    lead("project.baseline", 30, { metric: "double entry per technician", unit: "h / week", value: 3, better: "down", source: "time sheets, August" }),
    lead("project.step.added", 30, { stepId: "s1", text: "List the fields on the paper sheet", owner: MANAGER.name, ownerUserId: leadId }),
    lead("project.step.added", 30, { stepId: "s2", text: "Offline form on the tablets", owner: MEMBER.name, ownerUserId: memberId }),
    lead("project.step.added", 30, { stepId: "s3", text: "Sync the form when the van has signal", owner: MEMBER.name, ownerUserId: memberId }),
    lead("project.step.added", 29, { stepId: "s4", text: "Retire the paper sheet" }),
    lead("project.started", 28),
    lead("project.step.moved", 20, { stepId: "s1", to: "done" }),
    member("project.step.moved", 15, { stepId: "s2", to: "doing" }),
    member("project.step.moved", 6, { stepId: "s3", to: "blocked", why: "Waiting for the VPN profile" }),
    lead("project.commented", 3, { text: "The form works offline on the test tablet." }),
  ];
}

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER, MEMBER]);
  const db = getDb();
  const now = new Date();
  const today = workdayOf(now, await loadCalendar(company.companyId));
  const rows = events(today, company.people[MANAGER.name].id, company.people[MEMBER.name].id).map((e, k) => ({
    id: `${SLUG}-e${k}`, companyId: company.companyId, ts: new Date(now.getTime() - (today - e.day) * 86_400_000 * (7 / 5)), day: e.day, type: e.type,
    actor: e.actor, actorUserId: e.actorUserId, targetId: e.target, payload: e.payload as object, source: "app",
  }));
  await db.caseEvent.createMany({ data: rows });
  await rebuildProjections(company.companyId, now);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP project area", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  const base = `/${SLUG}/projects/${PROJECT}`;
  await sweepPages(page, [`/${SLUG}/projects`], { marker: "projects-tabs", title: false }); // the tab names the page
  await sweepPages(page, TABS.map((tab) => `${base}?tab=${tab}`), { marker: "page-header" });

  await test.step("the tabs are the Overview, Board, Team, Results, Activity and Files; no Agent tab", async () => {
    await page.goto(base);
    const tabs = page.getByRole("navigation", { name: "Project sections" });
    await expect(tabs.getByRole("link")).toHaveCount(TABS.length);
    await expect(tabs.getByRole("link", { name: /agent/i })).toHaveCount(0);
    for (const name of ["Overview", "Board", "Team", "Results"]) {
      await tabs.getByRole("link", { name: new RegExp("^" + name) }).click();
      await expect(tabs.getByRole("link", { name: new RegExp("^" + name) })).toHaveAttribute("aria-current", "page");
    }
  });

  await test.step("a step is added to the board and taken off again", async () => {
    await page.goto(`${base}?tab=board`);
    const todo = page.getByRole("group", { name: "To do" });
    await expect(todo.getByRole("article")).toHaveCount(1);
    await todo.getByRole("button", { name: "Add a step to To do" }).click();
    await page.getByRole("textbox", { name: "New step" }).fill(NEW_STEP);
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    await expect(todo.getByRole("article")).toHaveCount(2);
    const sheet = await openStep(page, NEW_STEP);
    await sheet.getByRole("button", { name: /Remove this step/ }).click();
    await sheet.getByRole("button", { name: /Yes, remove/ }).click();
    await expect(todo.getByRole("article")).toHaveCount(1);
  });
});

async function openStep(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("button", { name: "Open “" + text + "”" }).click();
  return page.getByRole("dialog", { name: text });
}
