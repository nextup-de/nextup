import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import {
  JIRA_ACTOR, jiraMilestoneId, mayAppend as mayAppendApi, maySyncAppend, maySystemAppend, parseInbound, SYNC_ONLY_EVENT_TYPES, syncIdemKey,
} from "@/features/integrations";
import { ev, logOf, project, SEATS, SEED, startedLog } from "../res/project-fixture";

const EXT = { system: "jira", key: "NUP-v7", url: "https://acme.atlassian.net/projects/NUP/versions/7", mode: "owned" } as const;
const log = (extra: CaseEvent[]) => startedLog().concat(extra);
const stateOf = (events: CaseEvent[]) => reduce(SEED, logOf(events, 20));
const sync = (type: CaseEventType, payload: EventPayload, day = 12, target = "p_one") => ev(type, JIRA_ACTOR, target, payload, day);
const person = (type: CaseEventType, payload: EventPayload, day = 12) => ev(type, "L. Brandt", "p_one", payload, day);
const added = { milestoneId: "jv_p_one_7", title: "Release 7", dueDay: 30 };
const as = (userId: string, name: string, events: CaseEvent[], type: CaseEventType, payload: EventPayload) =>
  mayAppend({ role: "member", userId, me: meFor(userId, SEATS), name, handle: null }, { type, target: "p_one", payload }, stateOf(events));
const loose = (p: object) => p as unknown as EventPayload;
const body = (type: string, payload: EventPayload) => ({ type, target: "p_one", payload });

describe("JSY events reduce", () => {
  it("an old log without the new fields replays as before", () => {
    const m = project(stateOf(log([person("project.milestone.added", { milestoneId: "m1", title: "Pilot", dueDay: 30 })]))).milestones;
    expect(m).toEqual([{ id: "m1", title: "Pilot", startDay: null, dueDay: 30, note: "", shipped: false, shippedDay: null }]);
    expect(project(stateOf(log([]))).milestoneTombstones ?? []).toEqual([]);
  });

  it("the sync's added event stores the link and the pending write; a person's is ignored", () => {
    const syncd = project(stateOf(log([sync("project.milestone.added", { ...added, external: EXT, sync: { state: "pending", op: "create" } })]))).milestones[0];
    expect(syncd.external).toEqual(EXT);
    expect(syncd.sync).toEqual({ state: "pending", op: "create" });
    const forged = project(stateOf(log([person("project.milestone.added", { ...added, external: EXT, sync: { state: "pending", op: "create" } })]))).milestones[0];
    expect(forged.external ?? null).toBeNull();
    expect(forged.sync ?? null).toBeNull();
  });

  it("a person cannot set, replace or clear the link or the pending write by an edit", () => {
    const base = [sync("project.milestone.added", { ...added, external: EXT, sync: { state: "failed", op: "update", why: "403" } })];
    const after = project(stateOf(log([...base, person("project.milestone.edited", loose({ milestoneId: "jv_p_one_7", external: null, sync: null }))]))).milestones[0];
    expect(after.external).toEqual(EXT);
    expect(after.sync).toEqual({ state: "failed", op: "update", why: "403" });
  });

  it("the sync clears its pending write with null and never replaces a set link", () => {
    const other = { ...EXT, key: "NUP-v9", mode: "imported" } as const;
    const m = project(stateOf(log([
      sync("project.milestone.added", { ...added, external: EXT, sync: { state: "pending", op: "update" } }),
      sync("project.milestone.edited", { milestoneId: "jv_p_one_7", sync: null, external: other }, 13),
    ]))).milestones[0];
    expect(m.sync).toBeNull();
    expect(m.external).toEqual(EXT);
  });

  it("an imported milestone ignores a person's field edits; steps can still be attached, and the sync can edit", () => {
    const imported = sync("project.milestone.added", { ...added, external: { ...EXT, mode: "imported" } });
    const step = person("project.step.added", { stepId: "s1", text: "Build" }, 11);
    const events = [step, imported, person("project.milestone.edited", { milestoneId: "jv_p_one_7", title: "Mine", dueDay: 99, shipped: true }, 13), person("project.step.edited", { stepId: "s1", milestoneId: "jv_p_one_7" }, 14)];
    const p = project(stateOf(log(events)));
    expect(p.milestones[0]).toMatchObject({ title: "Release 7", dueDay: 30, shipped: false });
    expect(p.steps[0].milestoneId).toBe("jv_p_one_7");
    expect(project(stateOf(log([...events, sync("project.milestone.edited", { milestoneId: "jv_p_one_7", title: "Release 7.1" }, 15)]))).milestones[0].title).toBe("Release 7.1");
  });

  it("a removed milestone leaves a tombstone with its link", () => {
    const events = [sync("project.milestone.added", { ...added, external: EXT }), person("project.milestone.edited", { milestoneId: "jv_p_one_7", removed: true }, 14)];
    const p = project(stateOf(log(events)));
    expect(p.milestones).toEqual([]);
    expect(p.milestoneTombstones).toEqual([{ id: "jv_p_one_7", title: "Release 7", external: EXT, day: 14 }]);
    const plain = project(stateOf(log([person("project.milestone.added", { milestoneId: "m1", title: "Pilot", dueDay: 30 }), person("project.milestone.edited", { milestoneId: "m1", removed: true }, 14)])));
    expect(plain.milestoneTombstones).toEqual([{ id: "m1", title: "Pilot", external: null, day: 14 }]);
  });

  it("a malformed link or write is dropped, not stored", () => {
    const m = project(stateOf(log([sync("project.milestone.added", loose({ ...added, external: { system: "jira", key: "x", url: "javascript:alert(1)", mode: "owned" }, sync: { state: "done", op: "create" } }))]))).milestones[0];
    expect(m.external ?? null).toBeNull();
    expect(m.sync ?? null).toBeNull();
  });
});

