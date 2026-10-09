// The dev panel's "Fill a sample idea": the raise page registers a filler while its start view is
// open, the dev panel (components/shell/DevPanel.tsx) shows the row only then and calls it. A tiny
// store so the shell and the page never import each other. Demo tooling only.

export type DevSample = {
  text: string; // the one-line headline
  ctx: string; // what more there is to say: it follows the headline in the composer
  aff: string[]; // affected departments or people
  files: string[]; // fake attachment names
};

// One sample, the "reporting screen" idea: the Feed has its own cover for it (features/cases/thumbs.ts).
export const DEV_SAMPLES: DevSample[] = [
  {
    text: "A reporting screen at each assembly station", aff: ["Production", "Quality", "Engineering"], files: ["assembly-station-issues.xlsx", "reporting-screen-sketch.pdf"],
    ctx: "We should put a simple reporting screen at each assembly station so operators can flag recurring problems as they happen, like missing parts, awkward tools, or unclear instructions. The reports would go directly to the team responsible, and operators could see what is being done about them.\nRight now operators tell their shift lead or write problems on the whiteboard at the end of the line. A lot of it gets lost at shift change, and the same issues keep coming back week after week. Nobody on the line knows if anyone picked a problem up. The screen would only need a few taps: choose the station, the type of problem (parts, tooling, instructions, other), add a short note or photo, and send. Each report would then show its status, like received, being looked at, or fixed, so operators know it was not ignored.\nImpact: Make recurring problems on the car assembly line visible and easier to follow up across shifts\nWho’s blocked: Assembly operators who raise issues but cannot see who is handling them or what happens next\nTrial: Start at one assembly station before rolling it out across the line",
  },
];

let filler: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

// Returns the unregister function, so it can be an effect's cleanup.
export function registerDevFill(fn: () => void): () => void {
  filler = fn; emit();
  return () => { if (filler === fn) { filler = null; emit(); } };
}
export const subscribeDevFill = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const hasDevFill = () => filler !== null;
export const devFill = () => filler?.();
