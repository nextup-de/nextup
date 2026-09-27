// Read a `Seed` back out of JSON (Company.seedJson) and fail loudly if it is not one.
//
// Pure: no database, no Next. seed.ts stays exactly as it is - the built-in acme seed and the
// template new companies are cloned from - because tests/unit/{cases,rows,evaluate}.test.ts
// import its named exports.
//
// Why this is a shape check and not a field-by-field schema: the blob is written by our own admin
// action from a `Seed` that already typechecked, never by a user. What we actually need to catch
// is "this company's JSON is empty / truncated / from an older shape", which shows up as a
// missing or wrong-typed top-level key. A full nested validation would be a second copy of
// types.ts to keep in sync.
import type { Seed } from "./types";

/** The arrays every Seed carries. A company missing one of these would render a broken page. */
const ARRAY_KEYS = [
  "depts",
  "people",
  "problems",
  "ideas",
  "initiatives",
  "outcomes",
  "personas",
  "leaders",
  "routes",
  "cases",
  "waitingOn",
  "buddies",
  "stall",
] as const;

const OBJECT_KEYS = ["ledger", "metrics", "views"] as const;
const NUMBER_KEYS = ["promiseDays", "outcomeDays"] as const;

export class SeedShapeError extends Error {
  constructor(what: string) {
    super(`Company seed JSON is not a Seed: ${what}`);
    this.name = "SeedShapeError";
  }
}

/** Throws SeedShapeError rather than returning a half-valid Seed - a broken blob is a bug. */
export function parseSeed(value: unknown): Seed {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SeedShapeError(`expected an object, got ${Array.isArray(value) ? "an array" : typeof value}`);
  }
  const v = value as Record<string, unknown>;

  for (const key of NUMBER_KEYS) {
    if (typeof v[key] !== "number") throw new SeedShapeError(`${key} is not a number`);
  }
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(v[key])) throw new SeedShapeError(`${key} is not an array`);
  }
  for (const key of OBJECT_KEYS) {
    if (typeof v[key] !== "object" || v[key] === null) throw new SeedShapeError(`${key} is missing`);
  }

  // Shape verified; the nested rows came from a Seed that already typechecked when it was written.
  return value as Seed;
}

/** True when `value` is a usable Seed. For callers that want to fall back rather than throw. */
export function isSeed(value: unknown): value is Seed {
  try {
    parseSeed(value);
    return true;
  } catch {
    return false;
  }
}

/** A Seed as it goes into Postgres. JSON.stringify drops undefined optionals, which is fine - the
 *  reducer treats a missing optional and an undefined one identically. */
export function toSeedJson(seed: Seed): unknown {
  return JSON.parse(JSON.stringify(seed));
}
