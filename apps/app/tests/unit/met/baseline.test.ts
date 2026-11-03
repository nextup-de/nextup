import { describe, expect, it } from "vitest";
import { baselineFromCsv, parseBaseline } from "@/features/metrics/baseline";

const good = { fromDay: 10, toDay: 40, fromDate: "2026-01-10", toDate: "2026-02-09", imported: {} };

describe("MET baseline", () => {
  it("parses a valid value", () => {
    expect(parseBaseline(good)).toEqual(good);
    const imp = { firstReasonedAnswer: { value: 4.5, source: "Ticket tool", sha256: "ab", importedBy: "u1", importedAt: "2026-03-01T00:00:00Z" } };
    expect(parseBaseline({ ...good, imported: imp })?.imported).toEqual(imp);
  });

  it("refuses a reversed or non-integer period and an unknown imported key", () => {
    expect(parseBaseline({ ...good, fromDay: 41 })).toBeNull();
    expect(parseBaseline({ ...good, toDay: 40.5 })).toBeNull();
    expect(parseBaseline(null)).toBeNull();
    const bad = { nope: { value: 1, source: "s", sha256: "h", importedBy: "u", importedAt: "t" } };
    expect(parseBaseline({ ...good, imported: bad })).toBeNull();
  });

  it("reads metric;value lines with decimal comma or point", () => {
    expect(baselineFromCsv("metric;value\nfirstReasonedAnswer;4,5\nparticipationPct;12.5\n")).toEqual({
      values: { firstReasonedAnswer: 4.5, participationPct: 12.5 },
    });
  });

  it("names the line of a missing header, an unknown key and a non-number", () => {
    expect(baselineFromCsv("firstReasonedAnswer;4")).toEqual({ error: "header", line: 1 });
    expect(baselineFromCsv("metric;value\nfirstReasonedAnswer;4\nbogus;1")).toEqual({ error: "key", line: 3 });
    expect(baselineFromCsv("metric;value\nfirstReasonedAnswer;abc")).toEqual({ error: "value", line: 2 });
  });
});