describe("JSY events rights", () => {
  const owned = () => [sync("project.milestone.added", { ...added, external: EXT })];
  const imported = () => [sync("project.milestone.added", { ...added, external: { ...EXT, mode: "imported" } })];

  it("people are refused external and sync on add and on edit", () => {
    expect(as("u_lb", "L. Brandt", log([]), "project.milestone.added", { ...added, external: EXT }).ok).toBe(false);
    expect(as("u_lb", "L. Brandt", log([]), "project.milestone.added", { ...added, sync: { state: "pending", op: "create" } }).ok).toBe(false);
    expect(as("u_lb", "L. Brandt", log(owned()), "project.milestone.edited", loose({ milestoneId: "jv_p_one_7", external: null })).ok).toBe(false);
    expect(as("u_lb", "L. Brandt", log(owned()), "project.milestone.edited", { milestoneId: "jv_p_one_7", sync: null }).ok).toBe(false);
    expect(as("u_lb", "L. Brandt", log(owned()), "project.milestone.edited", { milestoneId: "jv_p_one_7", title: "New" }).ok).toBe(true);
  });

  it("people are refused field edits on an imported milestone; removal and step association stay allowed", () => {
    const events = [...imported(), person("project.step.added", { stepId: "s1", text: "Build" }, 11)];
    for (const f of [{ title: "x" }, { dueDay: 40 }, { startDay: 1 }, { note: "n" }, { shipped: true }]) {
      expect(as("u_lb", "L. Brandt", log(events), "project.milestone.edited", { milestoneId: "jv_p_one_7", ...f }).ok, JSON.stringify(f)).toBe(false);
    }
    expect(as("u_lb", "L. Brandt", log(events), "project.milestone.edited", { milestoneId: "jv_p_one_7", removed: true }).ok).toBe(true);
    expect(as("u_lb", "L. Brandt", log(events), "project.step.edited", { stepId: "s1", milestoneId: "jv_p_one_7" }).ok).toBe(true);
  });
});

