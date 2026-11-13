// GAT-G1 (B1): the approval area's scaffold exists and nothing behaves differently yet (plan GAT, decisions D6, D8, D10, D14, D26).
// Fixed literals and registry reads only; no reducer run. The area lists are read through the composers, so a name that is in the area
// file but not in the registry fails here.
import { expect, expectTypeOf, it } from "vitest";
import type { ActDeps, Emit } from "@/components/dashboard/demo/act-deps";
import { caseActs } from "@/components/dashboard/demo/case-acts";
import type { Act, CoreActs } from "@/components/dashboard/DemoProvider";
import type { EventLog, EventPayload } from "@/features/cases/events";
import { APPROVAL_EVENT_TYPES } from "@/features/cases/events/approval";
import { APP_EVENT_TYPES, isAppEventType } from "@/features/cases/persist";
import type { State } from "@/features/cases/reducer";
import { DUE_KINDS } from "@/features/clock/due";
import { APPROVAL_DUE_KINDS, approvalAfterFacts, approvalDues, REVIEW_REMIND_DAYS } from "@/features/clock/kinds/approval";
import type { Seed } from "@/features/demo/types";
import { APPROVAL_DUTY_TEMPLATES, APPROVAL_FOLLOWS, APPROVAL_LOOP_MAIL_TYPES, APPROVAL_LOOP_TEMPLATES, APPROVAL_LOOP_TYPES, APPROVAL_REMINDER_AUDIENCE, APPROVAL_REMINDER_KINDS, APPROVAL_REMINDER_TEXTS } from "@/features/notify/areas/approval";
import { DUTY_TEMPLATES } from "@/features/notify/channels";
import { FOLLOWS, LOOP_TEMPLATES } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { REMINDER_KINDS } from "@/features/notify/templates";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import { FIXTURES, above, TODAY } from "../reg/clock-fixture";

it("GAT scaffold lists the four approval events as app types", () => {
  expect([...APPROVAL_EVENT_TYPES]).toEqual(["case.reviewed", "case.costed", "case.provisional", "case.approval"]);
  for (const t of APPROVAL_EVENT_TYPES) {
    expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
    expect(isAppEventType(t), t).toBe(true);
  }
  // The payload fields compile on the composed EventPayload (a type error here fails the typecheck, not the run).
  const reviewed: EventPayload = { outcome: "forward", routeId: "r1", auto: true };
  const costed: EventPayload = { eur: 12_000, basis: "Two quotes" };
  const provisional: EventPayload = {
    projectId: "p_1", draft: true, supplement: false, decidingRoleId: "role_a", costEur: 12_000,
    approvals: [{ kind: "budget", roleId: "role_b", coversUpToEur: null }, { kind: "council", councilId: "k1" }, { kind: "role", roleId: "role_c", byHand: true }],
  };
  const approval: EventPayload = {
    runId: "ev_1", stepId: "ev_1:0", dueRev: 0, step: 0, approvalAnswer: "conditions", conditions: "After the audit", present: 7, stepDueDay: 12, nextStepDueDay: null, reason: "ok",
  };
  const raised: EventPayload = { review: true, reviewDueDay: 4 };
  expect([reviewed, costed, provisional, approval, raised]).toHaveLength(5);
});

it("GAT scaffold lists the three loop types with templates and mail types", () => {
  expect([...APPROVAL_LOOP_TYPES]).toEqual(["case.reviewed", "case.provisional", "case.approval"]);
  for (const t of APPROVAL_LOOP_TYPES) {
    expect(LOOP_TYPES.has(t), t).toBe(true);
    expect(LOOP_MAIL_TYPES.has(t), t).toBe(true);
    expect(LOOP_TEMPLATES, `loop.${t}`).toContain(`loop.${t}`);
    expect(FOLLOWS[`loop.${t}`], `loop.${t} follows`).toBe("loop.case.decided");
  }
  expect([...APPROVAL_LOOP_MAIL_TYPES]).toEqual([...APPROVAL_LOOP_TYPES]);
  expect([...APPROVAL_LOOP_TEMPLATES]).toEqual(APPROVAL_LOOP_TYPES.map((t) => `loop.${t}`));
  expect(Object.keys(APPROVAL_FOLLOWS).filter((k) => k.startsWith("loop."))).toEqual(APPROVAL_LOOP_TEMPLATES);
});

