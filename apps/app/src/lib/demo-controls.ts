// The demo controls (components/shell/DemoControls.tsx) and the raise page, without importing each other:
// the raise page registers what it can do for the script right now (lib/dev-fill.ts does the same for the
// dev panel's one row), and the controls remember whether the demo was started and which step was taken last.

// What the raise page offers the controls; null where that step cannot be taken right now.
export type RaiseHooks = {
  at: number; // where the conversation stands in the script (features/ideas/demo-script.ts scriptStep)
  fillIdea: (() => void) | null; // the start view is open: fill it with the sample idea
  fillAnswer: (() => void) | null; // the chat waits for one of the answers filled one by one: put it in the composer
  fillRest: (() => void) | null; // those are said: add the rest of the conversation in one go
};
const NONE: RaiseHooks = { at: -1, fillIdea: null, fillAnswer: null, fillRest: null };

let hooks: RaiseHooks = NONE;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

// Returns the unregister function, so it can be an effect's cleanup.
export function registerRaiseHooks(next: RaiseHooks): () => void {
  hooks = next; emit();
  return () => { if (hooks === next) { hooks = NONE; emit(); } };
}
export const subscribeRaiseHooks = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getRaiseHooks = () => hooks;
export const noRaiseHooks = () => NONE;

// ── this tab's run of the demo ──
// In memory, like the demo itself: every page load starts the demo over from the seed (components/demo/
// StaticDemo.tsx), so it starts the controls over at "Start demo" too. Client-side navigation keeps it.
export type Run = { started: boolean; done: number }; // done: the index of the step taken last, -1 for none
const FRESH: Run = { started: false, done: -1 };

// The demo tab "Start demo" opens carries this, so the run there begins with Start demo taken.
export const RUN_PARAM = "demo=start";

let run: Run | null = null;
const runSubs = new Set<() => void>();
function readRun(): Run {
  if (new URLSearchParams(window.location.search).get("demo") !== "start") return FRESH;
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  window.history.replaceState(window.history.state, "", url);
  return { started: true, done: 0 };
}
export const subscribeRun = (f: () => void) => { runSubs.add(f); return () => { runSubs.delete(f); }; };
export const getRun = (): Run => (run ??= readRun());
export const getServerRun = () => FRESH;
export function setRun(patch: Partial<Run>) {
  run = { ...getRun(), ...patch };
  runSubs.forEach((f) => f());
}
