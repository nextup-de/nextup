// DESIGN_RULES.md, section 6: motion respects reduced motion; focused fields get the blue focus ring (--nh-brand-focus).
import { describe, expect, it } from "vitest";
import { againstAllowList, cssRules, filesUnder, read } from "./guard";

const styles = filesUnder("src", ".css");
const moves = (css: string) => /@keyframes|animation\s*:\s*(?!none)|transition\s*:\s*(?!none)/.test(css);

/** Style files that animate without any prefers-reduced-motion rule. */
const NO_GUARD_ALLOWED: Record<string, string> = {
  "src/app/globals.css": "only the dev panel's motion switch (data-motion=off), no prefers-reduced-motion rule; short state transitions",
  "src/app/admin/admin.module.css": "short state transitions, no reduced-motion rule",
  "src/components/settings/settings.module.css": "short state transitions, no reduced-motion rule",
  "src/components/settings/OrgEditor.module.css": "one short transition, no reduced-motion rule",
  "src/components/shell/DemoControls.module.css": "one short transition, no reduced-motion rule",
  "src/components/projects/Projects.module.css": "keyframe animation and transitions, no reduced-motion rule",
  "src/components/admin/connectors/Connectors.module.css": "short state transitions, no reduced-motion rule",
  "src/components/dashboard/leader/IdeaDetailPhone.module.css": "keyframe animation and transitions, no reduced-motion rule",
  "src/components/dashboard/shared/ViewHead.module.css": "keyframe animation and a transition, no reduced-motion rule",
  "src/components/profile/NotifySettings.module.css": "short state transitions, no reduced-motion rule",
  "src/components/report/ReportButton.module.css": "short state transitions, no reduced-motion rule",
};

describe("DESIGN motion and focus", () => {
  it("a style file that animates has a prefers-reduced-motion rule, unless it is listed", () => {
    const found = styles.filter((f) => { const css = read(f); return moves(css) && !/prefers-reduced-motion/.test(css); });
    expect(againstAllowList(found, NO_GUARD_ALLOWED)).toEqual({ fresh: [], fixed: [] });
  });

  it("the focus colour is one token, defined once in tokens.css and used by the global focus styles", () => {
    expect(read("src/styles/tokens.css")).toMatch(/--nh-brand-focus\s*:/);
    const globals = cssRules(read("src/app/globals.css"));
    expect(globals.some((r) => /:focus/.test(r.selector) && r.body.includes("var(--nh-brand-focus)"))).toBe(true);
    // No stylesheet but tokens.css gives the token a value of its own.
    expect(styles.filter((f) => f !== "src/styles/tokens.css" && /--nh-brand-focus\s*:/.test(read(f)))).toEqual([]);
  });

  it("no rule takes the outline away without drawing another focus (a ring, a shadow or a border colour) for that element", () => {
    const bare: string[] = [];
    for (const file of styles) {
      const rules = cssRules(read(file));
      for (const { selector, body } of rules) {
        if (!/outline\s*:\s*(none|0)\b/.test(body)) continue;
        if (/box-shadow|border-color|outline\s*:\s*[^;n0]/.test(body)) continue;
        const base = selector.split(":focus")[0].trim().split(",")[0].trim().split(" ").pop() ?? "";
        const restored = rules.some((r) => /:focus/.test(r.selector) && r.selector.includes(base) && /box-shadow|border-color|outline\s*:\s*\d/.test(r.body));
        if (!restored) bare.push(`${file} ${selector}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
