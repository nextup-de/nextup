// The static demo's second half (features/ideas/demo-loop.ts): playing every step on the demo seed tells
// the whole story, each step ends up done, and the steps adapt to a yes clicked by hand.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog, type EventLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";
import { LOOP_NUMBERS, LOOP_STEPS, nextLoopStep, type LoopCast } from "@/features/ideas/demo-loop";
import { DEMO_CASE, DEMO_SCRIPT, DESK_REPLY } from "@/features/ideas/demo-script";

const ME = "Jonas Schmidt", DESK = "Thomas Vogel";
const cast = (projectId: string): LoopCast => ({ caseId: "c_script", author: ME, desk: DESK, expert: "Hans Sander", manager: "Bernd Hartmann", projectId });

/** The script's case as the demo publishes it, read and asked about by the desk (StaticDemo's DeskReply). */
function published(): EventLog {
  let log = emptyLog();
  log = appendEvent(log, { type: "case.raised", actor: ME, target: "c_script", payload: { kind: "idea", title: DEMO_SCRIPT[0].say, body: DEMO_CASE.body, routeId: "r1", assignee: DESK, upside: DEMO_CASE.upside } });
  log = appendEvent(log, { type: "case.read", actor: DESK, target: "c_script" });
  return appendEvent(log, { type: "case.asked", actor: DESK, target: "c_script", payload: { text: DESK_REPLY.text } });
}

/** Play the next step; returns the new log and which step it was. */
function play(log: EventLog): { log: EventLog; key: string } | null {
  const next = nextLoopStep(reduce(STATIC_DEMO_SEED, log), log, "c_script");
  if (!next) return null;
  const out = next.step.events(cast(next.projectId), next.project).reduce(appendEvent, log);
  return { log: out, key: next.step.key };
}

describe("the demo's second half", () => {
  it("plays from the desk's question to the thanks, one step at a time", () => {
    let log = published();
    const keys: string[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const r = play(log);
      if (!r) break;
      expect(keys, "a step that does not finish would repeat").not.toContain(r.key);
      keys.push(r.key);
      log = r.log;
    }
    expect(keys).toEqual(LOOP_STEPS.map((s) => s.key));
    const S = reduce(STATIC_DEMO_SEED, log);
    const c = S.cases.find((x) => x.id === "c_script")!;
    expect(c.archived).toBe(true);
    expect(c.versions).toHaveLength(2);
    expect(c.discussion?.rounds.map((r) => r.next)).toEqual(["decide"]);
    const p = S.projects.find((x) => x.id === c.decided?.projectId)!;
    expect(p.status).toBe("recognised");
    expect(p.measures.map((m) => [m.check, m.value, m.verdict])).toEqual([[30, LOOP_NUMBERS.after30, "better"], [90, LOOP_NUMBERS.after90, "better"]]);
    expect(p.steps.every((s) => s.column === "done")).toBe(true);
  });

  it("picks up a yes clicked by hand, without steps or a baseline", () => {
    let log = published();
    for (let k = 0; k < 5; k++) log = play(log)!.log; // up to the check-in
    log = appendEvent(log, { type: "case.decided", actor: DESK, target: "c_script", payload: { answer: "yes", projectId: "p_hand", lead: "Markus Roth" } });
    for (let guard = 0; guard < 10; guard++) { const r = play(log); if (!r) break; log = r.log; }
    const p = reduce(STATIC_DEMO_SEED, log).projects.find((x) => x.id === "p_hand")!;
    expect(p.lead).toBe("Markus Roth");
    expect(p.baseline).toMatchObject({ value: LOOP_NUMBERS.before });
    expect(p.status).toBe("recognised");
  });

  it("stops after a no", () => {
    const log = appendEvent(published(), { type: "case.decided", actor: DESK, target: "c_script", payload: { answer: "no", reason: "not now" } });
    expect(nextLoopStep(reduce(STATIC_DEMO_SEED, log), log, "c_script")).toBeNull();
  });
});
