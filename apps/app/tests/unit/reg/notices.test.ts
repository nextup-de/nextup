// REG-C1 (D5): the notify registries are split into one file per area; nothing the planner writes may change.
import { describe, expect, it } from "vitest";
import { planNotices } from "@/features/notify/plan";
import { FIXTURE_EVENTS, fixtureCtx } from "./notices-fixture";

describe("REG notices split", () => {
  it("planNotices on the fixed fixture events gives the golden recorded before the split", async () => {
    const golden = FIXTURE_EVENTS.map((ev) => ({
      id: ev.id, type: ev.type,
      teamsOff: planNotices(ev, fixtureCtx(false)),
      teamsOn: planNotices(ev, fixtureCtx(true)),
    }));
    await expect(JSON.stringify(golden, null, 2)).toMatchFileSnapshot("./snapshot/notices-golden.json");
  });
});
