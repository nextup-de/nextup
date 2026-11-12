// GAT-R2 (B2): the settle operation against a real Postgres (plan GAT, D22, D32): an approval answer and the decision it leads to commit together under the
// case's lock, once per request. Concurrent answers go through Promise.all; the answers are written by settleApproval, the runs by the events a decider writes.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { translate } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow } from "@/lib/db/events";
import { company } from "./clk-company";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { answerApprovalAction, settleApproval } = await import("@/server/actions/approvals");
type Input = Parameters<typeof settleApproval>[2];
type Result = Awaited<ReturnType<typeof settleApproval>>;

const SLUG = "gat-settle";
const db = getDb();
const STALE = translate("en", "approvals.permStaleStep");
const REASON = "Not in this year's budget, please ask again next year";
let box: { id: string };
type Person = { userId: string; name: string };
let who: { raiser: Person; decider: Person; fin: Person; fin2: Person; boss: Person; stranger: Person };
let roles: { owner: string; fin: string; boss: string };
let routeId: string;
let ownerSeat: string;

const actorOf = (p: Person) => ({ userId: p.userId, role: "leader" as const, name: p.name });
const send = (id: string, type: string, target: string, payload: Record<string, unknown>, by: Person) =>
  appendEventRow(box.id, { id, day: 0, type, actor: by.name, targetId: target, payload } as never, { actorUserId: by.userId });
const rows = (target: string, type?: string) => db.caseEvent.findMany({ where: { companyId: box.id, targetId: target, ...(type ? { type } : {}) }, orderBy: { seq: "asc" } });
const decisions = (caseId: string) => rows(caseId, "case.decided");

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company(SLUG, "sandbox");
  const row = await db.company.findUniqueOrThrow({ where: { id: box.id } });
  const seed = await companySeed({ id: row.id, seedJson: row.seedJson, stage: row.stage });
  const route = seed.routes.find((r) => r.ownerSeatId && r.ownerRoleId && seed.seats.some((s) => s.id === r.ownerSeatId && s.userId))!;
  const holder = (roleId: string | undefined | null) => seed.seats.find((s) => s.roleId === roleId && s.userId !== null)!;
  const others = seed.roles!.filter((r) => r.id !== route.ownerRoleId && seed.seats.some((s) => s.roleId === r.id && s.userId !== null));
  const [finRole, bossRole] = others;
  const person = async (seatId: string): Promise<Person> => {
    const seat = seed.seats.find((s) => s.id === seatId)!;
    return { userId: seat.userId!, name: (await db.user.findFirstOrThrow({ where: { companyId: box.id, id: seat.userId! }, select: { name: true } })).name };
  };
  // A second holder of the finance role: two approvers who can answer the same step at the same moment.
  const second = await db.user.create({ data: { companyId: box.id, name: "Second Approver", email: "second@gat-settle.example", role: "leader" } });
  await db.orgRoleHolder.create({ data: { companyId: box.id, roleId: finRole.id, name: "Second Approver", userId: second.id, sort: 99 } });
  const stranger = await db.user.create({ data: { companyId: box.id, name: "Stranger", email: "stranger@gat-settle.example", role: "member" } });
  roles = { owner: route.ownerRoleId!, fin: finRole.id, boss: bossRole.id };
  routeId = route.id;
  ownerSeat = route.ownerSeatId!;
  who = {
    raiser: { userId: (await db.user.findFirstOrThrow({ where: { companyId: box.id, name: "J. Schmidt" } })).id, name: "J. Schmidt" },
    decider: await person(holder(route.ownerRoleId).id), fin: await person(holder(finRole.id).id), fin2: { userId: second.id, name: second.name },
    boss: await person(holder(bossRole.id).id), stranger: { userId: stranger.id, name: stranger.name },
  };
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

/**
 * A case on the owner's desk with a run waiting: the raise, and the 'yes, if approved' the decider wrote, with the steps and the due day the server stamps
 * (the append path is checked in tests/unit/gat/append.test.ts). `steps`: the approver roles in order; `projectId`: an existing project makes it a join.
 */
async function provisional(name: string, steps: string[] = [roles.fin], opts: { projectId?: string; supplement?: boolean; caseId?: string } = {}) {
  const caseId = opts.caseId ?? `${name}-case`;
  if (!opts.caseId) await send(`${name}-raised`, "case.raised", caseId, { title: `Case ${name}`, routeId, assigneeRoleHolderId: ownerSeat }, who.raiser);
  const runId = `${name}-prov`;
  const projectId = opts.supplement ? undefined : opts.projectId ?? `${name}-p`;
  await send(runId, "case.provisional", caseId, {
    approvals: steps.map((roleId) => ({ kind: "role", roleId })), stepDueDay: 1_000_000, costEur: 9000, decidingRoleId: roles.owner,
    ...(opts.supplement ? { supplement: true } : { draft: true, projectId, lead: who.decider.name, leadUserId: who.decider.userId, title: `Case ${name}` }),
  }, who.decider);
  return { caseId, runId, step: (i: number) => `${runId}:${i}`, projectId: projectId ?? "" };
}
type Run = Awaited<ReturnType<typeof provisional>>;

