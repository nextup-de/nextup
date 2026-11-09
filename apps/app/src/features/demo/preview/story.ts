// The one idea the preview at /demo/preview follows, and the plan the agent would draft for it before the
// decision (docs/plans/2026-11-08_decision-stages.md, phase AGT: the planning run). Nobody's model wrote
// this: the draft is written by hand to show what such a draft would hold. The people are the static
// demo's (features/demo/static-demo.ts).
import type { TemplateKey } from "./templates";

export const PREVIEW_CASE = {
  title: "Scratches on housing covers reach the customer",
  body: "The customer sent covers back three times this quarter, each time with fine scratches. Under the yellow light at our inspection table they do not show. We sort every returned lot by hand, about six hours each time.",
  from: "Jonas Schmidt",
  fromDept: "Production, Line 3",
  route: "Customer complaint",
  owner: "Hans Sander",
  ownerRole: "Quality lead",
  dueInDays: 2,
} as const;

/** The route's default: what the Yes sheet proposes when nobody asked the agent. */
export const ROUTE_TEMPLATE: TemplateKey = "8d";

export const PREVIEW_DRAFT = {
  templateKey: "8d" as TemplateKey,
  why: "It is a customer complaint that came back three times, and the cause is not known yet. That is what 8D is for.",
  team: ["Quality engineer", "Shift lead, Line 3", "Process engineer", "Sponsor: Head of Production"],
  goal: "No scratched cover reaches the customer. Done when a quarter passes without a complaint on scratches.",
  metric: "Customer complaints on scratches: 3 per quarter today, target 0.",
  effort: "6 to 8 weeks, about 60 hours across four people.",
  risks: [
    "The cause may be in transport and not at the line.",
    "Sorting the stock in D3 takes two people off line 3 for a day.",
  ],
  approvals: "None expected. Daylight lamps cost about €600, below the €5,000 limit.",
} as const;
