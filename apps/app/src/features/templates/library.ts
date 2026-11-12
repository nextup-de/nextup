// The project templates (plan SET, decision D16): steps by role, the roles a template suggests and the metric it
// suggests. Each template has numbered versions; project.template names the exact one, so a later version never
// changes an old log. SET-C1 fills the content; the names and signatures below are fixed.
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

/** Every version of every template, oldest first. */
export const TEMPLATES: Record<TemplateKey, Template[]> = {
  "quick-win": [{ key: "quick-win", version: 1, steps: [], roles: [], metric: null, agent: false }],
  "8d": [{ key: "8d", version: 1, steps: [], roles: [], metric: null, agent: false }],
  investment: [{ key: "investment", version: 1, steps: [], roles: [], metric: null, agent: false }],
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
