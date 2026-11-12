// GAT-C1 (B2): who is told what about a review and an approval (plan GAT, D3, D26), through the planner and the loop mails: the composers pick up the
// approval area's entries. Fixed literal states. Roles, not people: desks and approvers are told by the holders of their role, the raiser, the lead and the
// decider by user id; nobody is told who voted how.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { EMPTY_APPROVAL_CONFIG, type ApprovalStep, type CaseApprovals } from "@/features/approvals/types";
import type { State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { loopMails, type Person } from "@/features/loop/notice";
import { planNotices, type PlanCtx, type PlanEvent, type PlannedDraft } from "@/features/notify/plan";

const SEATS: SeatRow[] = [
  { id: "seat_rev", roleId: "role_rev", label: "R. Review", userId: "u_rev", sort: 0 },
  { id: "seat_owner", roleId: "role_owner", label: "O. Owner", userId: "u_owner", sort: 1 },
  { id: "seat_owner2", roleId: "role_owner", label: "P. Partner", userId: "u_partner", sort: 2 },
  { id: "seat_fin", roleId: "role_fin", label: "F. Finance", userId: "u_fin", sort: 3 },
  { id: "seat_boss", roleId: "role_boss", label: "B. Boss", userId: "u_boss", sort: 4 },
  { id: "seat_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 5 },
  { id: "seat_member", roleId: "role_member", label: "M. Member", userId: "u_member", sort: 6 },
];
const ROLES = [
  { id: "role_rev", title: "Idea manager", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_owner", title: "Plant owner", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_fin", title: "Finance", reportsToId: "role_boss", spendLimitEur: 5000 },
  { id: "role_boss", title: "Plant manager", reportsToId: null, spendLimitEur: 100000 },
  { id: "role_sec", title: "Secretary", reportsToId: "role_boss", spendLimitEur: null },
  { id: "role_member", title: "Council member", reportsToId: "role_boss", spendLimitEur: null },
];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_member", "role_fin"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 30 };
const ROUTE = { id: "r1", type: "t", keys: [], owner: { name: "O. Owner", role: "Owner" }, deputy: "", buddy: "", wait: "", ownerRoleId: "role_owner", ownerSeatId: "seat_owner" };

const person = (id: string, name: string, locale: "en" | "de" = "en"): Person & { locale: "en" | "de" } => ({ id, name, email: `${id}@x.example`, locale });
const PEOPLE = [
  person("u_raiser", "J. Raiser"), person("u_rev", "R. Review"), person("u_owner", "O. Owner"), person("u_partner", "P. Partner", "de"), person("u_fin", "F. Finance"),
  person("u_boss", "B. Boss"), person("u_sec", "S. Secretary"), person("u_member", "M. Member"), person("u_lead", "L. Lead"), person("u_dec", "D. Decider"),
];

const step = (index: number, over: Partial<ApprovalStep> = {}): ApprovalStep =>
  ({ kind: "role", roleId: "role_fin", id: `run1:${index}`, state: "pending", dueDay: 12, dueRev: 0, seatId: null, answers: [], ...over });
const council = (index: number, over: Partial<ApprovalStep> = {}) => step(index, { kind: "council", roleId: undefined, councilId: "k1", dueDay: 30, ...over });
const run = (steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals =>
  ({ runId: "run1", deciderUserId: "u_dec", decidingRoleId: "role_owner", since: 10, projectId: "p1", opened: true, supplement: false, costEur: 9000, steps, done: false, outcome: null, ...over });

const baseCase = (over: Record<string, unknown> = {}) => ({
  id: "c1", title: "Shorter changeover", from: "J. Raiser", fromUserId: "u_raiser", assignee: "O. Owner", assigneeSeatId: "seat_owner", assigneeRoleId: "role_owner", dueDay: 15,
  route: ROUTE, routeId: "r1", review: null, approvals: null, approvalRuns: [], history: [], ...over,
});
const stateOf = (cases: Record<string, unknown>[]): State =>
  ({ day: 12, cases, projects: [{ id: "p1", title: "Shorter changeover", leadUserId: "u_lead", sources: ["c1"], history: [] }], ideas: [], problems: [], ledger: {}, rules: { escalationDays: 3 }, seats: SEATS, routes: [ROUTE],
    clock: { mode: "workdays", calendar: DEFAULT_CALENDAR }, approvals: { ...EMPTY_APPROVAL_CONFIG, review: { ...EMPTY_APPROVAL_CONFIG.review, on: true, days: 2 }, councils: [COUNCIL], roles: ROLES } }) as unknown as State;

let n = 0;
const ev = (type: string, actor: string | null, target: string, payload: Record<string, unknown>, id = `e${n++}`): PlanEvent =>
  ({ id, ts: 0, type, actor: actor ?? "system:clock", actorUserId: actor === null ? null : PEOPLE.find((p) => p.name === actor)?.id ?? null, target, payload }) as unknown as PlanEvent;

const ctxOf = (state: State, prefs: PlanCtx["prefs"] = []): PlanCtx => ({
  companyId: "co", state, people: PEOPLE, prefs, company: { stage: "pilot", notifications: true, n8n: false }, subscriptions: [], baseUrl: "https://x.test/acme",
  dateOfDay: (day: number) => new Date(Date.UTC(2026, 10, 2 + day)).toISOString().slice(0, 10),
});
/** A working day as the mails write it in English: dd/mm/yyyy. */
const numeric = (day: number): string => dateOfWorkday(day, DEFAULT_CALENDAR).split("-").reverse().join("/");
const to = (drafts: PlannedDraft[]) => Object.fromEntries(drafts.filter((d) => d.channel === "inapp").map((d) => [d.recipientUserId!, d]));

it("GAT notices tells the raiser and the new desk of a forward", () => {
  const state = stateOf([baseCase({ review: { state: "forwarded", seatId: "seat_rev", since: 5, dueDay: 7, forwardFrom: 7, waitsOn: null, auto: true } })]);
  const clock = ev("case.reviewed", null, "c1", { outcome: "forward", routeId: "r1", toRoleHolderId: "seat_owner", auto: true });
  const told = to(planNotices(clock, ctxOf(state)));
  // The raiser hears who has it, and that nobody reviewed it; both holders of the desk's role are told, in their own language.
  expect(Object.keys(told).sort()).toEqual(["u_owner", "u_partner", "u_raiser"]);
  expect(told.u_raiser.subject).toBe("Your idea is now with Plant owner");
  expect(told.u_raiser.text).toContain("Plant owner has your idea now and will answer it.");
  expect(told.u_raiser.text).toContain("Forwarded unreviewed after 2 working days");
  expect(told.u_owner.subject).toBe("Passed to your desk: Shorter changeover");
  expect(told.u_owner.text).toContain("NextUp passed this idea to your desk:");
  expect(told.u_partner.subject).toBe("An Ihren Tisch weitergegeben: Shorter changeover");
  expect(told.u_raiser.template).toBe("loop.case.reviewed");
  // By a person: no 'unreviewed' line, the person who forwarded is not mailed, the desk hears who did.
  const person = ev("case.reviewed", "R. Review", "c1", { outcome: "forward", routeId: "r1", toRoleHolderId: "seat_owner" });
  const mails = loopMails({ ev: person, state, people: PEOPLE, baseUrl: "https://x.test/acme" });
  expect(mails.map((m) => m.to).sort()).toEqual(["u_owner@x.example", "u_partner@x.example", "u_raiser@x.example"]);
  expect(mails.find((m) => m.to === "u_raiser@x.example")!.text).not.toContain("unreviewed");
  expect(mails.find((m) => m.to === "u_owner@x.example")!.text).toContain("R. Review passed this idea to your desk:");
  // Anything but a forward says nothing.
  expect(planNotices(ev("case.reviewed", "R. Review", "c1", { outcome: "back" } as never), ctxOf(state)).filter((d) => d.template === "loop.case.reviewed")).toEqual([]);
});

it("GAT notices tells the raiser and the first approver of a provisional yes", () => {
  const state = stateOf([baseCase({ status: "approval", approvals: run([step(0), council(1), step(2, { roleId: "role_boss" })]) })]);
  const yes = ev("case.provisional", "D. Decider", "c1", { approvals: [], projectId: "p1", draft: true }, "run1");
  const told = to(planNotices(yes, ctxOf(state)));
  // The raiser hears the approvers, in order, named by their role or council; the first step's holders are asked, with its date.
  expect(Object.keys(told).sort()).toEqual(["u_fin", "u_raiser"]);
  expect(told.u_raiser.subject).toBe("Yes, if approved: Shorter changeover");
  expect(told.u_raiser.text).toContain("It needs approval by Finance, Investment council, Plant manager first.");
  expect(told.u_fin.subject).toBe("Approval asked: Shorter changeover");
  expect(told.u_fin.text).toContain(`D. Decider said yes, and your approval is needed before this idea can start. Please answer by ${numeric(12)}.`);
  expect(told.u_fin.text).toContain("https://x.test/acme/cases/c1");
  // A first step that was handed to another seat asks that desk; a run the case does not know says nothing.
  const handed = stateOf([baseCase({ approvals: run([step(0, { seatId: "seat_boss" })]) })]);
  expect(Object.keys(to(planNotices(yes, ctxOf(handed)))).sort()).toEqual(["u_boss", "u_raiser"]);
  expect(planNotices(ev("case.provisional", "D. Decider", "c1", {}, "run_other"), ctxOf(state)).filter((d) => d.template === "loop.case.provisional")).toEqual([]);
});

it("GAT notices tells the lead and the decider of an answer", () => {
  const steps = (first: Partial<ApprovalStep>) => [step(0, first), step(1, { roleId: "role_boss", dueDay: 20 })];
  const answer = (a: string, extra: Record<string, unknown> = {}) => ev("case.approval", "F. Finance", "c1", { runId: "run1", stepId: "run1:0", dueRev: 0, step: 0, approvalAnswer: a, ...extra });
  const planned = (s: State, e: PlanEvent) => to(planNotices(e, ctxOf(s)));
  // yes: the lead and the decider are told, and the next step's holders are asked (the decider's name says who said the yes).
  const yes = stateOf([baseCase({ status: "approval", approvals: run(steps({ state: "yes" })) })]);
  const told = planned(yes, answer("yes"));
  expect(Object.keys(told).sort()).toEqual(["u_boss", "u_dec", "u_lead"]);
  expect(told.u_lead.subject).toBe("Finance: Approved");
  expect(told.u_dec.text).toContain("Finance answered the approval of this idea: Approved.");
  expect(told.u_boss.subject).toBe("Approval asked: Shorter changeover");
  expect(told.u_boss.text).toContain("D. Decider said yes");
  // conditions: the text goes along; the next step is asked too.
  const cond = stateOf([baseCase({ approvals: run(steps({ state: "conditions" })) })]);
  const withConditions = planned(cond, answer("conditions", { conditions: "After the audit" }));
  expect(withConditions.u_lead.subject).toBe("Finance: Approved with conditions");
  expect(withConditions.u_lead.text).toContain("Conditions: After the audit");
  expect(Object.keys(withConditions)).toContain("u_boss");
  // back and no: the reason goes along; nobody is asked next (the step stays, or the run ends).
  const back = stateOf([baseCase({ approvals: run(steps({ dueRev: 1 })) })]);
  const sentBack = planned(back, answer("back", { reason: "The quote is missing" }));
  expect(Object.keys(sentBack).sort()).toEqual(["u_dec", "u_lead"]);
  expect(sentBack.u_lead.subject).toBe("Finance: Sent back");
  expect(sentBack.u_lead.text).toContain("Reason: The quote is missing");
  const no = stateOf([baseCase({ approvals: run(steps({ state: "no" }), { done: true, outcome: "no" }) })]);
  const refused = planned(no, answer("no", { reason: "Not in this year's budget" }));
  expect(Object.keys(refused).sort()).toEqual(["u_dec", "u_lead"]);
  expect(refused.u_dec.subject).toBe("Finance: Not approved");
  // The last step's yes asks nobody; a run the case does not know says nothing; the approver who answered is not mailed.
  const last = stateOf([baseCase({ approvals: run([step(0, { state: "yes" })], { done: true, outcome: "yes" }) })]);
  expect(Object.keys(planned(last, answer("yes"))).sort()).toEqual(["u_dec", "u_lead"]);
  expect(planNotices(ev("case.approval", "F. Finance", "c1", { runId: "run_x", stepId: "run_x:0", approvalAnswer: "yes" }), ctxOf(yes)).filter((d) => d.template === "loop.case.approval")).toEqual([]);
  expect(Object.keys(planned(yes, ev("case.approval", "D. Decider", "c1", { runId: "run1", stepId: "run1:0", approvalAnswer: "yes" })))).not.toContain("u_dec");
});

it("GAT notices reminds review, approval and council holders as duty", () => {
  const review = { state: "pending", seatId: "seat_rev", since: 5, dueDay: 7, forwardFrom: 7, waitsOn: null, auto: false };
  const state = stateOf([baseCase({ assigneeSeatId: "seat_rev", assigneeRoleId: "role_rev", review, approvals: run([step(0), council(1, { dueDay: 30 })]) })]);
  const fact = (payload: Record<string, unknown>) => ev("clock.due", null, "c1", payload);
  // Everyone opted out of everything: duty reminders are written as pending all the same.
  const optedOut = PEOPLE.flatMap((p) => ["*", "reminder.review", "reminder.approval", "reminder.council"].map((template) => ({ userId: p.id, template, on: false })));
  const planned = (e: PlanEvent) => planNotices(e, ctxOf(state, optedOut)).filter((d) => d.channel !== "inapp");
  const who = (ds: PlannedDraft[]) => ds.map((d) => d.recipientUserId).sort();

  // review: the review seat's holders, the day the review should end
  const rev = planned(fact({ kind: "review", dueDay: 6, check: 1, originEventId: "review:c1", stepId: "review:5" }));
  expect(who(rev)).toEqual(["u_rev"]);
  expect(rev[0]).toMatchObject({ template: "reminder.review", status: "pending", subject: "Review due: Shorter changeover" });
  expect(rev[0].text).toContain("by 9 Nov 2026"); // the review's due day 7, not the fact's day 6
  // approval: the step's role holders; after a late hand-over the handed seat
  const appr = planned(fact({ kind: "approval", dueDay: 12, check: 1, originEventId: "run1", stepId: "run1:0@0" }));
  expect(who(appr)).toEqual(["u_fin"]);
  expect(appr[0]).toMatchObject({ template: "reminder.approval", status: "pending", subject: "Approval due: Shorter changeover" });
  const handed = planned(fact({ kind: "approval", dueDay: 15, check: 2, toRoleHolderId: "seat_boss", originEventId: "run1", stepId: "run1:0@0" }));
  expect(who(handed)).toEqual(["u_boss"]);
  expect(handed[0].text).toContain("due 14 Nov 2026"); // the step's own day
  // council: the lead and the decider, with the meeting it moved to
  const moved = planned(fact({ kind: "council", dueDay: 40, originEventId: "run1", stepId: "run1:1@0" }));
  expect(who(moved)).toEqual(["u_dec", "u_lead"]);
  expect(moved[0]).toMatchObject({ template: "reminder.council", status: "pending", subject: "Moved to the next council meeting: Shorter changeover" });
  expect(moved[0].text).toContain("next meeting, 12 Dec 2026");
  // A reminder for a step that was answered meanwhile, a review that was forwarded or a fact about an unknown run reaches nobody.
  const done = stateOf([baseCase({ review: { ...review, state: "forwarded" }, approvals: run([step(0, { state: "yes" }), council(1, { state: "yes" })]) })]);
  for (const f of [{ kind: "review", dueDay: 6, check: 1 }, { kind: "approval", dueDay: 12, check: 1, originEventId: "run1", stepId: "run1:0@0" }, { kind: "council", dueDay: 40, originEventId: "run1", stepId: "run1:1@0" }]) {
    expect(planNotices(fact(f), ctxOf(done)).filter((d) => d.channel !== "inapp")).toEqual([]);
  }
  expect(planNotices(fact({ kind: "approval", dueDay: 12, check: 1, originEventId: "run_x", stepId: "run_x:0@0" }), ctxOf(state)).filter((d) => d.channel !== "inapp")).toEqual([]);
});

it("GAT notices never names who voted how", () => {
  // A council's answer: the secretary writes it, two members sit on it. The mail names the council and how many were present, nobody else.
  const state = stateOf([baseCase({ approvals: run([council(0, { state: "yes", answers: [{ answer: "yes", reason: "", conditions: null, present: 7, day: 30, by: "S. Secretary", byUserId: "u_sec" }] }), step(1, { roleId: "role_boss" })]) })]);
  const answer = ev("case.approval", "S. Secretary", "c1", { runId: "run1", stepId: "run1:0", approvalAnswer: "yes", present: 7, reason: "" });
  const drafts = planNotices(answer, ctxOf(state));
  const body = drafts.filter((d) => d.channel === "inapp").map((d) => `${d.subject}\n${d.text}`).join("\n---\n");
  expect(body).toContain("Investment council: Approved");
  expect(body).toContain("Present at the meeting: 7");
  for (const name of ["S. Secretary", "M. Member", "F. Finance", "u_sec", "u_member", "u_fin"]) expect(body, name).not.toContain(name);
  expect(drafts.some((d) => d.recipientUserId === "u_member" || d.recipientUserId === "u_sec")).toBe(false);
  // The same through the loop mails, and in German.
  const mails = loopMails({ ev: answer, state, people: PEOPLE, baseUrl: "https://x.test/acme" }, "de");
  expect(mails.length).toBeGreaterThan(0);
  for (const m of mails) for (const name of ["S. Secretary", "M. Member", "F. Finance"]) expect(`${m.subject}${m.text}`).not.toContain(name);
  expect(mails.map((m) => m.subject)[0]).toBe("Investment council: Freigegeben");
});
