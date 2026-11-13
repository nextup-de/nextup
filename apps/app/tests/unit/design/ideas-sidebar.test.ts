// DESIGN_RULES.md, section 1: the ideas sidebar is one quiet line per idea: no date, no preview, no Draft badge. A dashed circle marks a draft.
import { describe, expect, it } from "vitest";
import { cssRules, functionBody, read } from "./guard";

const SIDEBAR = "src/components/ideas/RaiseSidebar.tsx";
const row = functionBody(read(SIDEBAR), "Row");

describe("DESIGN ideas sidebar", () => {
  it("a row shows no date and no preview of the idea", () => {
    // The row type carries `when` and `preview` for search and grouping; the row itself never draws them.
    for (const field of ["r.when", "r.preview", "r.group"]) expect(row, field).not.toContain(field);
    expect(row).not.toMatch(/formatDate|toLocale\w*String|Intl\.|\bf\(/);
  });

  it("a row has no Draft badge: the mark is a dashed circle whose meaning is a tooltip, not text", () => {
    expect(row).toContain("strokeDasharray");
    // No text node in the row is a draft label; the only draft key is the hint, used as an attribute.
    expect(row).not.toMatch(/>\s*\{\s*t\(["']ideas\.side\w*[Dd]raft/);
    const draftKeys = [...row.matchAll(/ideas\.side\w*[Dd]raft\w*/g)].map((m) => m[0]);
    expect([...new Set(draftKeys)]).toEqual(["ideas.sideDraftHint"]);
  });

  it("a row is a title and two small controls: the title, the pin and the draft mark", () => {
    const interactive = [...row.matchAll(/<(button|a|svg|span)\b/g)].map((m) => m[1]);
    expect(interactive.filter((tag) => tag === "button")).toHaveLength(1);
    expect(row).toContain("ideaTitle");
    expect(row).toContain("s.pin");
    expect(row).toContain("s.ideaMark");
  });

  it("the list groups by Today, This week and Earlier instead of a date per row", () => {
    const source = read(SIDEBAR);
    for (const key of ["ideas.sideToday", "ideas.sideThisWeek", "ideas.sideEarlier"]) expect(source, key).toContain(key);
  });

  it("the title of a row stays on one line and is cut with an ellipsis", () => {
    const rule = cssRules(read("src/components/ideas/Raise.module.css")).find((r) => r.selector === ".ideaTitleText");
    expect(rule, ".ideaTitleText has a rule").toBeDefined();
    expect(rule!.body).toMatch(/white-space\s*:\s*nowrap/);
    expect(rule!.body).toMatch(/text-overflow\s*:\s*ellipsis/);
  });
});
