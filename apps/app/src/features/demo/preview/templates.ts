// The three templates of the click-through preview at /demo/preview: what a yes could start from once
// templates exist (docs/plans/2026-11-08_project-workflows.md). Made-up content that shows the idea to
// people before anything is built; the real library (features/templates/library.ts, step W-1 of that
// plan) replaces it. Steps name roles, never people. English only, like the demo's seed.
export type TemplateKey = "quick-win" | "8d" | "investment";
/** `dueDay`: days after the project's start. */
export type TemplateStep = { title: string; role: string; dueDay: number };

export type PreviewTemplate = {
  key: TemplateKey;
  name: string;
  forWhat: string;
  steps: readonly TemplateStep[];
  roles: readonly string[];
  metric: { name: string; unit: string; better: "up" | "down" };
  measureDays: readonly number[];
  approvals: string;
  rhythm: string;
  /** A step earlier projects of this kind needed and the template does not have: the agent's "Plan" suggestion. */
  learned: { step: TemplateStep; why: string };
};

export const PREVIEW_TEMPLATES: readonly PreviewTemplate[] = [
  {
    key: "quick-win",
    name: "Quick win (KVP)",
    forWhat: "Small improvements a team decides and does on its own.",
    steps: [
      { title: "Try it at one station", role: "Team lead", dueDay: 3 },
      { title: "Ask the people who work with it", role: "Team lead", dueDay: 7 },
      { title: "Make it the standard, with a photo", role: "Team lead", dueDay: 10 },
    ],
    roles: ["Lead"],
    metric: { name: "Minutes saved per shift", unit: "min", better: "up" },
    measureDays: [30],
    approvals: "None below the team's spending limit.",
    rhythm: "No check-in",
    learned: {
      step: { title: "Tell the other shifts what changed", role: "Team lead", dueDay: 8 },
      why: "In earlier quick wins the night shift heard about the change last. This project has no step for it.",
    },
  },
  {
    key: "8d",
    name: "8D quality case",
    forWhat: "Customer complaints and internal failures.",
    steps: [
      { title: "D1 Name the team", role: "Quality lead", dueDay: 0 },
      { title: "D2 Describe the problem", role: "Quality engineer", dueDay: 1 },
      { title: "D3 Contain it: sort the stock, protect the customer", role: "Shift lead", dueDay: 1 },
      { title: "D4 Find the root cause", role: "Quality engineer", dueDay: 7 },
      { title: "D5 Choose the corrective action", role: "Process engineer", dueDay: 10 },
      { title: "D6 Put it in place and prove it works", role: "Process engineer", dueDay: 25 },
      { title: "D7 Prevent it elsewhere: update the standards", role: "Quality lead", dueDay: 35 },
      { title: "D8 Close and recognise the team", role: "Sponsor", dueDay: 40 },
    ],
    roles: ["Lead", "Sponsor", "A member from production", "A member from engineering"],
    metric: { name: "Customer complaints", unit: "per quarter", better: "down" },
    measureDays: [30, 90],
    approvals: "None below €5,000; the quality board above.",
    rhythm: "Weekly check-in",
    learned: {
      step: { title: "Check the packaging with the supplier", role: "Purchasing", dueDay: 12 },
      why: "Two earlier 8D cases on surface damage found the cause in transport. This project has no step for it.",
    },
  },
  {
    key: "investment",
    name: "Investment request",
    forWhat: "Spending above the team's limit, decided in stages.",
    steps: [
      { title: "Concept: write the business case", role: "Lead", dueDay: 10 },
      { title: "Concept: get two quotes", role: "Purchasing", dueDay: 15 },
      { title: "Gate: budget approval", role: "Budget owner", dueDay: 20 },
      { title: "Pilot: run it at one line", role: "Process engineer", dueDay: 50 },
      { title: "Gate: decide the roll-out", role: "Sponsor", dueDay: 60 },
      { title: "Roll-out: roll out and train", role: "Lead", dueDay: 90 },
    ],
    roles: ["Lead", "Sponsor", "Purchasing", "Controlling"],
    metric: { name: "Payback", unit: "months", better: "down" },
    measureDays: [90, 180],
    approvals: "The budget owner above the spending limit; the investment council above €50,000.",
    rhythm: "Check-in every two weeks",
    learned: {
      step: { title: "Ask Maintenance about the running costs", role: "Maintenance lead", dueDay: 12 },
      why: "An earlier investment request was sent back because the running costs were missing from the business case.",
    },
  },
];

export const templateOf = (key: TemplateKey): PreviewTemplate => PREVIEW_TEMPLATES.find((t) => t.key === key)!;
