// UIP-E2: Collaboration, Progress and My reports have the house look: each passes the page sweep at desktop and
// phone width with a section card, and My reports lists a report with its reply.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";
import type { CaseEventType } from "../../../src/features/cases/events";
import { workdayOf } from "../../../src/features/clock/calendar";
import { getDb } from "../../../src/lib/db/client";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";

const SLUG = "uip-lists";
const PROJECT = "pj-uip-lists";
const CASE = "c-uip-lists";
const TITLE = "Offline job sheets for the service vans";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER]);
  const now = new Date();
  const today = workdayOf(now, await loadCalendar(company.companyId));
  const id = company.people[MANAGER.name].id;
  const ev = (type: CaseEventType, back: number, payload: Record<string, unknown>, target: string) =>
    ({ type, day: today - back, actor: MANAGER.name, actorUserId: id, target, payload });
  const events = [
    ev("case.raised", 20, { title: "Job sheets are typed twice", body: "The technicians type every job sheet twice.", assignee: "Desk", fromDept: "Management", kind: "problem" }, CASE),
    ev("case.decided", 18, { answer: "yes", projectId: PROJECT, lead: MANAGER.name, leadUserId: id, title: TITLE }, CASE),
    ev("project.baseline", 15, { metric: "double entry per technician", unit: "h / week", value: 3, better: "down", source: "time sheets, August" }, PROJECT),
    ev("project.step.added", 15, { stepId: "s1", text: "List the fields on the paper sheet", owner: MANAGER.name, ownerUserId: id }, PROJECT),
    ev("project.started", 14, {}, PROJECT),
  ];
  await getDb().caseEvent.createMany({
    data: events.map((e, k) => ({
      id: `${SLUG}-e${k}`, companyId: company.companyId, ts: new Date(now.getTime() - (today - e.day) * 86_400_000 * (7 / 5)), day: e.day, type: e.type,
      actor: e.actor, actorUserId: e.actorUserId, targetId: e.target, payload: e.payload as object, source: "app",
    })),
  });
  await rebuildProjections(company.companyId, now);
  // One report with a reply, so My reports has a row to look at.
  const ticket = await getDb().ticket.create({
    data: {
      companyId: company.companyId, number: 1, reporterId: id, reporterRole: "manager", kind: "bug", impact: "annoying",
      description: "The job sheet list does not scroll on the tablet.", expected: "It scrolls.", context: {}, status: "in_progress",
    },
  });
  await getDb().ticketReply.create({
    data: { companyId: company.companyId, ticketId: ticket.id, opsReplyId: `${SLUG}-r1`, body: "Thanks, we can see it and are on it.", status: "in_progress", createdAt: now },
  });
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP list pages", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/projects/collaboration`, `/${SLUG}/projects/progress`, `/${SLUG}/reports`], { marker: "section-card" });

  await test.step("My reports lists the report and its reply", async () => {
    await page.goto(`/${SLUG}/reports`);
    await expect(page.getByText("NU-1")).toBeVisible();
    await expect(page.getByText("Thanks, we can see it and are on it.")).toBeVisible();
  });

});
