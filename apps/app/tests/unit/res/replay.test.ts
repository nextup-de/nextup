// RES-A1 (D6): a log written before plan RES reduces to the same projects as before, apart from the RES fields, which are empty.
// snapshot/replay-before.json is that log's reduction by the reducer as it was before RES (recorded then, never regenerated).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { closingEvent } from "@/features/projects/close";
import type { ReducedProject } from "@/features/projects/types";
import { LOG, SEED } from "./replay-fixture";

const before = JSON.parse(readFileSync("tests/unit/res/snapshot/replay-before.json", "utf8")) as Record<string, unknown>[];

const RES_PROJECT = ["rewardDueDay", "helpAsks"] as const;
const RES_MEASURE = ["eventId", "sentBack", "reentered", "managerOnly", "questions", "previous"] as const;
const without = <T extends object>(o: T, keys: readonly string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
/** The project as it was before RES: the RES fields off, the history as its event ids, as plain data. */
const asBefore = (p: ReducedProject) => JSON.parse(JSON.stringify({
  ...without(p, [...RES_PROJECT, "pages", "removed", "merges"]),
  baseline: p.baseline === null ? null : without(p.baseline, ["byUserId", "eventId", "confirmed"]),
  steps: p.steps.map((s) => without(s, ["dropped"])),
  measures: p.measures.map((m) => without(m, RES_MEASURE)),
  history: p.history.map((e) => e.id),
}));

describe("RES replay", () => {
  const S = reduce(SEED, { events: LOG, day: 40 });

  it("a log from before RES reduces to the same projects as before, the RES fields aside", () => {
    expect(S.projects).toHaveLength(3);
    expect(S.projects.map(asBefore)).toEqual(before);
    // the fixture covers what RES touches: a measured, confirmed and rewarded project, one measured and not confirmed, a stopped draft
    expect(S.projects.map((p) => p.status)).toEqual(["recognised", "measured", "stopped"]);
  });

  it("the RES fields are empty on every project, step, measure and baseline", () => {
    for (const p of S.projects) {
      expect(p.rewardDueDay, p.id).toBeNull();
      expect(p.helpAsks, p.id).toEqual([]);
      for (const s of p.steps) expect(s.dropped, s.id).toBeNull();
      for (const m of p.measures) expect(m, p.id).toMatchObject({ sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [] });
      if (p.baseline) expect(p.baseline.confirmed, p.id).toBeNull();
    }
  });

  it("a measure that was typed and confirmed before RES still closes its project with the same event", () => {
    const one = S.projects[0];
    expect(one.measures[0]).toMatchObject({ confirmed: true, verdict: "better" });
    expect(closingEvent(one, S.rules)?.type).toBe("project.rewarded");
    // the replay does not depend on the day it is replayed on
    const early = reduce(SEED, { events: LOG, day: 20 }).projects;
    expect(early.map((p) => p.measures.map((m) => [m.check, m.confirmed, m.sentBack]))).toEqual(S.projects.map((p) => p.measures.map((m) => [m.check, m.confirmed, m.sentBack])));
  });
});
