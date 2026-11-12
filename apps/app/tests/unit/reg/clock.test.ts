// REG-B1: the clock split into one file per area changes nothing: the same Dues, in the same order (REG/D5).
import { describe, expect, it } from "vitest";
import { dueNow } from "@/features/clock/due";
import { above, FIXTURES } from "./clock-fixture";

describe("REG clock split", () => {
  it("dueNow on the fixed states is what it was before the split", async () => {
    const out = FIXTURES.map((f) => ({ name: f.name, dues: dueNow(f.state, f.today, above) }));
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./snapshot/clock-golden.json");
  });
});
