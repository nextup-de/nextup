// NOR-G1 (B1): the Gerüst of plan NOR - the new events, notice lists, clock kinds, demo acts, strings and the fields of a
// freshly raised case. No behaviour: the reducer fills the fields later (NOR-A1).
import { describe, expect, it } from "vitest";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import { caseActs } from "@/components/dashboard/demo/case-acts";
import { appendEvent, emptyLog, type CaseEventType } from "@/features/cases/events";
import { CASE_EVENT_TYPES } from "@/features/cases/events/case";
import { APP_EVENT_TYPES, isAppEventType } from "@/features/cases/persist";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { CASE_DUE_KINDS } from "@/features/clock/kinds/case";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { Seed } from "@/features/demo/types";
import type { InboxKind } from "@/features/inbox/types";
import { DUTY_TEMPLATES } from "@/features/notify/channels";
import { FOLLOWS, LOOP_TEMPLATES } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import { caseNo } from "@/i18n/messages/caseNo";

const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };

const NEW_TYPES = ["case.reopened", "case.appealed", "case.appeal.decided", "case.invite.declined"] as const;

describe("NOR scaffold", () => {
  it("case.reopened, case.appealed, case.appeal.decided and case.invite.declined are app events", () => {
    for (const t of NEW_TYPES) {
      expect(CASE_EVENT_TYPES, t).toContain(t);
      expect(APP_EVENT_TYPES, t).toContain(t);
      expect(isAppEventType(t), t).toBe(true);
    }
  });

  it("loop.case.reopened, loop.case.appealed, loop.case.appeal.decided and loop.case.override follow loop.case.decided", () => {
    for (const t of ["case.reopened", "case.appealed", "case.appeal.decided", "case.override"] as const satisfies readonly CaseEventType[]) {
      expect(LOOP_TEMPLATES, t).toContain(`loop.${t}`);
      expect(FOLLOWS[`loop.${t}`], t).toBe("loop.case.decided");
      expect(LOOP_TYPES.has(t), t).toBe(true);
      expect(LOOP_MAIL_TYPES.has(t), t).toBe(true);
    }
  });

  it("case.invite.declined sends no mail and is no loop template", () => {
    expect(LOOP_TEMPLATES).not.toContain("loop.case.invite.declined");
    expect(LOOP_TYPES.has("case.invite.declined")).toBe(false);
    expect(LOOP_MAIL_TYPES.has("case.invite.declined")).toBe(false);
  });

  it("reminder.appeal is a duty and follows reminder.deadline; reminder.view follows reminder.checkin", () => {
    expect(DUTY_TEMPLATES).toContain("reminder.appeal");
    expect(FOLLOWS["reminder.appeal"]).toBe("reminder.deadline");
    expect(FOLLOWS["reminder.view"]).toBe("reminder.checkin");
    expect(DUTY_TEMPLATES).not.toContain("reminder.view");
  });

  it("the clock has the kinds revisit, appeal and view", () => {
    for (const k of ["revisit", "appeal", "view"]) expect(CASE_DUE_KINDS).toContain(k);
  });

  it("InboxKind has appeal", () => {
    const kinds: InboxKind[] = ["appeal"];
    expect(kinds).toEqual(["appeal"]);
  });

  it("a freshly raised case has empty decisions, passes 0, notNowInRow 0, appeal null, reopens empty and cycleStartDay = its raise day", () => {
    const log = appendEvent({ ...emptyLog(), day: 3 }, { type: "case.raised", actor: "J. Schmidt", target: "c_new", payload: { title: "A new case", routeId: "r1", assignee: "T. Vogel" } });
    const c = reduce(SEED, log).cases.find((x) => x.id === "c_new")!;
    expect(c).toMatchObject({ decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], dueFloor: null, reopenSeq: null, decidedSeq: null });
    expect(c.cycleStartDay).toBe(c.raisedDay);
    expect(c.raisedDay).toBe(3);
  });

  it("a decision, a hand-over and a discussion still carry the new fields empty until NOR-A1 fills them", () => {
    let log = appendEvent(emptyLog(), { type: "case.raised", actor: "J. Schmidt", target: "c_a", payload: { title: "A", routeId: "r1", assignee: "T. Vogel" } });
    log = appendEvent(log, { type: "case.discussion", actor: "T. Vogel", target: "c_a", payload: { invited: ["H. Sander"], missing: "x" } });
    expect(reduce(SEED, log).cases[0].discussion?.declinedUserIds).toEqual([]);
    log = appendEvent(emptyLog(), { type: "case.raised", actor: "J. Schmidt", target: "c_b", payload: { title: "B", routeId: "r1", assignee: "T. Vogel" } });
    log = appendEvent(log, { type: "case.decided", actor: "T. Vogel", target: "c_b", payload: { answer: "no", reason: "not now", note: "later" } });
    expect(reduce(SEED, log).cases[0].decided).toMatchObject({ answer: "no", category: null, changeIf: "", revisitDay: null, duplicateOf: null });
  });

  describe("demo acts", () => {
    const calls: { type: string; target: string | null; payload: unknown }[] = [];
    const deps: ActDeps = {
      emit: (type, target, payload) => { calls.push({ type, target, payload }); return Promise.resolve({ ok: true }); },
      S: { cases: [] } as unknown as State, seed: { seats: [] } as unknown as Seed, serverMode: true, slug: "acme", actor: "T. Vogel", actorUserId: "u_tv", log: emptyLog(),
    };
    const acts = caseActs(deps);
    it("no, pass, appeal, answerAppeal and declineInvite are thin wrappers over emit", () => {
      acts.no("c_1", { category: "no-fit", reason: "It does not fit any goal we have" });
      acts.pass("c_1", { to: "H. Sander", toRoleHolderId: "seat_hs", why: "Belongs to Quality", up: true });
      acts.appeal("c_1", "Please look again: the numbers changed");
      acts.answerAppeal("c_1", false, "The new numbers change the picture");
      acts.declineInvite("c_1", "Not for me");
      acts.declineInvite("c_1");
      expect(calls).toStrictEqual([
        { type: "case.decided", target: "c_1", payload: { category: "no-fit", reason: "It does not fit any goal we have", answer: "no" } },
        { type: "case.handed", target: "c_1", payload: { to: "H. Sander", toRoleHolderId: "seat_hs", why: "Belongs to Quality", up: true } },
        { type: "case.appealed", target: "c_1", payload: { text: "Please look again: the numbers changed" } },
        { type: "case.appeal.decided", target: "c_1", payload: { uphold: false, reason: "The new numbers change the picture" } },
        { type: "case.invite.declined", target: "c_1", payload: { why: "Not for me" } },
        { type: "case.invite.declined", target: "c_1", payload: {} },
      ]);
    });
  });

  it("the caseNo namespace has a label and a sub for every category, and the shared strings, in German and English", () => {
    for (const lang of ["en", "de"] as const) {
      const m = caseNo[lang] as Record<string, string>;
      for (const k of ["catNotNow", "catNoBudget", "catNoFit", "catDuplicate", "catRisk", "catNotFeasible"]) {
        expect(m[k], `${lang}.${k}`).toBeTruthy();
        expect(m[k + "Sub"], `${lang}.${k}Sub`).toBeTruthy();
      }
      for (const k of ["catOther", "changeIfLabel", "revisitLabel", "duplicateLabel", "secondLook", "cameBack", "passedToYou", "notMine", "sendUp", "movedToYou"]) expect(m[k], `${lang}.${k}`).toBeTruthy();
    }
    expect(caseNo.en.catNotNow).toBe("Not now");
    expect(caseNo.en.catNoBudget).toBe("No budget this year");
    expect(caseNo.en.catNoFit).toBe("Does not fit a goal or a standard");
    expect(caseNo.en.catDuplicate).toBe("Already solved or in work");
    expect(caseNo.en.catRisk).toBe("Risk, safety or quality concern");
    expect(caseNo.en.catNotFeasible).toBe("Not feasible as described");
    expect(caseNo.en.secondLook).toBe("Second look");
    expect(caseNo.de.secondLook).toBe("Zweiter Blick");
  });
});
