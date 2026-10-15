// The company's rules after the routing against a real Postgres (lib/db/loop.ts): defaults without a
// config row, a round trip through admin's save, and the rules reaching the seed the reducer reads.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOOP_DEFAULTS, loopRules } from "@/features/loop/rules";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLoopRules, saveLoopRules } from "@/lib/db/loop";

const db = getDb();
let acme: { id: string; seedJson: unknown };
let globex: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", stage: "demo", seedJson: JSON.parse(JSON.stringify(SEED)) } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", stage: "demo", seedJson: {} } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("loop rules", () => {
  it("a company without a config row gets the defaults", async () => {
    expect(await loadLoopRules(acme.id)).toEqual(LOOP_DEFAULTS);
  });

  it("admin's save round-trips, and stays the company's own", async () => {
    const rules = loopRules({
      discussEveryDays: 2, discussMaxRounds: 4, fastLaneEur: 2500, measureDays: [14, 60], tolerancePct: 5,
      reward: { kind: "share", amount: null, sharePct: 10, capEur: 1500 },
    });
    await saveLoopRules(acme.id, rules);
    expect(await loadLoopRules(acme.id)).toEqual(rules);
    expect(await loadLoopRules(globex.id)).toEqual(LOOP_DEFAULTS);
  });

  it("the rules reach the seed the reducer reads, over whatever the blob says", async () => {
    const seed = await companySeed({ id: acme.id, seedJson: { ...(acme.seedJson as object), loop: { discussEveryDays: 9 } } });
    expect(seed.loop?.discussEveryDays).toBe(2);
    expect(seed.loop?.measureDays).toEqual([14, 60]);
  });
});
