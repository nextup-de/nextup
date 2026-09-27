// The seed, scoped by company. From Company.seedJson when there is a database, from the built-in
// acme seed when there is not (build, tests, and `npm run dev` before the first migration).
//
// Async now that it can come from Postgres. Both callers are already async server components.
import { orDemo } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { SEED } from "./seed";
import type { Seed } from "./types";

export const EMPTY_SEED: Seed = {
  ...SEED, depts: [], people: [], problems: [], ideas: [], initiatives: [], outcomes: [], cases: [], waitingOn: [], stall: [],
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