let n = 0;
const input = (run: Run, over: Partial<Input> = {}): Input => ({ runId: run.runId, stepId: run.step(0), dueRev: 0, approvalAnswer: "yes", requestId: `req-${n++}`, ...over });
const settle = (run: Run, by: Person, over: Partial<Input> = {}, hooks?: Parameters<typeof settleApproval>[4]) => settleApproval(box.id, run.caseId, input(run, over), actorOf(by), hooks);
const NO: Partial<Input> = { approvalAnswer: "no", category: "no-budget", reason: REASON };
const BACK: Partial<Input> = { approvalAnswer: "back", reason: "The quote is missing" };
const okCount = (rs: Result[]) => rs.filter((r) => r.ok).length;
const staleCount = (rs: Result[]) => rs.filter((r) => !r.ok && r.error === STALE).length;
const decidedBy = async (caseId: string) => (await decisions(caseId)).filter((r) => r.actor === "system:approvals");

it("GAT settle settles two concurrent yes answers once", async () => {
  const run = await provisional("two-yes");
  const results = await Promise.all([settle(run, who.fin), settle(run, who.fin2)]);
  // One answer wins; the other reads it under the lock and finds the step answered: stale.
  expect(okCount(results)).toBe(1);
  expect(staleCount(results)).toBe(1);
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
  const decided = await decidedBy(run.caseId);
  expect(decided).toHaveLength(1);
  expect(decided[0]).toMatchObject({ actor: "system:approvals", actorUserId: null, source: "approvals", idemKey: `approvals:${run.runId}` });
  expect(decided[0].payload).toMatchObject({ answer: "yes", projectId: run.projectId });
  expect(results.find((r) => r.ok)).toMatchObject({ ok: true, duplicate: false, answer: "yes", settled: "yes" });
});

it("GAT settle settles only one of a concurrent yes and no", async () => {
  const run = await provisional("yes-no");
  const results = await Promise.all([settle(run, who.fin), settle(run, who.fin2, NO)]);
  expect(okCount(results)).toBe(1);
  expect(staleCount(results)).toBe(1);
  const decided = await decidedBy(run.caseId);
  expect(decided).toHaveLength(1); // never both a yes and a no
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
  const winner = results.find((r) => r.ok);
  expect(winner).toMatchObject({ ok: true, settled: (decided[0].payload as { answer: string }).answer });
  // A no stops the new draft with it; a yes leaves the project alone.
  expect((await rows(run.projectId, "project.stopped")).length).toBe((decided[0].payload as { answer: string }).answer === "no" ? 1 : 0);
});

it("GAT settle commits one of a concurrent back and yes", async () => {
  const run = await provisional("back-yes");
  const results = await Promise.all([settle(run, who.fin, BACK), settle(run, who.fin2)]);
  expect(okCount(results)).toBe(1);
  expect(staleCount(results)).toBe(1); // after a back the yes' form is stale; after the yes the run is done
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
  const back = results.find((r) => r.ok && r.answer === "back");
  expect((await decidedBy(run.caseId)).length).toBe(back ? 0 : 1);
});

it("GAT settle refuses a form opened before a back", async () => {
  const run = await provisional("stale-form");
  expect(await settle(run, who.fin, BACK)).toMatchObject({ ok: true, answer: "back", settled: null });
  // The second approver opened the form at revision 0; the step is at 1 now.
  expect(await settle(run, who.fin2)).toEqual({ ok: false, error: STALE });
  expect(await settle(run, who.fin2, { stepId: run.step(7) })).toEqual({ ok: false, error: STALE });
  expect(await settle(run, who.fin2, { runId: "another-run" })).toEqual({ ok: false, error: STALE });
  expect(await decidedBy(run.caseId)).toEqual([]);
  // The current revision goes through; the due day of the step moved with the back.
  expect(await settle(run, who.fin2, { dueRev: 1 })).toMatchObject({ ok: true, settled: "yes" });
  const answers = await rows(run.caseId, "case.approval");
  expect(answers).toHaveLength(2);
  expect(answers[0].payload).toMatchObject({ approvalAnswer: "back", dueRev: 0, stepId: run.step(0) });
  expect((answers[0].payload as { nextStepDueDay: number }).nextStepDueDay).toBeGreaterThan(0);
  expect(answers[1].payload).toMatchObject({ approvalAnswer: "yes", dueRev: 1, nextStepDueDay: null });
});

