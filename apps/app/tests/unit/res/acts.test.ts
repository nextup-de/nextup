// RES-P1 (B2): the demo's project acts for "A result that closes properly" emit exactly the decided events (plan RES, D13, D14, D16, D19, D24).
// Fixed literals, a recording emit; never reduce().
import { describe, expect, it } from "vitest";
import type { ActDeps, Emit } from "@/components/dashboard/demo/act-deps";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import type { EventLog, EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";

type Call = { type: string; target: string | null; payload: EventPayload | undefined };

const yes = (id: string, projectId: string, over: Record<string, unknown> = {}) => ({ id, title: "Case " + id, status: "decided", withdrawn: null, decided: { answer: "yes", projectId }, ...over });
const S = {
  day: 0,
  cases: [yes("c_b", "p_1"), yes("c_a", "p_1"), yes("c_c", "p_1", { decided: { answer: "no", projectId: null } }), yes("c_d", "p_1", { withdrawn: { day: 1 } }), yes("c_e", "p_2")],
  projects: [{ id: "p_1", sources: ["c_a", "c_b", "c_c", "c_d"], steps: [] }, { id: "p_2", sources: ["c_e"], steps: [] }],
} as unknown as State;

function deps(answer: (type: string) => { ok: boolean; error?: string } = () => ({ ok: true })): { d: ActDeps; calls: Call[] } {
  const calls: Call[] = [];
  const emit: Emit = (type, target, payload) => {
    calls.push({ type, target, payload });
    const r = answer(type);
    return Promise.resolve(r.ok ? { ok: true } : { ok: false, error: r.error ?? "no" });
  };
  const log: EventLog = { events: [], day: 0 };
  return { d: { emit, S, seed: {} as unknown as Seed, serverMode: false, slug: "acme", actor: "T. Vogel", actorUserId: "u_tv", log }, calls };
}
const emitted = async (run: (acts: ReturnType<typeof projectActs>) => unknown, answer?: Parameters<typeof deps>[0]) => {
  const { d, calls } = deps(answer);
  const result = await run(projectActs(d));
  return { calls: calls.map((c) => [c.type, c.target, c.payload] as const), result };
};

describe("RES demo acts", () => {
  it("done carries how each open step ends, as openSteps, and without it emits what it always did", async () => {
    const open = [{ stepId: "s1", end: "done" as const }, { stepId: "s2", end: "dropped" as const, why: "Not needed" }];
    expect((await emitted((a) => a.done("p_1", "Live", open))).calls).toStrictEqual([["project.done", "p_1", { note: "Live", openSteps: open }]]);
    expect((await emitted((a) => a.done("p_1", "Live"))).calls).toStrictEqual([["project.done", "p_1", { note: "Live" }]]);
    expect((await emitted((a) => a.done("p_1", undefined, []))).calls).toStrictEqual([["project.done", "p_1", { note: undefined, openSteps: [] }]]);
  });

  it("question sends a result back, confirmBaseline confirms the number, askHelp asks the sponsor", async () => {
    expect((await emitted((a) => a.question("p_1", 30, "Does not match the line report"))).calls).toStrictEqual([["project.measure.questioned", "p_1", { check: 30, why: "Does not match the line report" }]]);
    expect((await emitted((a) => a.confirmBaseline("p_1"))).calls).toStrictEqual([["project.baseline.confirmed", "p_1", undefined]]);
    expect((await emitted((a) => a.askHelp("p_1", "s1", "I need a decision"))).calls).toStrictEqual([["project.help.asked", "p_1", { stepId: "s1", text: "I need a decision" }]]);
  });

  it("reopen is a case.reopened with why stopped on the case, and nothing else (the demo's reducer sets the date)", async () => {
    expect((await emitted((a) => a.reopen("c_a", "stopped"))).calls).toStrictEqual([["case.reopened", "c_a", { why: "stopped" }]]);
  });

  it("stopAndReturn with keep stops the project and nothing else", async () => {
    const { calls, result } = await emitted((a) => a.stopAndReturn("p_1", "No budget", "keep"));
    expect(calls).toStrictEqual([["project.stopped", "p_1", { why: "No budget" }]]);
    expect(result).toEqual({ ok: true });
  });

  it("stopAndReturn with return stops, then reopens each source case whose latest decision is the project's yes, in case-id order", async () => {
    const { calls, result } = await emitted((a) => a.stopAndReturn("p_1", "No budget", "return"));
    expect(calls).toStrictEqual([
      ["project.stopped", "p_1", { why: "No budget" }],
      ["case.reopened", "c_a", { why: "stopped" }],
      ["case.reopened", "c_b", { why: "stopped" }],
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("a stop that is refused reopens nothing, and a refused reopen ends the run with its answer", async () => {
    const refusedStop = await emitted((a) => a.stopAndReturn("p_1", "x", "return"), (type) => (type === "project.stopped" ? { ok: false, error: "Not yours" } : { ok: true }));
    expect(refusedStop.calls.map((c) => c[0])).toEqual(["project.stopped"]);
    expect(refusedStop.result).toEqual({ ok: false, error: "Not yours" });
    let n = 0;
    const refusedReopen = await emitted((a) => a.stopAndReturn("p_1", "x", "return"), (type) => (type === "case.reopened" && ++n === 1 ? { ok: false, error: "Not this one" } : { ok: true }));
    expect(refusedReopen.calls.map((c) => c[0])).toEqual(["project.stopped", "case.reopened"]);
    expect(refusedReopen.result).toEqual({ ok: false, error: "Not this one" });
  });

  it("another project returns only its own idea, and an unknown project is only stopped", async () => {
    expect((await emitted((a) => a.stopAndReturn("p_2", "x", "return"))).calls.map((c) => [c[0], c[1]])).toEqual([["project.stopped", "p_2"], ["case.reopened", "c_e"]]);
    expect((await emitted((a) => a.stopAndReturn("p_missing", "x", "return"))).calls.map((c) => c[0])).toEqual(["project.stopped"]);
  });

  it("the existing stop act still emits only the stop", async () => {
    expect((await emitted((a) => a.stop("p_1", "Why"))).calls).toStrictEqual([["project.stopped", "p_1", { why: "Why" }]]);
  });
});
