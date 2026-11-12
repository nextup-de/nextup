// REG-A1: the event types and the app event list in one file per area (plan REG, decisions D5 and D8).
import { describe, expect, it } from "vitest";
import { isAppEventType, logFromRows } from "@/features/cases/persist";
import { REPLAY_ROWS } from "./events-replay";

describe("REG events replay", () => {
  it("round-trips the fixed pre-REG log through logFromRows exactly as recorded, and accepts every app type", async () => {
    const log = logFromRows(REPLAY_ROWS, 3);
    await expect(JSON.stringify(log, null, 2)).toMatchFileSnapshot("./snapshot/events-replay.json");
    for (const r of REPLAY_ROWS) {
      if (r.type === "case.unanswered" || r.type === "clock.due") expect(isAppEventType(r.type), r.type).toBe(false);
      else expect(isAppEventType(r.type), r.type).toBe(true);
    }
  });
});
