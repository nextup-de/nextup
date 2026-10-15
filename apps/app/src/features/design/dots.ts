// The dot grid on the Ground (shell/Ground): a faint, evenly spaced grid of blue dots behind every
// page. Two settings - strength (the layer's opacity, 0 hides it) and spacing (px between dots).
// The company-wide default is src/config/design-defaults.json, so it reaches every device once
// deployed; the dev panel's Design page can override it per browser, and on localhost save the
// current values as the new default (server/actions/design.ts writes that file).
import defaults from "@/config/design-defaults.json";

export type Dots = { dotsStrength: number; dotSpacing: number };

export const DOTS_RANGE = {
  dotsStrength: { min: 0, max: 1, step: 0.01 },
  dotSpacing: { min: 24, max: 140, step: 2 },
} as const;

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

// Any input made safe: out-of-range values are pulled in, missing or broken ones fall back.
export function normalizeDots(v: Partial<Record<keyof Dots, unknown>>, fallback: Dots = DOTS_DEFAULT): Dots {
  const s = DOTS_RANGE.dotsStrength, g = DOTS_RANGE.dotSpacing;
  return {
    dotsStrength: Math.round(clamp(v.dotsStrength, s.min, s.max, fallback.dotsStrength) * 100) / 100,
    dotSpacing: Math.round(clamp(v.dotSpacing, g.min, g.max, fallback.dotSpacing)),
  };
}

// 0.2 / 42px: the handoff's 56px drawn at the design's 0.75 preview scale, the laptop target.
export const DOTS_DEFAULT: Dots = normalizeDots(defaults, { dotsStrength: 0.2, dotSpacing: 42 });
