// SEE-B1: what a raise keeps of its "raised before?" answer and what the server keeps of a raise's new fields, and the note of a merge
// (plan SEE, D15, D16, D23). prepareCaseAppend gets the database as a pair of functions, so the rules run here on states built with the reducer.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { MERGE_NOTE_MAX } from "@/features/cases/links";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { LOCAL_SEED } from "@/features/demo";
import { PEOPLE, PROBLEMS, PROMISE_DAYS, ROLES, ROUTES } from "@/features/demo/seed";
import type { Seed } from "@/features/demo/types";
import { evaluate } from "@/features/evaluate";
import { translate } from "@/i18n";
import type { BrainProposal } from "@/features/routing/brain";
import { prepareCaseAppend, type CaseAppendDeps } from "@/server/actions/append/case";
import type { AppendCtx } from "@/server/actions/append/shared";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_o", sort: 0 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_me", sort: 1 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats };
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}): CaseEvent =>
  ({ id: "ap" + n++, ts: 0, day: 1, type, actor, actorUserId, target, payload });
const raised = (id: string, by: string) => ev("case.raised", by, by, id, { kind: "idea", title: `Idea ${id}`, routeId: "r2", visibility: "everyone" });

// What the viewer "me" has to do with the cases: their own no, someone else's case, their own yes, their own withdrawn idea, their own undecided one.
const events: CaseEvent[] = [
  raised("c_myno", "u_me"), ev("case.decided", "Owner", "u_o", "c_myno", { answer: "no", category: "no-fit", reason: "x".repeat(60) }),
  raised("c_theirs", "u_other"), ev("case.decided", "Owner", "u_o", "c_theirs", { answer: "no", category: "no-fit", reason: "x".repeat(60) }),
  raised("c_myyes", "u_me"), ev("case.decided", "Owner", "u_o", "c_myyes", { answer: "yes" }),
  raised("c_mywithdrawn", "u_me"), ev("case.withdrawn", "u_me", "u_me", "c_mywithdrawn", {}),
  raised("c_myopen", "u_me"),
  raised("c_private", "u_other"),
];
const state: State = reduce(SEED, { events, day: 1 });
const seed = { ...LOCAL_SEED, seats } as Seed;

/** The database as three functions: the viewer may open every case but c_private, the reduced case is the state's, and `absorbing` are the cases another case was merged into. */
const deps = (blocked: readonly string[] = ["c_private"], absorbing: readonly string[] = []): CaseAppendDeps => ({
  openable: async (_company, _viewer, id) => state.cases.some((c) => c.id === id) && !blocked.includes(id),
  reducedCases: async (_c, ids) => state.cases.filter((c) => ids.includes(c.id)),
  mergedInto: async (_company, caseId) => absorbing.includes(caseId),
});
const ctx = (type: AppendCtx["type"], target: string | null, payload: EventPayload, s: State = state): AppendCtx =>
  ({ companyId: "co", viewer: { userId: "u_me", role: "member" }, type, target, payload, state: s, seed, locale: "en" });
const raise = async (payload: EventPayload) => {
  const out = await prepareCaseAppend(ctx("case.raised", "c_new", { title: "A better idea", ...payload }), deps());
  if (!out.ok) throw new Error(out.error);
  return out.payload;
};

