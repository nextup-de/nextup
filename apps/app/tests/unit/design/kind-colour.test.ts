// DESIGN_RULES.md, section 2: problem and idea are told apart by icon and label, never by colour alone.
import { describe, expect, it } from "vitest";
import { againstAllowList, cssRules, filesUnder, read } from "./guard";

const COLOURED = /(^|;|\s)(color|background(-color)?|border(-\w+)?-color|fill|stroke)\s*:/;
/** A selector keyed on the kind of a case: [data-kind="Idea"], [data-kind="problem"], [data-type="idea"]. */
const KIND_SELECTOR = /\[data-(kind|type)\s*=\s*["']?(idea|problem)["']?\]/i;

/** Style files that tint something by the kind of a case. Each needs the shape or the words to carry the meaning too. */
const TINTED_ALLOWED: Record<string, string> = {
  "src/components/shell/SimpleShell.module.css": "the search result mark tints by kind, and NavSearch.tsx draws a different icon for each kind (checked below)",
};

describe("DESIGN problem and idea", () => {
  const tinted = filesUnder("src", ".css").filter((f) => cssRules(read(f)).some((r) => KIND_SELECTOR.test(r.selector) && COLOURED.test(r.body)));

  it("a style that colours by case kind is listed, and a listed one that no longer does must go", () => {
    expect(againstAllowList(tinted, TINTED_ALLOWED)).toEqual({ fresh: [], fixed: [] });
  });

  it("the one tinted mark also draws a different shape for each kind", () => {
    const source = read("src/components/shell/NavSearch.tsx");
    const mark = source.slice(source.indexOf("data-kind={r.kind}"), source.indexOf("</span>", source.indexOf("data-kind={r.kind}")));
    expect(mark).toContain('r.kind === "Idea"');
    // The two svg branches have no shape in common.
    const [idea, problem] = mark.split(": <svg");
    const pathsOf = (text: string) => [...text.matchAll(/(?:<path d="[^"]+"|<circle [^>]+)/g)].map((m) => m[0]);
    expect(pathsOf(idea).length).toBeGreaterThan(0);
    expect(pathsOf(problem ?? "").length).toBeGreaterThan(0);
    expect(pathsOf(idea).some((p) => pathsOf(problem ?? "").includes(p))).toBe(false);
  });

  it("the kind is also a word: the case page names it", () => {
    const source = read("src/components/dashboard/shared/CaseDetailView.tsx");
    expect(source).toContain("dashboard.detailIdea");
    expect(source).toContain("dashboard.detailProblem");
  });
});
