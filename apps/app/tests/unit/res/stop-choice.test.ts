// RES-P1 (B1): which ideas stopping a project can send back, and the events that does (plan RES, D24). Cases are reduced from a log, with
// the later fates of a case set by hand so a reducer change cannot move them.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { notEligible, reopenEvents, stopChoice } from "@/features/projects/stop-choice";

const seats: SeatRow[] = [{ id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 }];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, day = 0, by = "u_own"): CaseEvent => ({ id: "x" + n++, ts: 0, type, actor: by, actorUserId: by, target, payload, day });
const raise = (id: string) => ev("case.raised", id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "Owner" }, 0, "u_au");
const yes = (id: string, projectId = "p_one") => ev("case.decided", id, { answer: "yes", projectId, lead: "Lead", leadUserId: "u_lead", title: "Project" }, 1);

const stateOf = (...events: CaseEvent[]): State => reduce(SEED, { events, day: 5 });
const projectOf = (s: State, id = "p_one") => s.projects.find((p) => p.id === id)!;
const caseOf = (s: State, id: string) => s.cases.find((c) => c.id === id)!;

describe("RES stop choice", () => {
  describe("with one source case", () => {
    const s = stateOf(raise("c_a"), yes("c_a"));

    it("lists the case whose latest decision is the yes of this project, with its title", () => {
      expect(stopChoice(projectOf(s), s)).toEqual({ cases: [{ id: "c_a", label: "Idea c_a" }] });
      expect(notEligible(projectOf(s), s)).toEqual([]);
    });

    it("keeps the idea archived by default: no events for keep", () => {
      expect(reopenEvents(projectOf(s), s, "keep", 5, 5)).toEqual([]);
    });

    it("returning gives one case.reopened with why stopped and a new answer date: today plus the answer length", () => {
      expect(reopenEvents(projectOf(s), s, "return", 5, 5)).toEqual([{ type: "case.reopened", target: "c_a", payload: { why: "stopped", dueDay: 10 } }]);
      expect(reopenEvents(projectOf(s), s, "return", 20, 3)[0].payload).toEqual({ why: "stopped", dueDay: 23 });
    });
  });

  describe("with two source cases", () => {
    // c_b joined the project that c_a opened.
    const s = stateOf(raise("c_b"), raise("c_a"), yes("c_a"), yes("c_b"));

    it("lists both, in case-id order, and returns both", () => {
      expect(projectOf(s).sources.sort()).toEqual(["c_a", "c_b"]);
      expect(stopChoice(projectOf(s), s).cases.map((c) => c.id)).toEqual(["c_a", "c_b"]);
      expect(reopenEvents(projectOf(s), s, "return", 5, 5).map((e) => [e.type, e.target, e.payload.why])).toEqual([["case.reopened", "c_a", "stopped"], ["case.reopened", "c_b", "stopped"]]);
    });

    it("a source decided again leaves the list, is named as not eligible, and is not reopened", () => {
      const again = stateOf(raise("c_b"), raise("c_a"), yes("c_a"), yes("c_b"));
      caseOf(again, "c_b").decided = { ...caseOf(again, "c_b").decided!, answer: "no", projectId: null };
      expect(stopChoice(projectOf(again), again).cases.map((c) => c.id)).toEqual(["c_a"]);
      expect(notEligible(projectOf(again), again).map((c) => c.id)).toEqual(["c_b"]);
      expect(reopenEvents(projectOf(again), again, "return", 5, 5).map((e) => e.target)).toEqual(["c_a"]);
    });

    it("a source whose yes now names another project, a withdrawn one and one already open again are left alone", () => {
      const other = stateOf(raise("c_b"), raise("c_a"), yes("c_a"), yes("c_b"));
      caseOf(other, "c_b").decided = { ...caseOf(other, "c_b").decided!, projectId: "p_other" };
      expect(stopChoice(projectOf(other), other).cases.map((c) => c.id)).toEqual(["c_a"]);

      const withdrawn = stateOf(raise("c_b"), raise("c_a"), yes("c_a"), yes("c_b"));
      caseOf(withdrawn, "c_b").withdrawn = { day: 3, by: "x", byUserId: null, note: "" };
      expect(stopChoice(projectOf(withdrawn), withdrawn).cases.map((c) => c.id)).toEqual(["c_a"]);

      const reopened = stateOf(raise("c_b"), raise("c_a"), yes("c_a"), yes("c_b"));
      caseOf(reopened, "c_b").status = "open";
      caseOf(reopened, "c_b").decided = null;
      expect(stopChoice(projectOf(reopened), reopened).cases.map((c) => c.id)).toEqual(["c_a"]);
    });
  });

  it("a case that is not a source of the project is never listed", () => {
    const s = stateOf(raise("c_a"), yes("c_a"), raise("c_z"), yes("c_z", "p_two"));
    expect(stopChoice(projectOf(s), s).cases.map((c) => c.id)).toEqual(["c_a"]);
    expect(stopChoice(projectOf(s, "p_two"), s).cases.map((c) => c.id)).toEqual(["c_z"]);
  });

  it("a legacy yes without a project id is no source", () => {
    const s = stateOf(raise("c_a"), yes("c_a"));
    expect(stopChoice({ id: "p_none", sources: ["c_a"] }, s).cases).toEqual([]);
  });
});