it("GAT scaffold lists the three duty reminders", () => {
  expect([...APPROVAL_REMINDER_KINDS]).toEqual(["review", "approval", "council"]);
  expect([...APPROVAL_DUTY_TEMPLATES]).toEqual(["reminder.review", "reminder.approval", "reminder.council"]);
  for (const k of APPROVAL_REMINDER_KINDS) {
    expect(REMINDER_KINDS as readonly string[], k).toContain(k);
    expect(DUTY_TEMPLATES as readonly string[], `reminder.${k}`).toContain(`reminder.${k}`);
    expect(FOLLOWS[`reminder.${k}`], `reminder.${k} follows`).toBe("reminder.triage");
    expect(typeof APPROVAL_REMINDER_TEXTS[`reminder.${k}`]).toBe("function");
    expect(typeof APPROVAL_REMINDER_AUDIENCE[k]).toBe("function");
  }
});

it("GAT scaffold has the clock kinds review approval council and no Due yet", () => {
  expect([...APPROVAL_DUE_KINDS]).toEqual(["review", "approval", "council"]);
  for (const k of APPROVAL_DUE_KINDS) expect(DUE_KINDS as readonly string[], k).toContain(k);
  expect(REVIEW_REMIND_DAYS).toBe(1);
  for (const f of FIXTURES) expect(approvalDues(f.state, f.today, above)).toEqual([]);
  expect(approvalDues({ clock: { mode: "demo" } } as State, TODAY, above)).toEqual([]);
  for (const kind of APPROVAL_DUE_KINDS) expect(approvalAfterFacts({ kind, target: "x", dueDay: 1, idemKey: "k" })).toBe(false);
});

it("GAT scaffold has the four demo case acts and keeps CoreActs.approve", () => {
  const calls: [string, string | null, EventPayload | undefined][] = [];
  const emit: Emit = (type, target, payload) => { calls.push([type, target, payload]); return Promise.resolve({ ok: true }); };
  const log: EventLog = { events: [], day: 0 };
  const d: ActDeps = { emit, S: { day: 0, cases: [], ideas: [], projects: [] } as unknown as State, seed: { seats: [] } as unknown as Seed, serverMode: false, slug: "acme", actor: "T. Vogel", actorUserId: "u_tv", log };
  const acts = caseActs(d);
  for (const name of ["review", "cost", "provisional", "answerApproval"] as const) expect(typeof acts[name], name).toBe("function");
  expect(Object.keys(acts)).not.toContain("approve");

  acts.review("c_1", "r2");
  acts.review("c_1", null);
  acts.cost("c_1", 9000, "Two quotes");
  acts.provisional("c_1", { answer: "yes", projectId: "p_1", draft: true });
  acts.answerApproval("c_1", "ev_1", "ev_1:0", "yes", { dueRev: 0, step: 0 });
  acts.answerApproval("c_1", "ev_1", "ev_1:0", "back", { dueRev: 0, step: 0, reason: "The quote is missing" });
  expect(calls).toStrictEqual([
    ["case.reviewed", "c_1", { outcome: "forward", routeId: "r2" }],
    ["case.reviewed", "c_1", { outcome: "forward" }],
    ["case.costed", "c_1", { eur: 9000, basis: "Two quotes" }],
    ["case.provisional", "c_1", { answer: "yes", projectId: "p_1", draft: true }],
    ["case.approval", "c_1", { dueRev: 0, step: 0, runId: "ev_1", stepId: "ev_1:0", approvalAnswer: "yes" }],
    ["case.approval", "c_1", { dueRev: 0, step: 0, reason: "The quote is missing", runId: "ev_1", stepId: "ev_1:0", approvalAnswer: "back" }],
  ]);

  // The core act keeps its signature, and the composed Act still has it next to the case acts.
  expectTypeOf<CoreActs["approve"]>().toEqualTypeOf<(ideaId: string, team: string[], note: string) => void>();
  expectTypeOf<Act["approve"]>().toEqualTypeOf<(ideaId: string, team: string[], note: string) => void>();
});
