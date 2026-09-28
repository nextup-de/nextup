// Guards the fluid UI (docs/RESPONSIVE.md). Sizes are real pixels: no CSS `zoom` (Safari lays zoomed
// pages out differently from Chrome and Firefox), and full-screen sizes go through the screen tokens.
// These checks read the source; they need no browser. The screenshot sweep is tests/e2e/fluid.mjs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
// The one file allowed to use raw viewport units: it defines --nh-screen-h / --nh-screen-w from them.
const TOKENS = "src/styles/tokens.css";
// A line can opt out with this marker and a reason, e.g. `/* fluid-ok: image hint, not layout */`.
const OPT_OUT = "fluid-ok";

function files(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, exts);
    return exts.some((e) => name.endsWith(e)) ? [path] : [];
  });
}
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const lines = (path: string) => readFileSync(path, "utf8").split(/\r?\n/).map((text, i) => ({ text, at: rel(path) + ":" + (i + 1) }));

// 100vh, 100dvh, 100svh, 100lvh, 100vw (and the same in any calc/min/max).
const FULL_VIEWPORT = /\b100[dsl]?v[hw]\b/;

describe("fluid UI", () => {
  it("full-screen sizes use --nh-screen-h / --nh-screen-w, never raw 100vh / 100dvh / 100vw", () => {
    const css = files(SRC, [".css"]).filter((f) => rel(f) !== TOKENS).flatMap(lines);
    // Inline styles in components too; `sizes="…100vw…"` on an image is a download hint, not layout.
    const tsx = files(SRC, [".tsx", ".ts"]).flatMap(lines).filter((l) => !/\bsizes=/.test(l.text));
    const bad = [...css, ...tsx].filter((l) => FULL_VIEWPORT.test(l.text) && !l.text.includes(OPT_OUT)).map((l) => l.at + "  " + l.text.trim());
    expect(bad, "use var(--nh-screen-h) / var(--nh-screen-w) instead (see docs/RESPONSIVE.md)").toEqual([]);
  });

  it("nothing scales the page with CSS zoom (Safari computes it differently)", () => {
    const css = files(SRC, [".css"]).flatMap(lines);
    const tsx = files(SRC, [".tsx", ".ts"]).flatMap(lines);
    const bad = [
      ...css.filter((l) => /(^|[\s{;])zoom\s*:/.test(l.text)),
      ...tsx.filter((l) => /currentCSSZoom|zoom\s*:\s*["'\d]/.test(l.text)),
    ].filter((l) => !l.text.includes(OPT_OUT)).map((l) => l.at + "  " + l.text.trim());
    expect(bad, "size things in real pixels instead of zoom (see docs/RESPONSIVE.md)").toEqual([]);
  });

  it("text is never smaller than 12px", () => {
    const bad = files(SRC, [".css"]).flatMap(lines)
      .filter((l) => [...l.text.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12) && !l.text.includes(OPT_OUT))
      .map((l) => l.at + "  " + l.text.trim());
    expect(bad, "use 12px or more (see docs/RESPONSIVE.md)").toEqual([]);
  });

  it("the screen tokens are still defined", () => {
    const tokens = readFileSync(join(ROOT, TOKENS), "utf8");
    for (const name of ["--nh-screen-h:", "--nh-screen-w:"]) expect(tokens).toContain(name);
  });
});
