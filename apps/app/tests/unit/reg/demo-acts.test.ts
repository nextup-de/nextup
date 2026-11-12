// REG-D1: the demo's case and project acts live in their own files (plan REG, decisions D5 and D14). The table below is
// what DemoProvider's `act` emitted before the split, written from its bodies; fixed literals only, never reduce().
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActDeps, Emit } from "@/components/dashboard/demo/act-deps";
import { caseActs } from "@/components/dashboard/demo/case-acts";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import type { EventLog, EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import { SAMPLE_PREFIX } from "@/features/demo/sample-data";
import { DEMO_JIRA_KEY, DEMO_JIRA_SITE } from "@/features/projects/views";

// The local-mode affect writes through updateLog: record the log it would store instead of touching localStorage.
const stored = vi.hoisted(() => ({ calls: [] as { slug: string; next: unknown }[], before: { events: [] as unknown[], day: 0 } }));
vi.mock("@/lib/demo-log", () => ({
  updateLog: (slug: string, fn: (prev: typeof stored.before) => unknown) => { stored.calls.push({ slug, next: fn(stored.before) }); },
}));

type Call = { type: string; target: string | null; payload: EventPayload | undefined; id: string | undefined; draftId: string | undefined };

const link = (system: string, key: string, stepId: string | null) => ({ system, url: "", key, stepId, day: 0 });
const step = (id: string, external: boolean) => ({ id, text: "Step " + id, external: external ? { system: "jira", key: "X-1" } : null });

const S = {
  day: 0,
  cases: [{ id: "c_1", title: "A case" }, { id: SAMPLE_PREFIX + "c_2", title: "A sample case" }],
  ideas: [{ id: "i_1", cosigners: [{ userId: "u_x" }] }],
  projects: [
    { id: "p_1", links: [], steps: [step("s_1", false), step("s_2", false), step("s_3", true)] },
    { id: "p_2", links: [link("jira", DEMO_JIRA_KEY + "-7", null), link("jira", "OTHER-1", null), link("url", DEMO_JIRA_KEY + "-8", null)], steps: [] },
    { id: "p_3", links: [link("jira", DEMO_JIRA_KEY + "-9", null)], steps: [step("s_4", false)] },
  ],
} as unknown as State;
const seed = { seats: [{ id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 0 }] } as unknown as Seed;

function deps(over: Partial<ActDeps> = {}): { d: ActDeps; calls: Call[] } {
  const calls: Call[] = [];
  const emit: Emit = (type, target, payload, id, draftId) => {
    calls.push({ type, target, payload, id, draftId });
    return Promise.resolve({ ok: true });
  };
  const log: EventLog = { events: [], day: 0 };
  return { d: { emit, S, seed, serverMode: false, slug: "acme", actor: "T. Vogel", actorUserId: "u_tv", log, ...over }, calls };
}

/** What one act call emitted: every call, as [type, target, payload]. */
const emitted = (run: (d: ActDeps) => void, over: Partial<ActDeps> = {}) => {
  const { d, calls } = deps(over);
  run(d);
  return calls.map((c) => [c.type, c.target, c.payload] as const);
};
const only = (run: (d: ActDeps) => void, over: Partial<ActDeps> = {}) => {
  const calls = emitted(run, over);
  expect(calls).toHaveLength(1);
  return calls[0];
};
const id = (prefix: string) => expect.stringMatching(new RegExp("^" + prefix + "_[a-z0-9]+$"));

beforeEach(() => { stored.calls.length = 0; stored.before = { events: [], day: 0 }; });

describe("REG demo acts split", () => {
  describe("case acts", () => {
    it("raise mints a c_ id, or takes the caller's, and returns it", () => {
      const { d, calls } = deps();
      const minted = caseActs(d).raise({ title: "T" });
      expect(minted).toMatch(/^c_[a-z0-9]+$/);
      expect(calls).toEqual([{ type: "case.raised", target: minted, payload: { title: "T" }, id: undefined, draftId: undefined }]);
      expect(caseActs(d).raise({ title: "U" }, "c_given")).toBe("c_given");
      expect(calls[1]).toEqual({ type: "case.raised", target: "c_given", payload: { title: "U" }, id: undefined, draftId: undefined });
    });

    it("raiseDraft passes the draft id as the fifth argument and returns emit's promise", async () => {
      const { d, calls } = deps();
      const res = await caseActs(d).raiseDraft({ title: "T" }, "c_1", "d_1");
      expect(res).toEqual({ ok: true });
      expect(calls).toEqual([{ type: "case.raised", target: "c_1", payload: { title: "T" }, id: undefined, draftId: "d_1" }]);
    });

    it("read, decide, hand, ask, answer, withdraw and override emit what they did", () => {
      expect(only((d) => caseActs(d).read("c_1"))).toStrictEqual(["case.read", "c_1", undefined]);
      expect(only((d) => caseActs(d).decide("c_1", "no", "Too costly", "A note"))).toStrictEqual(["case.decided", "c_1", { answer: "no", reason: "Too costly", note: "A note" }]);
      expect(only((d) => caseActs(d).decide("c_1", "yes"))).toStrictEqual(["case.decided", "c_1", { answer: "yes", reason: undefined, note: undefined }]);
      expect(only((d) => caseActs(d).hand("c_1", "seat_hs", "Not mine"))).toStrictEqual(["case.handed", "c_1", { to: "H. Sander", toRoleHolderId: "seat_hs", why: "Not mine" }]);
      expect(only((d) => caseActs(d).hand("c_1", "seat_nobody"))).toStrictEqual(["case.handed", "c_1", { to: "", toRoleHolderId: "seat_nobody", why: undefined }]);
      expect(only((d) => caseActs(d).ask("c_1", "Which shift?"))).toStrictEqual(["case.asked", "c_1", { text: "Which shift?" }]);
      expect(only((d) => caseActs(d).answer("c_1", "Late."))).toStrictEqual(["case.answered", "c_1", { text: "Late." }]);
      expect(only((d) => caseActs(d).withdraw("c_1", "Changed my mind"))).toStrictEqual(["case.withdrawn", "c_1", { note: "Changed my mind" }]);
      expect(only((d) => caseActs(d).withdraw("c_1", ""))).toStrictEqual(["case.withdrawn", "c_1", {}]);
      expect(only((d) => caseActs(d).override("c_1", "r1", "r2"))).toStrictEqual(["case.override", "c_1", { proposed: "r1", chosen: "r2" }]);
      expect(only((d) => caseActs(d).override("c_1", null, "r2"))).toStrictEqual(["case.override", "c_1", { proposed: null, chosen: "r2" }]);
    });

    it("comment and rescore are both case.commented; rescore marks it", () => {
      expect(only((d) => caseActs(d).comment("c_1", "Hello"))).toStrictEqual(["case.commented", "c_1", { text: "Hello" }]);
      expect(only((d) => caseActs(d).rescore("c_1", "New facts"))).toStrictEqual(["case.commented", "c_1", { text: "New facts", rescore: true }]);
    });

    it("discuss, invite, revise and checkin emit the discussion stage's events", () => {
      expect(only((d) => caseActs(d).discuss("c_1", ["H. Sander"], "Costs", ["u_hs"]))).toStrictEqual(["case.discussion", "c_1", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "Costs" }]);
      expect(only((d) => caseActs(d).invite("c_1", ["H. Sander"], ["u_hs"]))).toStrictEqual(["case.invited", "c_1", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] }]);
      expect(only((d) => caseActs(d).revise("c_1", "Body", "Title", 4))).toStrictEqual(["case.revised", "c_1", { body: "Body", title: "Title", overall: 4 }]);
      expect(only((d) => caseActs(d).revise("c_1", "Body"))).toStrictEqual(["case.revised", "c_1", { body: "Body", title: undefined, overall: undefined }]);
      expect(only((d) => caseActs(d).checkin("c_1", "decide", ["Costs"], "Ready"))).toStrictEqual(["case.checkin", "c_1", { next: "decide", open: ["Costs"], note: "Ready" }]);
    });

    it("affect on the server emits case.affected with the reason, or case.unaffected once the person is on it, and returns which", () => {
      const { d, calls } = deps({ serverMode: true });
      const acts = caseActs(d);
      expect(acts.affect("c_1", "It hits line 3")).toBe(true);
      expect(acts.affect("c_1")).toBe(true);
      expect(calls.map((c) => [c.type, c.target, c.payload])).toStrictEqual([
        ["case.affected", "c_1", { why: "It hits line 3" }],
        ["case.affected", "c_1", undefined],
      ]);
      const on: EventLog = { events: [{ id: "e1", ts: 0, day: 0, type: "case.affected", actor: "T. Vogel", actorUserId: "u_tv", target: "c_1", payload: {} }], day: 0 };
      const off = deps({ serverMode: true, log: on });
      expect(caseActs(off.d).affect("c_1", "ignored")).toBe(false);
      expect(off.calls.map((c) => [c.type, c.target, c.payload])).toStrictEqual([["case.unaffected", "c_1", undefined]]);
    });

    it("affect in the local demo writes through updateLog with the actor's label and never calls emit", () => {
      const { d, calls } = deps();
      expect(caseActs(d).affect("c_1", "It hits line 3")).toBe(true);
      expect(calls).toEqual([]);
      expect(stored.calls).toHaveLength(1);
      expect(stored.calls[0].slug).toBe("acme");
      const next = stored.calls[0].next as { events: { type: string; actor: string; actorUserId: string; target: string; payload: unknown }[] };
      expect(next.events).toHaveLength(1);
      expect(next.events[0]).toMatchObject({ type: "case.affected", actor: "T. Vogel", actorUserId: "u_tv", target: "c_1", payload: { why: "It hits line 3" } });
      // already on it in the stored log: the same call withdraws
      stored.before = { events: [{ ...next.events[0] }], day: 0 };
      stored.calls.length = 0;
      expect(caseActs(d).affect("c_1")).toBe(false);
      const after = stored.calls[0].next as { events: { type: string }[] };
      expect(after.events.map((e) => e.type)).toEqual(["case.affected", "case.unaffected"]);
    });

    it("accept emits a draft yes with the case title, the actor as decider and a new p_ id, and returns the id", () => {
      const { d, calls } = deps();
      const pid = caseActs(d).accept("c_1", {});
      expect(pid).toMatch(/^p_[a-z0-9]+$/);
      expect(calls).toEqual([{ type: "case.decided", target: "c_1", id: undefined, draftId: undefined,
        payload: { answer: "yes", draft: true, projectId: pid, lead: "T. Vogel", leadUserId: "u_tv", title: "A case" } }]);
    });

    it("accept names who sets it up, joins an open project and carries the raiser line; a sample case gets a sample project id", () => {
      const { d, calls } = deps();
      const joined = caseActs(d).accept("c_1", { lead: { userId: "u_hs", name: "H. Sander" }, join: "p_open", raiserNote: " Thanks " });
      expect(joined).toBe("p_open");
      expect(calls[0].payload).toStrictEqual({ answer: "yes", draft: true, projectId: "p_open", lead: "H. Sander", leadUserId: "u_hs", title: "A case", raiserNote: "Thanks" });
      const sample = caseActs(d).accept(SAMPLE_PREFIX + "c_2", {});
      expect(sample).toMatch(new RegExp("^" + SAMPLE_PREFIX + "p_[a-z0-9]+$"));
      expect(calls[1]).toMatchObject({ type: "case.decided", target: SAMPLE_PREFIX + "c_2", payload: { projectId: sample, title: "A sample case" } });
    });

    it("exposes exactly the case acts, none of the core ones", () => {
      expect(Object.keys(caseActs(deps().d)).sort()).toEqual(
        ["accept", "affect", "answer", "ask", "checkin", "comment", "decide", "discuss", "hand", "invite", "override", "raise", "raiseDraft", "read", "rescore", "revise", "withdraw"]);
    });
  });

  describe("project acts", () => {
    it("member, hand, baseline, start and comment emit what they did", () => {
      expect(only((d) => projectActs(d).member("p_1", { userId: "u_hs", name: "H. Sander" }, true))).toStrictEqual(["project.member", "p_1", { name: "H. Sander", userId: "u_hs", on: true }]);
      expect(only((d) => projectActs(d).member("p_1", { userId: "u_hs", name: "H. Sander" }, false))).toStrictEqual(["project.member", "p_1", { name: "H. Sander", userId: "u_hs", on: false }]);
      expect(only((d) => projectActs(d).hand("p_1", { userId: "u_hs", name: "H. Sander" }, "Moving on"))).toStrictEqual(["project.handed", "p_1", { to: "H. Sander", toUserId: "u_hs", why: "Moving on" }]);
      expect(only((d) => projectActs(d).hand("p_1", { userId: "u_hs", name: "H. Sander" }))).toStrictEqual(["project.handed", "p_1", { to: "H. Sander", toUserId: "u_hs", why: undefined }]);
      expect(only((d) => projectActs(d).baseline("p_1", { metric: "Scrap", unit: "%", value: 9, better: "down", source: "QMS" }))).toStrictEqual(["project.baseline", "p_1", { metric: "Scrap", unit: "%", value: 9, better: "down", source: "QMS" }]);
      expect(only((d) => projectActs(d).baseline("p_1", { none: true, why: "No data" }))).toStrictEqual(["project.baseline", "p_1", { none: true, why: "No data" }]);
      expect(only((d) => projectActs(d).start("p_1"))).toStrictEqual(["project.started", "p_1", undefined]);
      expect(only((d) => projectActs(d).comment("p_1", "Hi"))).toStrictEqual(["project.commented", "p_1", { text: "Hi" }]);
    });

    it("addStep mints an s_ id, emits it and returns it", () => {
      const { d, calls } = deps();
      const sid = projectActs(d).addStep("p_1", "Try it", "H. Sander", 5, "doing", "A note", "u_hs");
      expect(sid).toMatch(/^s_[a-z0-9]+$/);
      expect(calls[0]).toEqual({ type: "project.step.added", target: "p_1", id: undefined, draftId: undefined,
        payload: { stepId: sid, text: "Try it", owner: "H. Sander", ownerUserId: "u_hs", dueDay: 5, to: "doing", note: "A note" } });
      const bare = projectActs(d).addStep("p_1", "Plain");
      expect(calls[1].payload).toStrictEqual({ stepId: bare, text: "Plain", owner: undefined, dueDay: undefined, to: undefined, note: undefined });
    });

    it("moveStep sends before only when given, editStep spreads the change, link defaults its system to url", () => {
      expect(only((d) => projectActs(d).moveStep("p_1", "s_1", "blocked", "Waiting"))).toStrictEqual(["project.step.moved", "p_1", { stepId: "s_1", to: "blocked", why: "Waiting" }]);
      expect(only((d) => projectActs(d).moveStep("p_1", "s_1", "todo", undefined, null))).toStrictEqual(["project.step.moved", "p_1", { stepId: "s_1", to: "todo", why: undefined, before: null }]);
      expect(only((d) => projectActs(d).moveStep("p_1", "s_1", "todo", "Back", "s_2"))).toStrictEqual(["project.step.moved", "p_1", { stepId: "s_1", to: "todo", why: "Back", before: "s_2" }]);
      expect(only((d) => projectActs(d).editStep("p_1", "s_1", { text: "New", dueDay: null, removed: false }))).toStrictEqual(["project.step.edited", "p_1", { stepId: "s_1", text: "New", dueDay: null, removed: false }]);
      expect(only((d) => projectActs(d).link("p_1", "https://x.test/1"))).toStrictEqual(["project.linked", "p_1", { url: "https://x.test/1", system: "url", key: undefined, stepId: undefined }]);
      expect(only((d) => projectActs(d).link("p_1", "https://x.test/2", "jira", "NUP-1", "s_1"))).toStrictEqual(["project.linked", "p_1", { url: "https://x.test/2", system: "jira", key: "NUP-1", stepId: "s_1" }]);
    });

    it("sync in the local demo emits project.sync, then the epic and one issue for each step that has none", () => {
      // two other jira links of this project's key are on p_2 and p_3: the numbering goes on from them
      const calls = emitted((d) => projectActs(d).sync("p_1", true));
      const url = (key: string) => DEMO_JIRA_SITE + "/browse/" + key;
      expect(calls).toStrictEqual([
        ["project.sync", "p_1", { system: "jira", on: true }],
        ["project.linked", "p_1", { system: "jira", key: DEMO_JIRA_KEY + "-3", url: url(DEMO_JIRA_KEY + "-3") }],
        ["project.linked", "p_1", { system: "jira", key: DEMO_JIRA_KEY + "-4", url: url(DEMO_JIRA_KEY + "-4"), stepId: "s_1" }],
        ["project.linked", "p_1", { system: "jira", key: DEMO_JIRA_KEY + "-5", url: url(DEMO_JIRA_KEY + "-5"), stepId: "s_2" }],
      ]);
    });

    it("sync skips the epic when the project has one, and the steps a ticket already covers", () => {
      const withEpic = { ...S, projects: [{ id: "p_1", links: [link("jira", "NUP-1", null)], steps: [step("s_1", false)] }] } as unknown as State;
      const calls = emitted((d) => projectActs(d).sync("p_1", true), { S: withEpic });
      expect(calls.map((c) => [c[0], (c[2] as { stepId?: string; key?: string }).key, (c[2] as { stepId?: string }).stepId])).toStrictEqual([
        ["project.sync", undefined, undefined],
        ["project.linked", "NUP-2", "s_1"],
      ]);
    });

    it("sync emits only project.sync when switched off, on the server, or for an unknown project", () => {
      expect(emitted((d) => projectActs(d).sync("p_1", false))).toStrictEqual([["project.sync", "p_1", { system: "jira", on: false }]]);
      expect(emitted((d) => projectActs(d).sync("p_1", true), { serverMode: true })).toStrictEqual([["project.sync", "p_1", { system: "jira", on: true }]]);
      expect(emitted((d) => projectActs(d).sync("p_unknown", true))).toStrictEqual([["project.sync", "p_unknown", { system: "jira", on: true }]]);
    });

    it("done, measure, reward, claim and stop emit what they did", () => {
      expect(only((d) => projectActs(d).done("p_1", "Bins resized"))).toStrictEqual(["project.done", "p_1", { note: "Bins resized" }]);
      expect(only((d) => projectActs(d).done("p_1"))).toStrictEqual(["project.done", "p_1", { note: undefined }]);
      expect(only((d) => projectActs(d).measure("p_1", 30, 4, "Weekly report", "Typed"))).toStrictEqual(["project.measured", "p_1", { check: 30, value: 4, source: "Weekly report", note: "Typed" }]);
      expect(only((d) => projectActs(d).reward("p_1", "5 percent", 500, "Paid"))).toStrictEqual(["project.rewarded", "p_1", { rule: "5 percent", amount: 500, note: "Paid" }]);
      expect(only((d) => projectActs(d).claim("p_1"))).toStrictEqual(["project.claimed", "p_1", undefined]);
      expect(only((d) => projectActs(d).stop("p_1", "No budget"))).toStrictEqual(["project.stopped", "p_1", { why: "No budget" }]);
    });

    it("the draft acts emit what SET-U1 wrote", () => {
      expect(only((d) => projectActs(d).answerLead("p_1", true))).toStrictEqual(["project.lead.answered", "p_1", { take: true }]);
      expect(only((d) => projectActs(d).answerLead("p_1", true, "ignored when taking"))).toStrictEqual(["project.lead.answered", "p_1", { take: true }]);
      expect(only((d) => projectActs(d).answerLead("p_1", false, "No time"))).toStrictEqual(["project.lead.answered", "p_1", { take: false, reason: "No time" }]);
      expect(only((d) => projectActs(d).answerLead("p_1", false))).toStrictEqual(["project.lead.answered", "p_1", { take: false }]);
      expect(only((d) => projectActs(d).pickTemplate("p_1", "8d", 1, "A title"))).toStrictEqual(["project.template", "p_1", { key: "8d", version: 1, title: "A title" }]);
      expect(only((d) => projectActs(d).pickTemplate("p_1", "quick-win", 1))).toStrictEqual(["project.template", "p_1", { key: "quick-win", version: 1 }]);
      expect(only((d) => projectActs(d).invite("p_1", "u_hs", "sponsor"))).toStrictEqual(["project.invited", "p_1", { userId: "u_hs", role: "sponsor" }]);
      expect(only((d) => projectActs(d).answerInvite("p_1", "e_9", "u_hs", true))).toStrictEqual(["project.invite.answered", "p_1", { inviteId: "e_9", userId: "u_hs", take: true }]);
      expect(only((d) => projectActs(d).answerInvite("p_1", "e_9", "u_hs", false, "No time"))).toStrictEqual(["project.invite.answered", "p_1", { inviteId: "e_9", userId: "u_hs", take: false, reason: "No time" }]);
      expect(only((d) => projectActs(d).setGoal("p_1", { goal: "Less scrap", doneWhen: "Under 2 percent", doneBy: 40, brief: "Why" }))).toStrictEqual(["project.goal", "p_1", { goal: "Less scrap", doneWhen: "Under 2 percent", doneBy: 40, brief: "Why" }]);
      expect(only((d) => projectActs(d).setGoal("p_1", { goal: "Less scrap", doneWhen: "Under 2 percent" }))).toStrictEqual(["project.goal", "p_1", { goal: "Less scrap", doneWhen: "Under 2 percent" }]);
      expect(only((d) => projectActs(d).moveStart("p_1", 12, "Waiting for the line"))).toStrictEqual(["project.start.moved", "p_1", { dueDay: 12, why: "Waiting for the line" }]);
    });

    it("exposes exactly the project acts", () => {
      expect(Object.keys(projectActs(deps().d)).sort()).toEqual(
        ["addStep", "answerInvite", "answerLead", "baseline", "claim", "comment", "done", "editStep", "hand", "invite", "link", "measure", "member", "moveStart", "moveStep", "pickTemplate", "reward", "setGoal", "start", "stop", "sync"]);
    });
  });
});