describe("JSY events sync allow-list", () => {
  it("the milestone events are sync-only: the public allow-list stays false", () => {
    expect([...SYNC_ONLY_EVENT_TYPES]).toEqual(["project.milestone.added", "project.milestone.edited"]);
    for (const t of SYNC_ONLY_EVENT_TYPES) {
      expect(mayAppendApi(t)).toBe(false);
      expect(maySyncAppend(t)).toBe(true);
    }
    expect(maySyncAppend("project.step.added")).toBe(true);
    expect(maySyncAppend("case.decided")).toBe(false);
    expect(maySyncAppend("project.started")).toBe(false);
  });

  it("the public API cannot forge sync: a via in the body is ignored, the default is api", () => {
    const b = body("project.milestone.added", { ...added, external: EXT });
    expect(parseInbound(b).ok).toBe(false);
    expect(parseInbound({ ...b, via: "sync" }).ok).toBe(false);
    expect(parseInbound(b, null, { via: "api" }).ok).toBe(false);
    expect(parseInbound(b, null, { via: "sync" }).ok).toBe(true);
    const edit = { type: "project.step.edited", target: "p_one", payload: { stepId: "s1", milestoneId: "m1" }, via: "sync" };
    expect(parseInbound(edit).ok).toBe(false);
    expect(parseInbound({ ...edit, via: undefined }, null, { via: "sync" }).ok).toBe(true);
  });

  it("validates milestone payloads", () => {
    const ok = (type: string, p: EventPayload) => parseInbound(body(type, p), null, { via: "sync" }).ok;
    expect(ok("project.milestone.added", added)).toBe(true);
    expect(ok("project.milestone.added", { ...added, milestoneId: "x".repeat(65) })).toBe(false);
    expect(ok("project.milestone.added", { ...added, milestoneId: "bad id" })).toBe(false);
    expect(ok("project.milestone.added", { ...added, title: "" })).toBe(false);
    expect(ok("project.milestone.added", { ...added, title: "x".repeat(81) })).toBe(false);
    expect(ok("project.milestone.added", { ...added, dueDay: 1.5 })).toBe(false);
    expect(ok("project.milestone.added", { milestoneId: "m", title: "t" })).toBe(false);
    expect(ok("project.milestone.added", { ...added, startDay: 31 })).toBe(false);
    expect(ok("project.milestone.added", { ...added, startDay: null })).toBe(true);
    expect(ok("project.milestone.added", { ...added, startDay: 2.5 })).toBe(false);
    expect(ok("project.milestone.added", { ...added, note: "x".repeat(1001) })).toBe(false);
    expect(ok("project.milestone.edited", loose({ milestoneId: "m", shipped: "yes" }))).toBe(false);
    expect(ok("project.milestone.edited", { milestoneId: "m", shipped: true })).toBe(true);
    expect(ok("project.milestone.added", { ...added, external: { ...EXT, system: "azure" } })).toBe(false);
    expect(ok("project.milestone.added", { ...added, external: { ...EXT, url: "ftp://x" } })).toBe(false);
    expect(ok("project.milestone.added", loose({ ...added, external: { ...EXT, mode: "mine" } }))).toBe(false);
    expect(ok("project.milestone.added", { ...added, sync: { state: "pending", op: "archive" } })).toBe(true);
    expect(ok("project.milestone.added", loose({ ...added, sync: { state: "ok", op: "create" } }))).toBe(false);
    expect(ok("project.milestone.added", { ...added, sync: { state: "failed", op: "create", why: "403" } })).toBe(true);
    expect(ok("project.milestone.added", loose({ ...added, extra: 1 }))).toBe(false);
  });

  it("the sync's step edit carries only stepId, text and milestoneId", () => {
    const ok = (p: EventPayload, via: "api" | "sync") => parseInbound(body("project.step.edited", p), null, { via }).ok;
    expect(ok({ stepId: "s1", milestoneId: "m1" }, "sync")).toBe(true);
    expect(ok({ stepId: "s1", milestoneId: null }, "sync")).toBe(true);
    expect(ok({ stepId: "s1", milestoneId: "m1", text: "t" }, "sync")).toBe(true);
    expect(ok({ stepId: "s1", milestoneId: "bad id" }, "sync")).toBe(false);
    expect(ok({ stepId: "s1", dueDay: 3 }, "sync")).toBe(false);
    expect(ok({ stepId: "s1", milestoneId: "m1" }, "api")).toBe(false);
    expect(ok({ stepId: "s1", text: "t" }, "api")).toBe(true);
  });
});

