// The seed survives a round trip through Postgres JSON.
//
// This is the load-bearing test for the whole "keep the Seed as a blob" decision: if a company's
// seedJson does not reduce to the same thing the built-in seed does, every page renders wrong.
// It asserts behaviour (what reduce() produces), not deep equality - JSON.stringify drops keys
// whose value is undefined, so `{ blocker: undefined }` and `{}` are the same seed but not the
// same object.
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { isSeed, parseSeed, SeedShapeError, toSeedJson } from "@/features/demo/parse";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";

const roundTrip = () => parseSeed(JSON.parse(JSON.stringify(toSeedJson(SEED))));

describe("parseSeed", () => {
  it("accepts the built-in seed after a JSON round trip", () => {
    expect(() => roundTrip()).not.toThrow();
  });

  it("keeps every collection the pages read", () => {
    const seed = roundTrip();
    expect(seed.depts.length).toBe(SEED.depts.length);
    expect(seed.people.length).toBe(SEED.people.length);
    expect(seed.routes.length).toBe(SEED.routes.length);
    expect(seed.cases.length).toBe(SEED.cases.length);
    expect(seed.ideas.length).toBe(SEED.ideas.length);
    expect(seed.problems.length).toBe(SEED.problems.length);
    expect(seed.personas.length).toBe(SEED.personas.length);
    expect(seed.promiseDays).toBe(SEED.promiseDays);
  });

  it("reduces to exactly what the built-in seed reduces to", () => {
    // The real contract. Same cases, same desks, same ledger.
    const fromBlob = reduce(roundTrip(), emptyLog());
    const fromSeed = reduce(SEED, emptyLog());

    expect(fromBlob.cases.length).toBe(fromSeed.cases.length);
    expect(fromBlob.cases.map((c) => c.id)).toEqual(fromSeed.cases.map((c) => c.id));
    expect(fromBlob.cases.map((c) => c.assignee)).toEqual(fromSeed.cases.map((c) => c.assignee));
    expect(fromBlob.cases.map((c) => c.open)).toEqual(fromSeed.cases.map((c) => c.open));
    expect(fromBlob.ledger).toEqual(fromSeed.ledger);
    expect(fromBlob.ideas.map((i) => i.status)).toEqual(fromSeed.ideas.map((i) => i.status));
    expect(fromBlob.problems.map((p) => p.id)).toEqual(fromSeed.problems.map((p) => p.id));
  });

  it("preserves seed history, which lives in the blob rather than in the event table", () => {
    // reducer.ts synthesises seed events from SeedCase.seedEvents. If the round trip lost them,
    // shipped and building cases would come back as freshly raised.
    const fromBlob = reduce(roundTrip(), emptyLog());
    const fromSeed = reduce(SEED, emptyLog());
    expect(fromBlob.cases.map((c) => c.history.length)).toEqual(
      fromSeed.cases.map((c) => c.history.length),
    );
  });

  it("rejects a blob that is not a seed", () => {
    expect(() => parseSeed(null)).toThrow(SeedShapeError);
    expect(() => parseSeed({})).toThrow(SeedShapeError);
    expect(() => parseSeed([])).toThrow(SeedShapeError);
    expect(() => parseSeed("{}")).toThrow(SeedShapeError);
    expect(() => parseSeed({ ...toSeedJson(SEED) as object, routes: undefined })).toThrow(SeedShapeError);
    expect(() => parseSeed({ ...toSeedJson(SEED) as object, promiseDays: "5" })).toThrow(SeedShapeError);
  });

  it("names the offending key so a bad company is findable", () => {
    expect(() => parseSeed({ ...(toSeedJson(SEED) as object), cases: undefined })).toThrow(/cases/);
  });

  it("isSeed answers without throwing", () => {
    expect(isSeed(toSeedJson(SEED))).toBe(true);
    expect(isSeed({})).toBe(false);
  });
});
