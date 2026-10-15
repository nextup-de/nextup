// The dev panel's "Fill a sample idea": the raise page registers a filler while its start view is
// open, the dev panel (components/shell/DevPanel.tsx) shows the row only then and calls it. A tiny
// store so the shell and the page never import each other. Demo tooling only.
import { DEMO_IDEA } from "@/features/ideas/demo-script";

export type DevSample = {
  text: string; // the one-line headline
  ctx: string; // what more there is to say: it follows the headline in the composer
  aff: string[]; // affected departments or people
  files: string[]; // fake attachment names
};

// One sample, the "reporting screen" idea - the static demo's script starts from it too (features/ideas/demo-script.ts).
export const DEV_SAMPLES: DevSample[] = [DEMO_IDEA];

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
