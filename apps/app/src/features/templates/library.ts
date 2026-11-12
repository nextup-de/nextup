// The project templates (plan SET, decision D16): steps by role, the roles a template suggests and the metric it
// suggests. Each template has numbered versions; project.template names the exact one, so a later version never
// changes an old log. The names and signatures below are fixed.
//
// A new content version is appended as version 2; version 1 is never edited once it is on main. The step texts are
// data, shown as written (English, like the seed's step texts). The content comes from the click-through preview of
// the project workflows plan; its approvals and rhythm are not here (approvals are GAT's).
import type { StepRole } from "@/features/projects/types";

export type TemplateKey = "quick-win" | "8d" | "investment";

/** One step the template puts on the board: its text, whose it is, and the working-day offset from the start. */
export type TemplateStep = { text: string; role: StepRole; day: number };

export type Template = {
  key: TemplateKey;
  version: number;
  steps: TemplateStep[];
  /** The roles it suggests as open slots on the Team tab; none is required (Q5.6). */
  roles: string[];
  /** The metric it suggests for the baseline; null when it suggests none. */
  metric: string | null;
  /** false for all three; the assistant work (AGT) uses it. */
  agent?: boolean;
};

/** Every version of every template, oldest first. `day`: working days after the lead takes the draft. */
export const TEMPLATES: Record<TemplateKey, Template[]> = {
  "quick-win": [{
    key: "quick-win", version: 1,
    steps: [
      { text: "Try it at one station", role: "lead", day: 3 },
      { text: "Ask the people who work with it", role: "team", day: 7 },
      { text: "Make it the standard, with a photo", role: "lead", day: 10 },
      { text: "Tell the other shifts what changed", role: "lead", day: 12 },
    ],
    roles: [], metric: "Minutes saved per shift", agent: false,
  }],
  "8d": [{
    key: "8d", version: 1,
    steps: [
      { text: "D1 Name the team", role: "lead", day: 0 },
      { text: "D2 Describe the problem", role: "team", day: 1 },
      { text: "D3 Contain it: sort the stock, protect the customer", role: "team", day: 2 },
      { text: "D4 Find the root cause", role: "team", day: 7 },
      { text: "D5 Choose the corrective action", role: "team", day: 10 },
      { text: "D6 Put it in place and prove it works", role: "team", day: 25 },
      { text: "D7 Prevent it elsewhere: update the standards", role: "lead", day: 35 },
      { text: "D8 Close and recognise the team", role: "sponsor", day: 40 },
    ],
    roles: ["Sponsor", "A member from production", "A member from engineering"], metric: "Customer complaints", agent: false,
  }],
  investment: [{
    key: "investment", version: 1,
    steps: [
      { text: "Write the request with the business case", role: "lead", day: 5 },
      { text: "Get two offers", role: "team", day: 12 },
      { text: "Estimate the full cost, running costs included", role: "team", day: 15 },
      { text: "Ask for the budget approval", role: "lead", day: 20 },
      { text: "Place the order", role: "team", day: 30 },
      { text: "Install it and put it into use", role: "team", day: 50 },
      { text: "Measure the payback", role: "lead", day: 90 },
    ],
    roles: ["Sponsor", "Purchasing", "Controlling"], metric: "Payback", agent: false,
  }],
};

const isKey = (key: string): key is TemplateKey => Object.prototype.hasOwnProperty.call(TEMPLATES, key);

/** The steps of that exact version; [] for an unknown key or version. */
export function templateSteps(key: string, version: number): TemplateStep[] {
  return (isKey(key) ? TEMPLATES[key].find((t) => t.version === version)?.steps : undefined) ?? [];
}

/** The newest version of a template, or null for an unknown key. */
export function latestTemplate(key: string): Template | null {
  if (!isKey(key)) return null;
  const all = TEMPLATES[key];
  return all[all.length - 1] ?? null;
}
