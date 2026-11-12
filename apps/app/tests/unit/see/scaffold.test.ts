// SEE-G1 (B1): the Gerüst of plan SEE - the reducer keeps follows and followedBy, sameAs and related, merges an undecided case
// into another and links two cases both ways, and ignores what breaks D17 (plan SEE, D15 to D17, D21). Literal seat, route and
// events; the reducer is the only code under test.
import { describe, expect, it } from "vitest";
import { caseActs } from "@/components/dashboard/demo/case-acts";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import type { SeatRow } from "@/features/auth/identity";
import { emptyLog, type CaseEvent, type CaseEventType, type EventPayload } from "@/features/cases/events";
import { CASE_EVENT_TYPES, type CaseProposal } from "@/features/cases/events/case";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import type { Route, Seed } from "@/features/demo/types";
import { LOOP_TYPES } from "@/features/notify/plan";
import { caseSee } from "@/i18n/messages/caseSee";

const SEATS: SeatRow[] = [{ id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 }];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: null, deputyRoleId: null,
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS };

let n = 0;
const ev = (type: CaseEventType, by: string, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "s" + n++, ts: 0, type, actor: by === "u_own" ? "T. Vogel" : by, actorUserId: by, target, payload, day });
const raise = (id: string, by = "u_" + id, day = 0, extra: EventPayload = {}) =>
  ev("case.raised", by, id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", ...extra }, day);
const merge = (id: string, into: string, day = 1, note?: string) => ev("case.merged", "u_own", id, { into, ...(note !== undefined ? { note } : {}) }, day);
const link = (id: string, to: string, day = 1) => ev("case.linked", "u_own", id, { to }, day);
const no = (id: string, day = 1) => ev("case.decided", "u_own", id, { answer: "no", category: "no-fit", reason: "A reason that is long enough to count" }, day);
const yes = (id: string, day = 1) => ev("case.decided", "u_own", id, { answer: "yes", projectId: "p_" + id, lead: "T. Vogel", leadUserId: "u_own" }, day);

const run = (events: CaseEvent[], day = 10): State => reduce(SEED, { events, day });
const by = (s: State, id: string) => s.cases.find((c) => c.id === id)!;

describe("SEE scaffold", () => {
  it("a freshly raised case has no follow-up, no look-alike, no merge and no link", () => {
    expect(by(run([raise("ca")]), "ca")).toMatchObject({ follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [] });
  });

  describe("follows", () => {
    it("a raise that follows an existing case is linked both ways: follows on the new case, followedBy on the old one", () => {
      const s = run([raise("ca"), no("ca"), raise("cb", "u_ca", 3, { follows: "ca" }), raise("cc", "u_ca", 4, { follows: "ca" })]);
      expect(by(s, "cb").follows).toBe("ca");
      expect(by(s, "ca").followedBy).toEqual(["cb", "cc"]);
      expect(by(s, "ca").decided?.answer).toBe("no"); // the old case is not reopened and keeps its no
    });

    it("follows is dropped for a case that does not exist (yet) and for the case itself", () => {
      const s = run([raise("ca", "u_ca", 0, { follows: "ca" }), raise("cb", "u_cb", 1, { follows: "c_unknown" }), raise("cc", "u_cc", 2, { follows: "cd" }), raise("cd")]);
      for (const id of ["ca", "cb", "cc"]) expect(by(s, id).follows, id).toBeNull();
      expect(by(s, "cd").followedBy).toEqual([]);
    });
  });

  describe("sameAs and related", () => {
    const proposal = (p: Partial<CaseProposal>): EventPayload => ({ proposal: { routeId: "r1", confidence: 80, source: "keywords", version: "v1", ...p } });

    it("keep the ids of cases that exist, never the case itself, without duplicates", () => {
      const s = run([raise("ca"), raise("cb"), raise("cc", "u_cc", 1, proposal({ sameAs: "ca", related: ["cb", "ca", "cb", "c_unknown", "cc"] }))]);
      expect(by(s, "cc")).toMatchObject({ sameAs: "ca", related: ["cb", "ca"] });
      // the matched case is untouched
      expect(by(s, "ca")).toMatchObject({ sameAs: null, related: [], followedBy: [], links: [] });
    });

    it("are empty for an unknown or own id, a null sameAs and a proposal without them", () => {
      const s = run([raise("ca"), raise("cb", "u_cb", 1, proposal({ sameAs: "c_unknown" })), raise("cc", "u_cc", 1, proposal({ sameAs: "cc" })), raise("cd", "u_cd", 1, proposal({ sameAs: null })), raise("ce", "u_ce", 1, proposal({}))]);
      for (const id of ["cb", "cc", "cd", "ce"]) expect(by(s, id), id).toMatchObject({ sameAs: null, related: [] });
    });
  });

  describe("case.merged", () => {
    it("closes an undecided case into another: status merged, archived, not open, never late, its clock stopped on the merge day", () => {
      const s = run([raise("ca"), raise("cb"), merge("ca", "cb", 2, "  Same fault  ")], 20);
      const a = by(s, "ca");
      expect(a).toMatchObject({ status: "merged", archived: true, open: false, overdue: false, clock: 2, decided: null });
      expect(a.merged).toEqual({ into: "cb", day: 2, by: "T. Vogel", byUserId: "u_own", note: "Same fault" });
      expect(by(s, "cb").mergedIn).toEqual([{ id: "ca", userId: "u_ca", day: 2 }]); // the raiser, by user id, with the merge day
      expect(by(s, "cb")).toMatchObject({ status: "open", open: true });
      expect(by(run([raise("ca"), raise("cb")], 20), "ca").clock).toBe(20); // it would have run on
    });

    it("keeps the note to 300 characters, and works on an asked case and a case in discussion", () => {
      expect(by(run([raise("ca"), raise("cb"), merge("ca", "cb", 1, "x".repeat(400))]), "ca").merged?.note).toHaveLength(300);
      const asked = run([raise("ca"), raise("cb"), ev("case.asked", "u_own", "ca", { text: "Which line?" }, 1), merge("ca", "cb", 3)], 20);
      expect(by(asked, "ca")).toMatchObject({ status: "merged", clock: 1, pausedSince: null }); // 3 - 0 - 2 paused days
      const talk = run([raise("ca"), raise("cb"), ev("case.discussion", "u_own", "ca", { invited: ["x"], missing: "y" }, 1), merge("ca", "cb", 2)]);
      expect(by(talk, "ca").status).toBe("merged");
    });

    it("onto a decided target is kept: an idea already in a project absorbs the repeat", () => {
      const s = run([raise("ca"), raise("cb"), yes("cb"), merge("ca", "cb", 2)]);
      expect(by(s, "ca").status).toBe("merged");
      expect(by(s, "cb")).toMatchObject({ status: "decided", mergedIn: [{ id: "ca", userId: "u_ca", day: 2 }] });
    });

    it("is ignored for a decided, withdrawn or merged case, into itself, into a merged or withdrawn case and into an unknown one", () => {
      const ignored = (events: CaseEvent[], id: string) => expect(by(run(events), id).merged, id).toBeNull();
      ignored([raise("ca"), raise("cb"), no("ca"), merge("ca", "cb", 2)], "ca"); // decided
      ignored([raise("ca"), raise("cb"), yes("ca"), merge("ca", "cb", 2)], "ca");
      ignored([raise("ca"), raise("cb"), ev("case.withdrawn", "u_ca", "ca", {}, 1), merge("ca", "cb", 2)], "ca"); // withdrawn
      ignored([raise("ca"), raise("cb"), merge("ca", "ca", 1)], "ca"); // into itself
      ignored([raise("ca"), raise("cb"), raise("cc"), merge("cb", "cc", 1), merge("ca", "cb", 2)], "ca"); // into a merged case
      ignored([raise("ca"), raise("cb"), ev("case.withdrawn", "u_cb", "cb", {}, 1), merge("ca", "cb", 2)], "ca"); // into a withdrawn case
      ignored([raise("ca"), merge("ca", "c_unknown", 1)], "ca");
      ignored([raise("ca"), ev("case.merged", "u_own", "ca", {}, 1)], "ca"); // no target
      // merging twice changes nothing: the first merge stands
      const twice = run([raise("ca"), raise("cb"), raise("cc"), merge("ca", "cb", 1), merge("ca", "cc", 2)]);
      expect(by(twice, "ca").merged?.into).toBe("cb");
      expect(by(twice, "cc").mergedIn).toEqual([]);
      expect(by(twice, "cb").mergedIn).toHaveLength(1);
    });

    it("never forms a cycle or a chain: after A merged into B, B cannot merge into A, nor into another case", () => {
      const s = run([raise("ca"), raise("cb"), raise("cc"), merge("ca", "cb", 1), merge("cb", "ca", 1), merge("cb", "cc", 2)]);
      expect(by(s, "cb")).toMatchObject({ merged: null, status: "open" });
      expect(by(s, "ca").merged?.into).toBe("cb"); // the destination of an earlier merge never changes
      expect(by(s, "ca").mergedIn).toEqual([]);
      expect(by(s, "cc").mergedIn).toEqual([]);
      // other cases may still merge into the destination, and the same-day order decides between two merges
      const more = run([raise("ca"), raise("cb"), raise("cc"), merge("ca", "cb", 1), merge("cc", "cb", 1)]);
      expect(by(more, "cb").mergedIn.map((m) => m.id)).toEqual(["ca", "cc"]);
      const sameDay = run([raise("ca"), raise("cb"), merge("cb", "ca", 1), merge("ca", "cb", 1)]);
      expect(by(sameDay, "cb").merged?.into).toBe("ca"); // the first in the log wins
      expect(by(sameDay, "ca").merged).toBeNull();
    });

    it("a merged case takes no decision", () => {
      const s = run([raise("ca"), raise("cb"), merge("ca", "cb", 1), no("ca", 2)]);
      expect(by(s, "ca")).toMatchObject({ status: "merged", decided: null, decisions: [] });
    });
  });

  describe("case.linked", () => {
    it("marks two cases as related, both ways, and leaves them as they are", () => {
      const s = run([raise("ca"), raise("cb"), link("ca", "cb")]);
      expect(by(s, "ca")).toMatchObject({ links: ["cb"], status: "open" });
      expect(by(s, "cb")).toMatchObject({ links: ["ca"], status: "open" });
    });

    it("is ignored for an unknown case, itself, a merged case on either side, a withdrawn case that writes it, and a second link of the pair", () => {
      const links = (events: CaseEvent[], id: string) => by(run(events), id).links;
      expect(links([raise("ca"), link("ca", "c_unknown")], "ca")).toEqual([]);
      expect(links([raise("ca"), link("ca", "ca")], "ca")).toEqual([]);
      expect(links([raise("ca"), raise("cb"), raise("cc"), merge("ca", "cc"), link("ca", "cb", 2)], "cb")).toEqual([]); // this one merged
      expect(links([raise("ca"), raise("cb"), raise("cc"), merge("cb", "cc"), link("ca", "cb", 2)], "ca")).toEqual([]); // the other merged
      expect(links([raise("ca"), raise("cb"), ev("case.withdrawn", "u_ca", "ca", {}, 1), link("ca", "cb", 2)], "cb")).toEqual([]); // this one withdrawn
      const twice = [raise("ca"), raise("cb"), link("ca", "cb"), link("ca", "cb", 2), link("cb", "ca", 3)];
      expect(links(twice, "ca")).toEqual(["cb"]);
      expect(links(twice, "cb")).toEqual(["ca"]);
      // a withdrawn other case may still be linked to
      expect(links([raise("ca"), raise("cb"), ev("case.withdrawn", "u_cb", "cb", {}, 1), link("ca", "cb", 2)], "ca")).toEqual(["cb"]);
    });

    it("a link and a merge are no notice: neither event is a loop type", () => {
      for (const t of ["case.merged", "case.linked"]) {
        expect(CASE_EVENT_TYPES, t).toContain(t);
        expect(APP_EVENT_TYPES, t).toContain(t);
        expect(LOOP_TYPES.has(t), t).toBe(false);
      }
    });
  });

  describe("demo acts and strings", () => {
    const calls: { type: string; target: string | null; payload: unknown }[] = [];
    const deps: ActDeps = {
      emit: (type, target, payload) => { calls.push({ type, target, payload }); return Promise.resolve({ ok: true }); },
      S: { cases: [] } as unknown as State, seed: { seats: [] } as unknown as Seed, serverMode: true, slug: "acme", actor: "T. Vogel", actorUserId: "u_own", log: emptyLog(),
    };
    it("merge and link are thin wrappers over emit", () => {
      const acts = caseActs(deps);
      acts.merge("ca", "cb", "Same fault");
      acts.merge("ca", "cb");
      acts.link("ca", "cb");
      expect(calls).toStrictEqual([
        { type: "case.merged", target: "ca", payload: { into: "cb", note: "Same fault" } },
        { type: "case.merged", target: "ca", payload: { into: "cb" } },
        { type: "case.linked", target: "ca", payload: { to: "cb" } },
      ]);
    });

    it("caseSee has every key of the journey, the no block, the follow-up and the merge in German and English", () => {
      const keys = ["stageRaised", "stageDesk", "stageDiscussion", "stageDecision", "stageProject", "outcomeYes", "outcomeNo", "outcomeWithdrawn", "outcomeMerged", "outcomeCameBack", "outcomeNotNeeded",
        "projectSettingUp", "projectStarted", "projectDone", "projectMeasured", "projectRecognised", "projectStopped", "decisionExpected", "decisionExpectedLate", "decidedBeforeAnswer",
        "noTitle", "revisitOn", "duplicateOfLink", "secondLookUntil", "secondLookAsked", "secondLookKept", "secondLookReopened", "startBetter", "followsUp", "followedBy", "relatedTo", "mergedInto",
        "mergedIn", "maybeSame", "mergeInto", "linkRelated", "pickSame", "pickRelated", "mergeNote", "inactive"];
      for (const lang of ["en", "de"] as const) for (const k of keys) expect((caseSee[lang] as Record<string, string>)[k], `${lang}.${k}`).toBeTruthy();
      expect(caseSee.en.stageDesk).toBe("With the desk");
      expect(caseSee.en.outcomeNo).toBe("No · {category}");
      expect(caseSee.en.decisionExpectedLate).toBe("Decision was expected by {date}");
      expect(caseSee.en.mergedIn).toBe("{count} merged into this");
    });
  });
});
