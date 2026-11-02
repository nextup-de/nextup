// The company clock against a real Postgres: demo vs workdays, the stored calendar, no leaks between companies.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK } from "@/features/clock";
import { contentOnly } from "@/features/demo/content";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { saveCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";

const db = getDb();
let demo: { id: string; seedJson: unknown; stage: string };
let a: { id: string; seedJson: unknown; stage: string };
let b: { id: string; seedJson: unknown; stage: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  const seedJson = JSON.parse(JSON.stringify(contentOnly(SEED)));
  demo = await db.company.create({ data: { slug: "clk-demo", name: "D", stage: "demo", seedJson } });
  a = await db.company.create({ data: { slug: "clk-a", name: "A", stage: "sandbox", seedJson } });
  b = await db.company.create({ data: { slug: "clk-b", name: "B", stage: "sandbox", seedJson } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("CLK company clock", () => {
  it("gives a demo company the demo clock", async () => {
    expect((await companySeed(demo)).clock).toEqual(DEMO_CLOCK);
  });
  it("gives a sandbox company without a row the default calendar", async () => {
    expect((await companySeed(a)).clock).toEqual({ mode: "workdays", calendar: DEFAULT_CALENDAR });
  });
  it("uses the saved calendar, and another company's row never leaks", async () => {
    await saveCalendar(a.id, { ...DEFAULT_CALENDAR, region: "DE-BY" }, "test");
    expect((await companySeed(a)).clock).toEqual({ mode: "workdays", calendar: { ...DEFAULT_CALENDAR, region: "DE-BY" } });
    expect((await companySeed(b)).clock).toEqual({ mode: "workdays", calendar: DEFAULT_CALENDAR });
    expect((await companySeed(demo)).clock).toEqual(DEMO_CLOCK);
  });
});