it("GAT settle returns the same result for a retried request", async () => {
  const run = await provisional("retry");
  const request = input(run, { requestId: "retry-request-1" });
  const first = await settleApproval(box.id, run.caseId, request, actorOf(who.fin));
  const again = await settleApproval(box.id, run.caseId, request, actorOf(who.fin));
  expect(first).toEqual({ ok: true, duplicate: false, answer: "yes", settled: "yes" });
  expect(again).toEqual({ ok: true, duplicate: true, answer: "yes", settled: "yes" });
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
  expect(await decidedBy(run.caseId)).toHaveLength(1);
  // Through the page's action too: the same request id from the signed-in approver reads the same thing back.
  viewer = { userId: who.fin.userId, companyId: box.id, companySlug: SLUG, name: who.fin.name, handle: null, role: "leader", epoch: 0, issuedAt: 0 };
  expect(await answerApprovalAction(SLUG, run.caseId, request)).toEqual({ ok: true, duplicate: true, answer: "yes", settled: "yes" });
  expect(await answerApprovalAction(SLUG, run.caseId, { ...request, requestId: "bad id!" })).toMatchObject({ ok: false });
  viewer = null;
  expect(await answerApprovalAction(SLUG, run.caseId, request)).toMatchObject({ ok: false });
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
});

it("GAT settle returns a committed result after dueRev moved on", async () => {
  const run = await provisional("moved-on");
  const request = input(run, { ...BACK, requestId: "moved-on-request" });
  expect(await settleApproval(box.id, run.caseId, request, actorOf(who.fin))).toEqual({ ok: true, duplicate: false, answer: "back", settled: null });
  // The step is at revision 1 now: the same form at revision 0 is stale for a new request, and the committed answer for the old one.
  expect(await settle(run, who.fin, { ...BACK })).toEqual({ ok: false, error: STALE });
  expect(await settleApproval(box.id, run.caseId, request, actorOf(who.fin))).toEqual({ ok: true, duplicate: true, answer: "back", settled: null });
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
  // Someone who never answered gets the committed answer back for the id too: the lookup comes before every check.
  expect(await settleApproval(box.id, run.caseId, request, actorOf(who.stranger))).toMatchObject({ ok: true, duplicate: true });
});

it("GAT settle writes nothing when a failure follows the answer", async () => {
  const run = await provisional("rollback");
  await expect(settle(run, who.fin, {}, { afterAnswer: async () => { throw new Error("injected"); } })).rejects.toThrow("injected");
  expect(await rows(run.caseId, "case.approval")).toEqual([]);
  expect(await decidedBy(run.caseId)).toEqual([]);
  // The run is untouched: the same answer goes through afterwards, once.
  expect(await settle(run, who.fin)).toMatchObject({ ok: true, settled: "yes" });
  expect(await rows(run.caseId, "case.approval")).toHaveLength(1);
});

it("GAT settle stops a refused new draft once", async () => {
  const run = await provisional("refused-draft", [roles.fin, roles.boss]);
  expect(await settle(run, who.fin, NO)).toEqual({ ok: true, duplicate: false, answer: "no", settled: "no" });
  const decided = await decidedBy(run.caseId);
  expect(decided).toHaveLength(1);
  expect(decided[0]).toMatchObject({ idemKey: `approvals-no:${run.runId}`, actor: "system:approvals", actorUserId: null });
  expect(decided[0].payload).toMatchObject({ answer: "no", category: "no-budget", reason: REASON });
  const stopped = await rows(run.projectId, "project.stopped");
  expect(stopped).toHaveLength(1);
  expect(stopped[0]).toMatchObject({ actor: "system:approvals", idemKey: `approvals-stop:${run.runId}` });
  expect(stopped[0].payload).toMatchObject({ why: REASON });
  // The next approver's answer on the ended run is stale: nothing is written a second time.
  expect(await settle(run, who.boss, NO, undefined)).toMatchObject({ ok: false });
  expect(await decidedBy(run.caseId)).toHaveLength(1);
  expect(await rows(run.projectId, "project.stopped")).toHaveLength(1);
});

