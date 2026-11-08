// The evaluation orb's phases and timing (features/ideas/progress.ts): bars fill by real time, waits are learned.
import { describe, expect, it } from "vitest";
import { bars, DEFAULT_TIMINGS, expectedMs, fill, finished, learn, phaseOf, remaining, startProgress, type Progress } from "@/features/ideas/progress";

const at = (p: Progress, patch: Partial<Progress>): Progress => ({ ...p, ...patch, at: { ...p.at, ...patch.at } });

describe("ideas/progress", () => {
  it("is in the last phase that has begun", () => {
    const p = startProgress(0);
    expect(phaseOf(p)).toBe("draft");
    expect(phaseOf(at(p, { at: { score: 100 } }))).toBe("score");
    expect(phaseOf(at(p, { at: { score: 100, coach: 300 } }))).toBe("coach");
  });

  it("fills a running bar towards, never to, full", () => {
    expect(fill(0, 1000)).toBe(0);
    expect(fill(1000, 1000)).toBeGreaterThan(0.7);
    expect(fill(1000, 1000)).toBeLessThan(0.85);
    expect(fill(60_000, 1000)).toBeLessThan(0.96);
    expect(fill(2000, 1000)).toBeGreaterThan(fill(1000, 1000));
  });

  it("shows done phases full and later ones empty", () => {
    const p = at(startProgress(0), { at: { score: 500 } });
    const b = bars(p, 900, DEFAULT_TIMINGS);
    expect(b[0]).toBe(1);
    expect(b[1]).toBeGreaterThan(0);
    expect(b[1]).toBeLessThan(1);
    expect(b[2]).toBe(0);
  });

  it("times the coach by who answers", () => {
    const p = at(startProgress(0), { at: { score: 10, coach: 20 }, coach: "offline" });
    expect(remaining(p, 20, DEFAULT_TIMINGS)).toBe(DEFAULT_TIMINGS["coach:offline"]);
    expect(remaining({ ...p, coach: "brain" }, 20, DEFAULT_TIMINGS)).toBe(DEFAULT_TIMINGS["coach:brain"]);
  });

  it("counts the phases still to come in what is left, and gives no guess once overdue", () => {
    const p = startProgress(0);
    expect(remaining(p, 0, DEFAULT_TIMINGS)).toBe(DEFAULT_TIMINGS.draft + DEFAULT_TIMINGS.score + DEFAULT_TIMINGS.coach);
    expect(remaining(p, DEFAULT_TIMINGS.draft + 1, DEFAULT_TIMINGS)).toBeNull();
  });

  it("learns from what a phase took, without one slow answer setting the next wait", () => {
    const t = learn(DEFAULT_TIMINGS, "coach", "brain", 20_000);
    expect(expectedMs(t, "coach", "brain")).toBeGreaterThan(DEFAULT_TIMINGS["coach:brain"]);
    expect(expectedMs(t, "coach", "brain")).toBeLessThan(20_000);
    expect(expectedMs(t, "coach", "model")).toBe(DEFAULT_TIMINGS["coach:model"]);
    expect(learn(DEFAULT_TIMINGS, "draft", null, Number.NaN)).toBe(DEFAULT_TIMINGS);
  });

  it("measures the phase before when the next begins, once", () => {
    const p = startProgress(100);
    expect(finished(p, "score", 400)).toEqual({ phase: "draft", ms: 300 });
    expect(finished(at(p, { at: { score: 400 } }), "score", 500)).toBeNull();
    expect(finished(p, "draft", 400)).toBeNull();
  });
});