describe("JSY events state checks", () => {
  const state = (events: CaseEvent[]) => stateOf(log(events));
  const check = (events: CaseEvent[], type: string, payload: EventPayload) =>
    maySystemAppend({ type: type as "project.milestone.added", target: "p_one", payload }, state(events));
  const base = [sync("project.milestone.added", { ...added, startDay: 10, external: EXT })];

  it("an added id must be unused and not tombstoned", () => {
    expect(check(base, "project.milestone.added", added).ok).toBe(false);
    expect(check(base, "project.milestone.added", { ...added, milestoneId: "jv_p_one_8" }).ok).toBe(true);
    const gone = [...base, person("project.milestone.edited", { milestoneId: "jv_p_one_7", removed: true }, 14)];
    expect(check(gone, "project.milestone.added", added).ok).toBe(false);
  });

  it("an edit must name an existing milestone, and the order is checked on the merged values", () => {
    expect(check(base, "project.milestone.edited", { milestoneId: "nope", title: "x" }).ok).toBe(false);
    expect(check(base, "project.milestone.edited", { milestoneId: "jv_p_one_7", title: "x" }).ok).toBe(true);
    expect(check(base, "project.milestone.edited", { milestoneId: "jv_p_one_7", dueDay: 5 }).ok).toBe(false);
    expect(check(base, "project.milestone.edited", { milestoneId: "jv_p_one_7", startDay: 40 }).ok).toBe(false);
    expect(check(base, "project.milestone.edited", { milestoneId: "jv_p_one_7", startDay: null, dueDay: 5 }).ok).toBe(true);
  });

  it("an existing link cannot be replaced", () => {
    expect(check(base, "project.milestone.edited", { milestoneId: "jv_p_one_7", external: { ...EXT, key: "NUP-v9" } }).ok).toBe(false);
    const free = [sync("project.milestone.added", added)];
    expect(check(free, "project.milestone.edited", { milestoneId: "jv_p_one_7", external: EXT }).ok).toBe(true);
  });

  it("a step's milestone must be an existing milestone of that project, or null", () => {
    const events = [...base, person("project.step.added", { stepId: "s1", text: "Build" }, 11)];
    expect(check(events, "project.step.edited", { stepId: "s1", milestoneId: "jv_p_one_7" }).ok).toBe(true);
    expect(check(events, "project.step.edited", { stepId: "s1", milestoneId: null }).ok).toBe(true);
    expect(check(events, "project.step.edited", { stepId: "s1", milestoneId: "zz" }).ok).toBe(false);
  });
});

describe("JSY events ids", () => {
  it("are deterministic, bounded, and tell two projects with the same Jira version apart", () => {
    expect(jiraMilestoneId("p_one", "10007")).toBe("jv_p_one_10007");
    expect(jiraMilestoneId("p_one", "10007")).toBe(jiraMilestoneId("p_one", "10007"));
    expect(jiraMilestoneId("p_one", "7")).not.toBe(jiraMilestoneId("p_two", "7"));
    const long = jiraMilestoneId("p".repeat(64), "9".repeat(40));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jiraMilestoneId("p".repeat(64), "9".repeat(40) + "1")).not.toBe(long);
    expect(jiraMilestoneId("a b", "1")).not.toBe(jiraMilestoneId("a_b", "1"));
    expect(parseInbound(body("project.milestone.added", { ...added, milestoneId: long }), null, { via: "sync" }).ok).toBe(true);
  });

  it("idem keys are deterministic and fit parseInbound's limit", () => {
    expect(syncIdemKey("milestone.added", ["p_one", "7"])).toBe(syncIdemKey("milestone.added", ["p_one", "7"]));
    const k = syncIdemKey("milestone.added", ["p".repeat(150), "9".repeat(150)]);
    expect(k.length).toBeLessThanOrEqual(200);
    expect(syncIdemKey("milestone.added", ["p".repeat(150), "9".repeat(150)])).toBe(k);
    expect(parseInbound(body("project.milestone.added", added), k, { via: "sync" }).ok).toBe(true);
  });
});
