// Plan NOR, NOR-C1 (B1): old and new noes read the same everywhere (D25), and the discussion's declined and silent invitees (D14).
// The reducer fills the new Case fields in NOR-A1, so the cases here are reduced from the log and the fields set by hand.
import { describe, expect, it } from "vitest";
import { decisionOf, decidedAtMs, decisionIdOf, type MapCtx } from "@/features/api/map";
import { toDecision, type DecisionInput } from "@/features/admin/decisions";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { invitedTo, noViewYet } from "@/features/cases/discussion";
import { reduce, type Decision, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { sampleDecisionLines } from "@/features/demo/sample-decisions";
import { statusView } from "@/features/floor/status";
import { translate } from "@/i18n";

const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
const NOW = Date.parse("2026-11-03T10:00:00Z");
let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, over: Partial<CaseEvent> = {}): CaseEvent =>
  ({ id: "r" + n++, ts: NOW + n * 1000, type, actor: "T. Vogel", actorUserId: "u_tv", target, payload, day: 0, ...over });

const NEW_REASON = "The line cannot carry another changeover until the new tooling is in, so we say no for now.";
const raise = (id: string) => ev("case.raised", id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "T. Vogel" }, { actor: "R. Raiser", actorUserId: "u_au" });
const state = (events: CaseEvent[]): State => reduce(SEED, { events, day: 0 });
const caseIn = (s: State, id: string): ReducedCase => s.cases.find((c) => c.id === id)!;
const ctxOf = (s: State): MapCtx => ({ companyId: "co1", baseUrl: "https://x.test", nowMs: NOW, day: 0, seats: s.seats, projects: s.projects });
const floorCtx = { roleTitleOf: () => null, areaName: null };
const en = (key: Parameters<typeof translate>[1]) => translate("en", key);

