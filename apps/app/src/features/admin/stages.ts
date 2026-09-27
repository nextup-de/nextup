// A customer's phase, as data. docs/INTEGRATIONS.md "Stages": a flag set, not a branch - the code
// is identical for all four, so this is how we describe the relationship, not how we behave.
//
// Kept out of src/config/roles.ts on purpose: a stage is a property of a company, a role is a
// property of a person, and conflating them is how a "superadmin" role gets invented.

export const STAGES = ["demo", "sandbox", "pilot", "live"] as const;
export type Stage = (typeof STAGES)[number];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/** What each stage means, so the dropdown is not four words with no definition. */
export const STAGE_MEANING: Record<Stage, string> = {
  demo: "Our content, shown to prospects. Demo tools on.",
  sandbox: "Their people, our data - they are trying it out.",
  pilot: "Their real cases, with the two-working-day promise running.",
  live: "In production. Treat the data as theirs.",
};

// ── What a stage allows ─────────────────────────────────────────────────────────────────────────
// The one line between made-up data and real people. `demo` is our content on a sales call, so
// the shortcuts that make a walkthrough smooth are fine there. From `sandbox` on, the people and
// their cases are real, and every one of those shortcuts is a way to act as somebody else.
//
// Read by the server actions, never only by the UI: hiding a button is a courtesy, the action's
// check is the rule. An unknown stage gets the strictest policy - fail closed, not open.

export type StagePolicy = {
  /** The content is ours, not theirs: safe to show prospects, safe to wipe. */
  demoData: boolean;
  /** The login page's one-click "View the demo as..." list (with LOGIN_DEMO_FILL on the server). */
  demoLogin: boolean;
  /** Dev panel: become one of the company's other people without logging in again. */
  switchPerson: boolean;
  /** Dev panel: move the shared clock, delete added cases, reset the whole log. */
  rewriteHistory: boolean;
};

const DEMO_POLICY: StagePolicy = {
  demoData: true,
  demoLogin: true,
  switchPerson: true,
  rewriteHistory: true,
};

const REAL_POLICY: StagePolicy = {
  demoData: false,
  demoLogin: false,
  switchPerson: false,
  rewriteHistory: false,
};

export function policyFor(stage: string): StagePolicy {
  return stage === "demo" ? DEMO_POLICY : REAL_POLICY;
}

/** Real people from this stage on. The wording the admin sees next to the stage badge. */
export function holdsRealPeople(stage: string): boolean {
  return !policyFor(stage).demoData;
}

/**
 * Stage moves the admin may make. Forward is always fine. Back to `demo` from a real stage is not:
 * it would switch the reset and "become someone else" tools back on over real people's history.
 * Between real stages both directions are allowed - that is the documented rollback.
 */
export function canMoveStage(from: string, to: string): boolean {
  if (!isStage(to)) return false;
  return !(to === "demo" && holdsRealPeople(from));
}

/** The next step, or null at the end. Lets the page offer one button instead of a dropdown. */
export function nextStage(current: string): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(current);
  if (i < 0 || i === STAGES.length - 1) return null;
  return STAGES[i + 1];
}
