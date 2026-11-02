import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { agoText, baselineText, euros, fmtNumber, groupProjects, rewardRuleText, toolName, verdictWord } from "./views";

describe("project view texts in two languages", () => {
  it("keeps English as the default", () => {
    expect(fmtNumber(1200.456)).toBe("1,200.46");
    expect(euros(2000)).toBe("€2,000");
    expect(toolName({ id: "azure" })).toBe("Azure DevOps");
    expect(groupProjects([]).map((g) => g.label)).toEqual(["Planning", "Running", "Measuring", "Measured and recognised", "Stopped"]);
  });

  it("speaks German with German numbers", () => {
    expect(fmtNumber(1200.456, "de")).toBe("1.200,46");
    expect(euros(2000, "de")).toContain("2.000");
    expect(toolName({ id: "planner" }, "de")).toBe("Microsoft Planner");
    expect(verdictWord("worse", "de")).toBe(de.projects.verdictWorse);
    expect(groupProjects([], "de")[0].label).toBe(de.projects.group_planning);
    expect(rewardRuleText({ kind: "thanks", amount: null, sharePct: null, capEur: null }, "de")).toBe(de.projects.ruleThanks);
    expect(baselineText({ none: true, why: "kein Zähler", day: 0, by: "x" }, "de")).toBe("Keine Zahl möglich: kein Zähler");
  });

  it("counts time ago with the right plural", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    expect(agoText("2026-11-01T12:00:00Z", now, "de")).toBe("vor 1 Tag");
    expect(agoText("2026-10-29T12:00:00Z", now, "de")).toBe("vor 4 Tagen");
  });
});
