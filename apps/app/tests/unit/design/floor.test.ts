// DESIGN_RULES.md, section 4: floor pages have no app shell, a light theme, touch targets of at least 48px (main buttons 64px) and a DE / EN switch.
import { describe, expect, it } from "vitest";
import { againstAllowList, cssRules, filesUnder, read } from "./guard";

const FLOOR_STYLES = ["src/components/floor/Floor.module.css", "src/components/floor/FloorShell.module.css"];
/** What a finger presses or types into on a floor page. */
const TOUCH = ["tile", "main", "second", "key", "langBtn", "signOut", "input", "textarea"];
const MIN_TARGET = 48;
const MAIN_BUTTON = 64;

/** The px height a class gives its element: the largest of height and min-height on its own rule (null when it has none). */
function heightOf(file: string, cls: string): number | null {
  const sizes = cssRules(read(file)).filter((r) => r.selector.split(",").some((s) => s.trim() === `.${cls}`))
    .flatMap((r) => [...r.body.matchAll(/(?:^|[;\s])(?:min-)?height\s*:\s*(\d+)px/g)].map((m) => Number(m[1])));
  return sizes.length ? Math.max(...sizes) : null;
}

/** Touch targets under 48px. */
const SMALL_ALLOWED: Record<string, string> = {
  "FloorShell.module.css .langBtn": "the DE / EN buttons in the 56px bar are 40px high",
};

describe("DESIGN floor pages", () => {
  const floorSources = [...filesUnder("src/components/floor", ".tsx"), ...filesUnder("src/app/[company]/floor", ".tsx")];

  it("they live outside the app group, so they have no app shell and no session", () => {
    expect(filesUnder("src/app/[company]/floor", "layout.tsx")).toEqual(["src/app/[company]/floor/layout.tsx"]);
    expect(filesUnder("src/app/[company]/(app)", "layout.tsx").some((f) => f.includes("/floor/"))).toBe(false);
    for (const file of floorSources) expect(read(file), file).not.toMatch(/from\s+["']@\/components\/(shell|dashboard)\//);
  });

  it("every touch target is at least 48px high, the main button 64px, unless it is listed", () => {
    const small: string[] = [];
    for (const file of FLOOR_STYLES) {
      for (const cls of TOUCH) {
        const h = heightOf(file, cls);
        if (h !== null && h < MIN_TARGET) small.push(`${file.split("/").pop()} .${cls}`);
      }
    }
    expect(againstAllowList(small, SMALL_ALLOWED)).toEqual({ fresh: [], fixed: [] });
    expect(heightOf("src/components/floor/Floor.module.css", "main")).toBeGreaterThanOrEqual(MAIN_BUTTON);
  });

  it("they are light: no dark colour scheme in their styles, a white shell and a white theme colour", () => {
    for (const file of FLOOR_STYLES) expect(read(file), file).not.toMatch(/prefers-color-scheme\s*:\s*dark|data-theme\s*=\s*["']?dark/);
    expect(read("src/components/floor/FloorShell.module.css")).toMatch(/\.shell\s*\{[^}]*background\s*:\s*#fff/);
    expect(read("src/app/[company]/floor/layout.tsx")).toContain('themeColor: "#ffffff"');
  });

  it("every floor page has the DE / EN switch in its shell", () => {
    const shell = read("src/components/floor/FloorShell.tsx");
    expect(shell).toContain("LOCALES.map");
    expect(shell).toContain("setLocale");
    expect(shell).toMatch(/l\.toUpperCase\(\)/);
  });
});
