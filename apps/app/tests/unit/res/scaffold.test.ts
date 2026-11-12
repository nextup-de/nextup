// RES-G1: the scaffold of "A result that closes properly". No behaviour: the names, the empty values, the shared helpers and the
// strings every later RES task builds on.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { REWARD_REMIND_DAYS } from "@/features/clock/kinds/project";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems, type InboxInput, type InboxKind } from "@/features/inbox";
import { projectResultItems } from "@/features/inbox/sources/project-result";
import { LOOP_DEFAULTS, type LoopRules } from "@/features/loop/rules";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { baselineNeedsConfirm, DROP_WHY_MAX, HELP_TEXT_MAX, openStepsOf, QUESTION_WHY_MAX, recognitionDueDay, revisionMatches, rewardPossible } from "@/features/projects/result";
import type { Baseline, ReducedProject, Step } from "@/features/projects/types";
import { createT } from "@/i18n";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "r" + n++, ts: 0, type, actor, actorUserId, target, payload, day });

const NEW_EVENTS = ["project.measure.questioned", "project.baseline.confirmed", "project.help.asked"] as const;
const LOOP_TEMPLATES = [...NEW_EVENTS, "project.claimed"].map((t) => `loop.${t}`);

describe("RES scaffold", () => {
  it("the three new events are app events and loop events that follow loop.project.measured, and a claim now tells people too", () => {
    for (const t of NEW_EVENTS) expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
    for (const template of LOOP_TEMPLATES) {
      expect(NOTIFY_GROUPS.loop, template).toContain(template);
      expect(followsTemplate(template), template).toBe("loop.project.measured");
      expect(LOOP_TYPES.has(template.slice("loop.".length) as CaseEventType), template).toBe(true);
      expect(LOOP_MAIL_TYPES.has(template.slice("loop.".length) as CaseEventType), template).toBe(true);
    }
    expect(followsTemplate("reminder.reward")).toBe("reminder.confirm");
  });

  it("a legacy project has the empty RES values: no reward day, no help asks, a step not dropped, a measure nobody questioned", () => {
    const lead = "L. Brandt";
    const log = [
      ev("case.raised", "Anonymous #4471", "u_js", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
      ev("case.decided", "T. Vogel", "u_tv", "c_a", { answer: "yes", projectId: "p_one", lead, leadUserId: "u_lb", title: "Shorter changeover" }),
      ev("project.baseline", lead, "u_lb", "p_one", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES weekly" }),
      ev("project.started", lead, "u_lb", "p_one"),
      ev("project.step.added", lead, "u_lb", "p_one", { stepId: "s1", text: "Pre-stage the tools" }),
      ev("project.done", lead, "u_lb", "p_one", { note: "Live" }, 2),
      ev("project.measured", lead, "u_lb", "p_one", { check: 30, value: 30, source: "typed" }, 33),
    ];
    const p = reduce(SEED, { events: log, day: 40 }).projects[0];
    expect(p.rewardDueDay).toBeNull();
    expect(p.helpAsks).toEqual([]);
    expect(p.steps[0].dropped).toBeNull();
    expect(p.measures[0]).toMatchObject({ sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [], eventId: log[6].id });
    // the baseline's new fields: who typed it, the revision's identity, not confirmed
    expect(p.baseline).toMatchObject({ none: false, byUserId: "u_lb", eventId: log[2].id, confirmed: null });
  });

  const rules = (over: Partial<Pick<LoopRules, "measure" | "recognition" | "reward">> = {}): Pick<LoopRules, "measure" | "recognition" | "reward"> =>
    ({ measure: true, recognition: true, reward: { kind: "gift", amount: 0 }, ...over }) as Pick<LoopRules, "measure" | "recognition" | "reward">;
  const number: Baseline = { none: false, metric: "m", unit: "min", value: 42, better: "down", source: "", day: 1, by: "L", byUserId: "u_lb", eventId: "b1", confirmed: null };
  const noNumber: Baseline = { none: true, why: "nothing to measure", day: 1, by: "L" };
  const step = (id: string, patch: Partial<Step> = {}): Step =>
    ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "doing", why: "", note: "", addedDay: 1, by: "L", movedDay: 1, startedDay: 1, doneDay: null, external: null, dropped: null, ...patch });

  it("rewardPossible: the company measures, recognises and has a reward rule", () => {
    expect(rewardPossible(rules())).toBe(true);
    expect(rewardPossible(rules({ measure: false }))).toBe(false);
    expect(rewardPossible(rules({ recognition: false }))).toBe(false);
    expect(rewardPossible(rules({ reward: { kind: "none" } as LoopRules["reward"] }))).toBe(false);
    expect(rewardPossible(LOOP_DEFAULTS)).toBe(LOOP_DEFAULTS.measure && LOOP_DEFAULTS.recognition && LOOP_DEFAULTS.reward.kind !== "none");
  });

  it("baselineNeedsConfirm: planning, a number baseline, a reward possible, not confirmed yet", () => {
    const planning = { status: "planning", baseline: number } as Pick<ReducedProject, "status" | "baseline">;
    expect(baselineNeedsConfirm(planning, rules())).toBe(true);
    expect(baselineNeedsConfirm({ ...planning, baseline: { ...number, confirmed: { byUserId: "u_hs", day: 2 } } }, rules())).toBe(false);
    expect(baselineNeedsConfirm({ ...planning, baseline: noNumber }, rules())).toBe(false);
    expect(baselineNeedsConfirm({ ...planning, baseline: null }, rules())).toBe(false);
    expect(baselineNeedsConfirm({ ...planning, status: "running" }, rules())).toBe(false);
    expect(baselineNeedsConfirm(planning, rules({ reward: { kind: "none" } as LoopRules["reward"] }))).toBe(false);
  });

  it("recognitionDueDay is the reward day plus REWARD_REMIND_DAYS while the reward is due, else null", () => {
    expect(REWARD_REMIND_DAYS).toBe(10);
    expect(recognitionDueDay({ rewardDue: true, rewardDueDay: 40 })).toBe(50);
    expect(recognitionDueDay({ rewardDue: false, rewardDueDay: 40 })).toBeNull();
    expect(recognitionDueDay({ rewardDue: true, rewardDueDay: null })).toBeNull();
  });

  it("openStepsOf lists the steps not done and not dropped, and the limits are the decided ones", () => {
    const steps = [step("a"), step("b", { column: "done" }), step("c", { dropped: { why: "no longer needed", day: 3, byUserId: "u_lb" } }), step("d", { column: "blocked" })];
    expect(openStepsOf({ steps }).map((s) => s.id)).toEqual(["a", "d"]);
    expect([DROP_WHY_MAX, QUESTION_WHY_MAX, HELP_TEXT_MAX]).toEqual([400, 400, 1000]);
  });

  it("revisionMatches: an event that names no revision means the one that stood, a named one only the one that stands", () => {
    expect(revisionMatches(undefined, "e1")).toBe(true);
    expect(revisionMatches(undefined, null)).toBe(true);
    expect(revisionMatches("e1", "e1")).toBe(true);
    expect(revisionMatches("e1", "e2")).toBe(false);
    expect(revisionMatches("e1", null)).toBe(false);
    expect(revisionMatches("e1", undefined)).toBe(false);
  });

  it("InboxKind has help, baseline and suggestion; projectResultItems lists nothing yet and inboxItems gives what it gave", () => {
    const kinds: InboxKind[] = ["help", "baseline", "suggestion"];
    expect(kinds).toHaveLength(3);
    const seats: SeatRow[] = [{ id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 }];
    const state = { day: 2, ideas: [], problems: [], projects: [], seats, routes: [], cases: [] } as unknown as State;
    const input: InboxInput = { state, me: meFor("u_tv", seats), seats, today: 2, demo: false, flags: { projects: true, discussion: true } };
    expect(projectResultItems(input)).toEqual([]);
    expect(inboxItems(input)).toEqual([]);
    expect(inboxItems(input).filter((i) => kinds.includes(i.kind))).toEqual([]);
  });

  it("the projectResult keys are in both languages", () => {
    const en = createT("en");
    const de = createT("de");
    for (const key of ["recognitionDue", "stalledColumn", "permDoneOpenSteps", "permStartNeedsConfirm", "measureSendBack", "askSponsor", "baselineWaits", "dropped"] as const) {
      expect(en(`projectResult.${key}`, { date: "d", label: "l", why: "w" }), key).not.toBe("");
      expect(de(`projectResult.${key}`, { date: "d", label: "l", why: "w" }), key).not.toBe("");
    }
    expect(en("projectResult.recognitionDue", { date: "12 Nov" })).toBe("Recognition due by 12 Nov");
    expect(de("projectResult.recognitionDue", { date: "12. Nov." })).toBe("Anerkennung fällig bis 12. Nov.");
  });
});