it("GAT settle stops nothing for a refused join", async () => {
  // An open project from another case's yes; this case asks to join it.
  await send("join-base-raised", "case.raised", "join-base-case", { title: "Base", routeId, assigneeRoleHolderId: ownerSeat }, who.raiser);
  await send("join-base-yes", "case.decided", "join-base-case", { answer: "yes", projectId: "join-base-p", lead: who.decider.name, leadUserId: who.decider.userId, title: "Base", draft: true }, who.decider);
  const run = await provisional("refused-join", [roles.fin], { projectId: "join-base-p" });
  expect(await settle(run, who.fin, NO)).toMatchObject({ ok: true, settled: "no" });
  expect(await decidedBy(run.caseId)).toHaveLength(1);
  expect(await rows("join-base-p", "project.stopped")).toEqual([]);
  expect(await rows(run.projectId, "project.stopped")).toEqual([]);
});

it("GAT settle writes only the answer for a refused supplement", async () => {
  // The case was decided yes by its first run; a supplement run asks for one more approval and is refused.
  const first = await provisional("supplement");
  expect(await settle(first, who.fin)).toMatchObject({ ok: true, settled: "yes" });
  const second = await provisional("supplement-2", [roles.boss], { supplement: true, caseId: first.caseId });
  const answer = await settle(second, who.boss, NO);
  expect(answer).toEqual({ ok: true, duplicate: false, answer: "no", settled: "no" });
  expect(await rows(first.caseId, "case.approval")).toHaveLength(2);
  // Only the first run's yes decided the case: no second decision, no stop.
  const decided = await decidedBy(first.caseId);
  expect(decided).toHaveLength(1);
  expect(decided[0].payload).toMatchObject({ answer: "yes" });
  expect(await rows(first.projectId, "project.stopped")).toEqual([]);
  // A supplement's yes would end the run with the answer alone as well; here the run is done after the no.
  expect(await settle(second, who.boss)).toMatchObject({ ok: false });
});

it("GAT settle settles a second run after a reopen with its own keys", async () => {
  const first = await provisional("second-run");
  expect(await settle(first, who.fin, NO)).toMatchObject({ ok: true, settled: "no" });
  // The no comes back on its revisit day (the clock's case.reopened), and the desk says 'yes, if approved' again, the same day.
  await appendEventRow(box.id, { id: "second-run-reopened", day: 0, type: "case.reopened", actor: "system:clock", targetId: first.caseId, payload: { why: "revisit", toRoleHolderId: ownerSeat } } as never);
  const second = await provisional("second-run-2", [roles.fin], { caseId: first.caseId });
  expect(await settle(second, who.fin, { ...NO, reason: REASON + " (again)" })).toMatchObject({ ok: true, settled: "no" });
  const decided = await decidedBy(first.caseId);
  expect(decided.map((r) => r.idemKey)).toEqual([`approvals-no:${first.runId}`, `approvals-no:${second.runId}`]);
  expect((await rows(second.projectId, "project.stopped")).map((r) => r.idemKey)).toEqual([`approvals-stop:${second.runId}`]);
  expect((await rows(first.caseId, "case.approval")).map((r) => (r.payload as { runId: string }).runId)).toEqual([first.runId, second.runId]);
});

it("GAT settle refuses a direct case.approval through appendEventAction", async () => {
  const run = await provisional("direct");
  viewer = { userId: who.fin.userId, companyId: box.id, companySlug: SLUG, name: who.fin.name, handle: null, role: "leader", epoch: 0, issuedAt: 0 };
  const out = await appendEventAction({ slug: SLUG, id: "direct-answer", type: "case.approval", target: run.caseId, payload: { runId: run.runId, stepId: run.step(0), dueRev: 0, step: 0, approvalAnswer: "yes" } });
  expect(out).toEqual({ ok: false, error: translate("en", "approvals.permApprovalVia") });
  viewer = null;
  expect(await rows(run.caseId, "case.approval")).toEqual([]);
  // A person who may not answer, and answers that are not valid, are refused by the settle operation with their own sentences and write nothing.
  expect(await settle(run, who.stranger)).toEqual({ ok: false, error: translate("en", "approvals.permStepHolder") });
  expect(await settle(run, who.decider)).toEqual({ ok: false, error: translate("en", "approvals.permDeciderNoApprove") });
  expect(await settle(run, who.fin, { approvalAnswer: "back", reason: "short" })).toEqual({ ok: false, error: translate("en", "approvals.permBackReason") });
  expect(await settle(run, who.fin, { approvalAnswer: "conditions", conditions: "  " })).toEqual({ ok: false, error: translate("en", "approvals.permConditionsText") });
  expect(await settle(run, who.fin, { present: 5 })).toEqual({ ok: false, error: translate("en", "approvals.permPresent") }); // not a council step
  expect(await settle(run, who.fin, { approvalAnswer: "no", reason: "no" })).toMatchObject({ ok: false });
  expect(await rows(run.caseId, "case.approval")).toEqual([]);
});
