// loadLogAround (lib/db/events.ts) must give every target the same state the whole log gives it: appendEventAction
// decides who may do what on that state. A generated Musterwerk company (cases in every fate, projects with steps,
// baselines and measures, the clock's deadline facts) plus one case that joins a project another case opened.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reduce, type State } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import type { Seed } from "@/features/demo/types";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog, loadLogAround } from "@/lib/db/events";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";

const db = getDb();
const SLUG = "log-around";
const NOW = new Date("2026-11-11T09:00:00Z");
let companyId = "";
let seed: Seed;
let full: State;
let joined = { caseId: "", projectId: "" };

beforeAll(async () => {
  await db.company.deleteMany({});
  ({ companyId } = await generateMusterwerk(db, { slug: SLUG, people: 400, weeks: 6, seed: 7, now: NOW }));
  seed = await seedFor(SLUG);

  // A second yes naming a project that is already open joins it: the one link that crosses targets.
  const before = reduce(seed, await loadLog(companyId, NOW));
  const project = before.projects.find((p) => p.status !== "stopped" && p.status !== "recognised");
  const open = before.cases.find((c) => c.status === "open" && !c.decided);
  if (!project || !open) throw new Error("the generated company has no open project or open case");
  const r = await appendEventRow(
    companyId,
    { id: "e-join-1", day: 0, type: "case.decided", actor: project.lead, targetId: open.id, payload: { answer: "yes", reason: "Gehört dazu", projectId: project.id, lead: project.lead, title: project.title } },
    { now: NOW },
  );
  if (!r.ok) throw new Error(r.error);
  joined = { caseId: open.id, projectId: project.id };
  full = reduce(seed, await loadLog(companyId, NOW));
}, 120_000);

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

// A project's `number` counts every project of the company in opening order: a label, not state any rule reads.
const sameAs = (p: State["projects"][number] | undefined) => (p ? { ...p, number: 0 } : p);

const around = async (...targets: string[]) => {
  const log = await loadLogAround(companyId, seed, targets, NOW);
  return { log, state: reduce(seed, log) };
};

describe("loadLogAround", () => {
  it("the join is in the state the test relies on", () => {
    const p = full.projects.find((x) => x.id === joined.projectId);
    expect(full.cases.find((c) => c.id === joined.caseId)?.decided?.projectId).toBe(joined.projectId);
    expect(p).toBeDefined();
    expect(full.projects.length).toBeGreaterThan(3);
    expect(full.cases.length).toBeGreaterThan(30);
  });

  it("gives every case the state the whole log gives it, from a fraction of the log", async () => {
    let shipped = 0;
    for (const c of full.cases) {
      const { log, state } = await around(c.id);
      expect(state.cases.find((x) => x.id === c.id), c.id).toEqual(c);
      expect(state.day).toBe(full.day);
      // The projects the case belongs to come along whole: visibility asks who is on them.
      for (const p of full.projects.filter((x) => x.sources.includes(c.id))) {
        expect(sameAs(state.projects.find((x) => x.id === p.id)), `${c.id} -> ${p.id}`).toEqual(sameAs(p));
      }
      shipped += log.events.length;
    }
    const all = (await loadLog(companyId, NOW)).events.length;
    expect(shipped / full.cases.length).toBeLessThan(all / 10);
  });

  it("gives every project the state the whole log gives it, joins included", async () => {
    for (const p of full.projects) {
      const { state } = await around(p.id);
      expect(sameAs(state.projects.find((x) => x.id === p.id)), p.id).toEqual(sameAs(p));
    }
  });

  it("a yes naming a project brings that project, for the decision check", async () => {
    const other = full.cases.find((c) => c.status === "open" && !c.decided && c.id !== joined.caseId);
    if (!other) throw new Error("no second open case");
    const { state } = await around(other.id, joined.projectId);
    expect(sameAs(state.projects.find((x) => x.id === joined.projectId))).toEqual(sameAs(full.projects.find((x) => x.id === joined.projectId)));
  });

  it("a new id finds nothing, so a raise on it is allowed and one on a known id is not", async () => {
    const { state } = await around("c-does-not-exist-yet");
    expect(state.cases.find((c) => c.id === "c-does-not-exist-yet")).toBeUndefined();
    const known = full.cases[0];
    expect((await around(known.id)).state.cases.some((c) => c.id === known.id)).toBe(true);
  });
});