describe("SEE append and raise", () => {
  describe("evaluate", () => {
    const cases = [{ id: "c2", title: "Night shift has no one who can sign a €300 parts order", from: "S. Dahl", age: 4, open: true }, { id: "c3", title: "Rig booking", from: "x", age: 1, open: true }];
    const ectx = { routes: ROUTES, people: PEOPLE, personas: ROLES, problems: PROBLEMS, cases, promiseDays: PROMISE_DAYS, goals: DEMO_GOALS, spend: DEMO_RULES.spend };
    const who = { name: "J. Schmidt", line: "Production, Line 3", handle: "Anonymous #4471" };
    const idea = (text: string) => ({ kind: "idea" as const, text, affected: [], attachments: 0, who });
    const brain = (over: Partial<BrainProposal> = {}): BrainProposal =>
      ({ proposal: { routeId: "r1", confidence: 90, source: "llm", version: "brain-route-v1" }, reason: "A small parts order is spend.", sameAs: null, related: null, ...over });

    it("puts the case a keyword match found into the proposal as sameAs", () => {
      const e = evaluate(idea("Night shift has no one who can sign a €300 parts order for the belt"), ectx);
      expect(e.sameAs?.id).toBe("c2");
      expect(e.payload.proposal).toMatchObject({ source: "keywords", sameAs: "c2", related: [] });
    });

    it("takes the brain's answer when it has one: the case it named, and a related case that is a known one", () => {
      const e = evaluate(idea("Nights cannot approve a replacement belt"), ectx, brain({ sameAs: "c2", related: "c3" }));
      expect(e.payload.proposal).toMatchObject({ source: "llm", sameAs: "c2", related: ["c3"] });
    });

    it("drops a related case that is not a known one, and a sameAs the brain did not name", () => {
      const unknown = evaluate(idea("Nights cannot approve a replacement belt"), ectx, brain({ sameAs: "c2", related: "c99" }));
      expect(unknown.payload.proposal.related).toEqual([]);
      const none = evaluate(idea("Nights cannot approve a replacement belt"), ectx, brain());
      expect(none.payload.proposal).toMatchObject({ sameAs: null, related: [] });
    });

    it("has no sameAs without a match, and none when the match has no id", () => {
      const e = evaluate(idea("Reserve the endurance rig on Fridays for unscheduled trials"), { ...ectx, cases: [] });
      expect(e.payload.proposal).toMatchObject({ sameAs: null, related: [] });
      const noId = evaluate(idea("Night shift has no one who can sign a €300 parts order for the belt"), { ...ectx, cases: [{ title: cases[0].title, from: "S. Dahl", age: 4, open: true }] });
      expect(noId.sameAs).not.toBeNull();
      expect(noId.payload.proposal.sameAs).toBeNull();
    });
  });

  describe("a raise", () => {
    it("keeps sameAs and related when they name cases the person may open, other than the new one", async () => {
      const p = await raise({ proposal: { routeId: "r2", confidence: 80, source: "keywords", version: "v1", sameAs: "c_theirs", related: ["c_myopen", "c_myno"] } });
      expect(p.proposal).toMatchObject({ sameAs: "c_theirs", related: ["c_myopen", "c_myno"] });
    });

    it("drops what names an unknown case, the new case itself, a case the person may not open, or no string, and never refuses the raise", async () => {
      for (const sameAs of ["c_nope", "c_new", "c_private", 5, "", null]) {
        const p = await raise({ proposal: { routeId: "r2", confidence: 80, source: "keywords", version: "v1", sameAs: sameAs as never, related: [] } });
        expect(p.proposal, String(sameAs)).not.toHaveProperty("sameAs");
        expect(p.proposal).toMatchObject({ routeId: "r2", confidence: 80 });
      }
      const p = await raise({ proposal: { routeId: "r2", confidence: 80, source: "keywords", version: "v1", related: ["c_nope", "c_new", "c_private", "c_theirs", "c_theirs", 5 as never] } });
      expect(p.proposal?.related).toEqual(["c_theirs"]);
      // No proposal at all is no problem either.
      expect(await raise({})).toMatchObject({ title: "A better idea" });
    });

    it("keeps follows only for the person's own no", async () => {
      expect((await raise({ follows: "c_myno" })).follows).toBe("c_myno");
      for (const follows of ["c_theirs", "c_myyes", "c_mywithdrawn", "c_myopen", "c_nope", "c_private", "c_new", 5, ""]) {
        const p = await raise({ follows: follows as never });
        expect(p, String(follows)).not.toHaveProperty("follows");
        expect(p.title).toBe("A better idea");
      }
    });

    it("does not touch the other fields of the raise", async () => {
      const sent: EventPayload = { title: "A better idea", body: "text", routeId: "r2", assignee: "Owner", visibility: "private", attachments: 2, proposal: { routeId: "r2", confidence: 80, source: "llm", version: "v1" } };
      const out = await prepareCaseAppend(ctx("case.raised", "c_new", sent), deps());
      expect(out).toEqual({ ok: true, payload: sent });
    });

    it("a person who may not open the case a raise looked like gets the same result as for an unknown one", async () => {
      const closed = await prepareCaseAppend(ctx("case.raised", "c_new", { proposal: { routeId: "r2", confidence: 1, source: "keywords", version: "v1", sameAs: "c_theirs" } }), deps(["c_theirs"]));
      const unknown = await prepareCaseAppend(ctx("case.raised", "c_new", { proposal: { routeId: "r2", confidence: 1, source: "keywords", version: "v1", sameAs: "c_zzz" } }), deps());
      expect(closed).toEqual(unknown);
    });
  });

  describe("a merge and a link", () => {
    it("trims the note of a merge and cuts it to 300 characters", async () => {
      const merge = async (note: unknown) => {
        const out = await prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_theirs", note: note as string }), deps());
        if (!out.ok) throw new Error(out.error);
        return out.payload;
      };
      expect((await merge("  The same line, raised twice  ")).note).toBe("The same line, raised twice");
      expect((await merge("x".repeat(500))).note).toBe("x".repeat(MERGE_NOTE_MAX));
      expect(MERGE_NOTE_MAX).toBe(300);
      expect((await merge("   " + "y".repeat(400))).note).toBe("y".repeat(300));
      expect(await merge("   ")).not.toHaveProperty("note");
      expect((await merge(undefined)).note).toBeUndefined();
    });

    it("refuses to merge a case that another case was merged into, with the merge message (D25)", async () => {
      const merge = () => prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_theirs" }), deps(["c_private"], ["c_myopen"]));
      expect(await merge()).toEqual({ ok: false, error: translate("en", "cases.permMerge") });
      // Nothing absorbed: the same merge goes through, and a case that absorbed another is still a fine destination.
      expect((await prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_theirs" }), deps())).ok).toBe(true);
      expect((await prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_theirs" }), deps(["c_private"], ["c_theirs"]))).ok).toBe(true);
      // A link is not a merge: it is not refused for it.
      expect((await prepareCaseAppend(ctx("case.linked", "c_myopen", { to: "c_theirs" }), deps(["c_private"], ["c_myopen"]))).ok).toBe(true);
    });

    it("adds the other case to the state only when the person may open it, so mayAppend finds the same nothing for every other", async () => {
      const s: State = { ...state, cases: state.cases.filter((c) => c.id !== "c_theirs") };
      const open = await prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_theirs" }, s), deps());
      expect(open.ok).toBe(true);
      expect(s.cases.some((c) => c.id === "c_theirs")).toBe(true);
      for (const id of ["c_private", "c_nope", "c_myopen"]) {
        const t: State = { ...state, cases: [...state.cases.filter((c) => c.id !== "c_private")] };
        await prepareCaseAppend(ctx("case.linked", "c_myopen", { to: id }, t), deps());
        expect(t.cases.some((c) => c.id === "c_private"), id).toBe(false);
      }
      // A case the log carried but the person may not open is taken out again.
      const withPrivate: State = { ...state, cases: [...state.cases] };
      expect(withPrivate.cases.some((c) => c.id === "c_private")).toBe(true);
      await prepareCaseAppend(ctx("case.merged", "c_myopen", { into: "c_private" }, withPrivate), deps());
      expect(withPrivate.cases.some((c) => c.id === "c_private")).toBe(false);
    });

    it("refuses a merge or a link whose own case the person may not open, like a case that is not there", async () => {
      const out = await prepareCaseAppend(ctx("case.merged", "c_private", { into: "c_theirs" }), deps());
      expect(out).toEqual({ ok: false, error: "No such case." });
      expect(await prepareCaseAppend(ctx("case.linked", "c_private", { to: "c_theirs" }), deps())).toEqual({ ok: false, error: "No such case." });
    });

    it("leaves every other event to the checks that were there", async () => {
      const sent: EventPayload = { text: "A comment" };
      expect(await prepareCaseAppend(ctx("case.commented", "c_myopen", sent), deps())).toEqual({ ok: true, payload: sent });
    });
  });
});
