// The demo controls (components/shell/DemoControls.tsx) and the raise page, without importing each other:
// the raise page registers what it can do for the script right now (lib/dev-fill.ts does the same for the
// dev panel's one row), and the controls remember whether the demo was started and which step was taken last.

// What the raise page offers the controls; null where that step cannot be taken right now. Each one is a
// click the presenter would otherwise make on the page: the controls make it, so the demo needs no other.
export type RaiseHooks = {
  at: number; // where the conversation stands in the script (features/ideas/demo-script.ts scriptStep)
  fillIdea: (() => void) | null; // the start view is open: fill it with the sample idea
  fillAnswer: (() => void) | null; // NextUp asked: put the script's next answer in the composer
  send: (() => void) | null; // the start view holds an idea, or the composer an answer: send it
  preview: (() => void) | null; // NextUp has answered: open the last look before it goes out
  finalize: (() => void) | null; // the last look is open: confirm it, and the final document opens
  sendFinal: (() => void) | null; // the final document is open: send it to the suggested receiver
};
const NONE: RaiseHooks = { at: -1, fillIdea: null, fillAnswer: null, send: null, preview: null, finalize: null, sendFinal: null };

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

// The case open in the team leader's inbox (components/dashboard/leader/InboxView.tsx), so the controls pass
// "Open the idea" over when the presenter opened it on the page. Returns the clear function, for an effect.
let inboxCase: string | null = null;
const caseSubs = new Set<() => void>();
export function showInboxCase(id: string | null): () => void {
  inboxCase = id; caseSubs.forEach((f) => f());
  return () => { if (inboxCase === id) { inboxCase = null; caseSubs.forEach((f) => f()); } };
}
export const subscribeInboxCase = (f: () => void) => { caseSubs.add(f); return () => { caseSubs.delete(f); }; };
export const getInboxCase = () => inboxCase;
export const noInboxCase = () => null;

// ── this tab's run of the demo ──
// In memory, like the demo itself: every page load starts the demo over from the seed (components/demo/
// StaticDemo.tsx), so it starts the controls over at the first step too. Client-side navigation keeps it.
// done: the index of the step taken last, -1 for none. reached: the furthest the conversation got in the script
// this run (RaiseHooks.at), so a step the presenter took on the page itself is passed over.
export type Run = { started: boolean; done: number; reached: number };
const FRESH: Run = { started: false, done: -1, reached: 0 };

// A restart opens the raise page with this: the run there begins at the first step again.
export const RUN_PARAM = "demo=start";

let run: Run | null = null;
const runSubs = new Set<() => void>();
function readRun(): Run {
  if (new URLSearchParams(window.location.search).get("demo") !== "start") return FRESH;
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  window.history.replaceState(window.history.state, "", url);
  return { started: true, done: -1, reached: 0 };
}
export const subscribeRun = (f: () => void) => { runSubs.add(f); return () => { runSubs.delete(f); }; };
export const getRun = (): Run => (run ??= readRun());
export const getServerRun = () => FRESH;
export function setRun(patch: Partial<Run>) {
  run = { ...getRun(), ...patch };
  runSubs.forEach((f) => f());
}