describe("NOR readers", () => {
  describe("the floor status", () => {
    it("shows the category label of a new no and of an old one, never the reason text", () => {
      const s = state([raise("a"), ev("case.decided", "a", { answer: "no", category: "risk", reason: NEW_REASON }), raise("b"), ev("case.decided", "b", { answer: "no", reason: "no time", note: "The plan is full until Q4, private note" })]);
      // The reducer carries the category of a new no from NOR-A1 on; here it is set as that reducer will.
      caseIn(s, "a").decided!.category = "risk";
      const a = statusView(caseIn(s, "a"), floorCtx);
      const b = statusView(caseIn(s, "b"), floorCtx);
      expect(a.decision).toEqual({ answer: "no", reason: "caseNo.catRisk" });
      expect(b.decision).toEqual({ answer: "no", reason: "shell.noNoTime" });
      expect(en("shell.noNoTime")).toBe("No time this quarter");
      for (const v of [a, b]) {
        const json = JSON.stringify(v);
        expect(json).not.toContain(NEW_REASON);
        expect(json).not.toContain("private note");
      }
    });

    it("an old no with free text is the label of other, and a yes carries no reason", () => {
      const s = state([raise("c"), ev("case.decided", "c", { answer: "no", reason: "Too costly" }), raise("d"), ev("case.decided", "d", { answer: "yes", reason: "Fixing it" })]);
      expect(statusView(caseIn(s, "c"), floorCtx).decision).toEqual({ answer: "no", reason: "caseNo.catOther" });
      expect(statusView(caseIn(s, "d"), floorCtx).decision).toEqual({ answer: "yes", reason: null });
    });
  });

  describe("API v1", () => {
    const first = ev("case.decided", "e", { answer: "no", category: "not-now", reason: NEW_REASON, revisitDay: 20 }, { ts: NOW + 1_000_000 });
    const second = ev("case.decided", "e", { answer: "no", category: "no-fit", reason: "It does not serve a goal." }, { ts: NOW + 9_000_000 });
    const s = state([raise("e"), first, ev("case.reopened", "e", { why: "revisit" }), second]);
    const c = caseIn(s, "e");
    const d = (answer: "yes" | "no", reason: string): Decision => ({ answer, reason, note: "", by: "T. Vogel", day: 0, byUserId: "u_tv", category: null, changeIf: "", revisitDay: null, duplicateOf: null });

    it("maps the latest decision, with the id of its place: dec_<caseId> for the first, dec_<caseId>_2 for the second", () => {
      // The reducer (NOR-A1) lists both decisions and the place of the latest; set here the same way.
      const once = { ...c, decisions: [d("no", first.payload.reason ?? "")], decidedSeq: c.history.indexOf(c.history.find((e) => e.id === first.id)!) };
      expect(decisionOf(once, ctxOf(s))?.id).toBe("dec_e");
      const twice = { ...c, decisions: [d("no", NEW_REASON), d("no", "It does not serve a goal.")], decidedSeq: c.history.findIndex((e) => e.id === second.id) };
      expect(decisionIdOf(twice)).toBe("dec_e_2");
      const out = decisionOf(twice, ctxOf(s))!;
      expect(out.id).toBe("dec_e_2");
      // The time is the second decision's, not the first one's; the reason is what is stored.
      expect(decidedAtMs(twice, ctxOf(s))).toBe(second.ts);
      expect(out.decidedAt).toBe(new Date(second.ts).toISOString());
      expect(out.reason).toBe("It does not serve a goal.");
    });

    it("without the reducer's place it reads the last case.decided of the history", () => {
      const noSeq = { ...c, decisions: [d("no", "x"), d("no", "y")], decidedSeq: null };
      expect(decidedAtMs(noSeq, ctxOf(s))).toBe(second.ts);
      // A seed case with a decision and no decisions list is the first one.
      expect(decisionIdOf({ id: "z", decisions: [] })).toBe("dec_z");
    });
  });

  describe("/admin/decisions and the sample decisions", () => {
    const input = (...later: CaseEvent[]): DecisionInput => ({
      eventId: "e1", companyId: "co1", company: "acme", caseId: "k1", raisedAt: "2026-11-01T10:00:00Z", payload: { title: "T", routeId: "r1" },
      later: later.map((e) => ({ type: e.type, payload: e.payload })), noticeAt: null, desks: [],
    });

    it("lists the category label key and the text of a new no and of an old one", () => {
      const fresh = toDecision(input(ev("case.decided", "k1", { answer: "no", category: "no-budget", reason: NEW_REASON })));
      expect(fresh).toMatchObject({ answer: "no", category: "no-budget", reasonText: NEW_REASON });
      const old = toDecision(input(ev("case.decided", "k1", { answer: "no", reason: "no time", note: "Plan is full" })));
      expect(old).toMatchObject({ category: "no-time", reasonText: "Plan is full" });
      const free = toDecision(input(ev("case.decided", "k1", { answer: "no", reason: "Too costly", note: "Ask in spring" })));
      expect(free).toMatchObject({ category: "other", reasonText: "Too costly - Ask in spring" });
    });

    it("a yes or an open case has neither", () => {
      expect(toDecision(input(ev("case.decided", "k1", { answer: "yes" })))).toMatchObject({ answer: "yes", category: null, reasonText: "" });
      expect(toDecision(input())).toMatchObject({ answer: null, category: null, reasonText: "" });
    });

    it("the sample decision lines carry the category and the text of a no", () => {
      const s = state([raise("f"), ev("case.decided", "f", { answer: "no", reason: "wrong department", note: "Try Quality" })]);
      const lines = sampleDecisionLines(s.cases.filter((x) => x.id === "f"), s, [], { period: "all", answer: "", project: "", q: "" }, (day) => "day " + day);
      expect(lines[0]).toMatchObject({ answer: "no", category: "wrong-department", reasonText: "Try Quality" });
      const yes = state([raise("g"), ev("case.decided", "g", { answer: "yes", reason: "Go", projectId: "pjg", lead: "L", title: "G" })]);
      expect(sampleDecisionLines(yes.cases.filter((x) => x.id === "g"), yes, [], { period: "all", answer: "", project: "", q: "" }, (day) => "day " + day)[0]).toMatchObject({ category: null, reasonText: "" });
    });
  });

  describe("the discussion", () => {
    const talking = (declined: string[], rounds: { day: number }[] = []): Pick<ReducedCase, "status" | "discussion"> => ({
      status: "discussion",
      discussion: {
        startedDay: 2, by: "T. Vogel", byUserId: "u_tv", invited: [], invitedUserIds: ["u_a", "u_b", "u_c"], missing: "", rounds: rounds as never,
        round: 1, ready: false, lastDay: 9, declinedUserIds: declined,
      },
    });
    const me = (id: string) => meFor(id, LOCAL_SEED.seats);

    it("invitedTo leaves out someone who declined", () => {
      expect(invitedTo(talking([]), me("u_a"))).toBe(true);
      expect(invitedTo(talking(["u_a"]), me("u_a"))).toBe(false);
      expect(invitedTo(talking(["u_a"]), me("u_b"))).toBe(true);
      expect(invitedTo({ ...talking([]), status: "open" }, me("u_b"))).toBe(false);
    });

    it("noViewYet lists the invitees with no comment since the round began, and none who declined", () => {
      const c = talking(["u_c"]);
      expect(noViewYet(c, [])).toEqual(["u_a", "u_b"]);
      expect(noViewYet(c, [{ byUserId: "u_a", day: 3 }])).toEqual(["u_b"]);
      // A comment from before the discussion began does not count.
      expect(noViewYet(c, [{ byUserId: "u_a", day: 1 }])).toEqual(["u_a", "u_b"]);
      // After a check-in the round began that day: an older comment is no view for this round.
      const later = talking([], [{ day: 5 }]);
      expect(noViewYet(later, [{ byUserId: "u_a", day: 4 }, { byUserId: "u_b", day: 5 }])).toEqual(["u_a", "u_c"]);
      expect(noViewYet({ discussion: null }, [])).toEqual([]);
    });
  });
});
