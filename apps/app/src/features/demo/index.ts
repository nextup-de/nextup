// The seed, scoped by company. From Company.seedJson when there is a database, from the built-in
// acme seed when there is not (build, tests, and `npm run dev` before the first migration).
//
// Async now that it can come from Postgres. Both callers are already async server components.
import { orDemo } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { ROLES, SEED, VIEWS } from "./seed";
import type { Ledger, Metrics, Movement, Persona, RolePersona, Seed } from "./types";

const NEUTRAL_WHO: Persona = { name: "", ini: "", line: "", handle: null };

/** The three home-screen personas with no person behind them: the labels only. */
export const NEUTRAL_PERSONAS: RolePersona[] = ROLES.map((r) => ({ id: r.id, label: r.label, dept: "", who: { ...NEUTRAL_WHO } }));

export const EMPTY_LEDGER: Ledger = {
  firstAnswer: "—", firstAnswerWas: "—", withinPromise: "—", withinPromiseWas: "—",
  escalated: 0, handedOver: 0, overrides: "—", overridesNote: "—",
};

const NO_MOVEMENT: Movement = { now: "—", was: "—", spark: [] };

export const EMPTY_METRICS: Metrics = {
  discovery: { round: 0, interviewed: 0, note: "—" },
  signals: 0,
  ideaToDecision: { ...NO_MOVEMENT },
  valueBooked: { ...NO_MOVEMENT, delta: "—", sub: "—" },
  waitingDaysSaved: { now: "—", spark: [] },
  shippedWas: "—", shippedSpark: [],
  noOwnerWas: "—", noOwnerSpark: [],
  contributing: { ...NO_MOVEMENT },
  stoppedEarly: 0,
  nextCall: "—",
  answered: { replied: "—", median: "—", credited: 0 },
  you: { medianWait: "—" },
  lead: { medianAnswer: "—", withinPromise: "—" },
};

/** A bare install: no acme content, no structure (D8). Built without spreading SEED. */
export const EMPTY_SEED: Seed = {
  promiseDays: 5, outcomeDays: 14,
  depts: [], people: [], problems: [], ideas: [], initiatives: [], outcomes: [],
  personas: NEUTRAL_PERSONAS, leaders: [], routes: [], cases: [], waitingOn: [], buddies: [],
  goals: [], spend: null,
  stall: [], ledger: EMPTY_LEDGER, metrics: EMPTY_METRICS, views: VIEWS, projects: [],
};

export async function seedFor(slug: string): Promise<Seed> {
  return orDemo(
    async () => (await loadSeed(slug)) ?? EMPTY_SEED,
    () => (slug === "acme" ? SEED : EMPTY_SEED),
  );
}

/** The content a brand-new company starts from. `demo` clones acme; `empty` is a bare install. */
export function seedTemplate(kind: "demo" | "empty"): Seed {
  return kind === "demo" ? SEED : EMPTY_SEED;
}

export type { Seed } from "./types";
