// acme's demo content for the company structure (D2): its goals and rules. A company gets these only
// by having them written into its own tables when it is created from the demo template.
import type { CompanyRules } from "@/features/knowledge/rules";
import type { SeedGoal } from "./types";

// The goals as the board would state them. Matched by keyword so a step can say which goal a case serves.
export const DEMO_GOALS: SeedGoal[] = [
  { goal: "No line stops waiting for a signature", keys: ["stop", "stood", "wait", "sign", "order", "approve", "night"] },
  { goal: "Scrap and rework on the 4-series down 20 %", keys: ["scrap", "rework", "tolerance", "casting", "quality", "drift", "defect"] },
  { goal: "Every changeover under 20 minutes", keys: ["changeover", "setup", "fixture", "jig", "tooling", "sheet", "mes"] },
  { goal: "New hires productive in week one", keys: ["login", "access", "apprentice", "hire", "onboard", "account"] },
];

export const DEMO_RULES: CompanyRules = {
  promiseDays: 5,
  outcomeDays: 14,
  spend: { limitEur: 5000, text: "team-level authority up to €5k, no controlling sign-off" },
  deadlineHandover: true,
  steps: { discussion: true, projects: true, measure: true, recognition: true },
  postAs: "handle",
};
