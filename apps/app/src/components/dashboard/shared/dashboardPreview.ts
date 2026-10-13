// Stand-ins for what the event log cannot count yet - the list for Kevin is DASHBOARD-FOR-KEVIN.txt.
// The Dashboard is the real screen; these figures are the handoff's demo data, the same for every
// company and department. Each block goes once its source exists. Facts only - the sentences are built
// where they are shown. What the seed already holds (stall reasons, the ledger, outcomes, the KPI
// headlines) is read from the seed, not from here.

export type Tint = "orange" | "green" | "grey" | "ink" | "blue";
export type Pill = { label: string; tint: Tint };
export type ListRow = { title: string; right: string; pills: Pill[]; meta: string };

/** Seven months, Mar-Sep: the first three are before NextUp, the rest the pilot. */
export const MONTHS7 = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
export const BEFORE = 3;

export type KpiId = "dec" | "ship" | "val" | "saved" | "within" | "first";
export type KpiUnit = "days" | "count" | "euroK" | "daysSaved" | "pct" | "hours";
export type KpiSeries = { id: KpiId; label: string; sub: string; unit: KpiUnit; vals: number[]; limit?: number; note: string; splitTitle: string; split: [string, number][] };

const D5 = ["Production", "Engineering", "Quality", "Operations", "Logistics"];
export const KPIS: KpiSeries[] = [
  { id: "dec", label: "Idea → decision", sub: "median, last 30 days", unit: "days", vals: [12, 11, 11.5, 6, 4.6, 4.1, 4], limit: 5, note: "Median days from raising an idea to a decision. Lower is better.", splitTitle: "By department, last 30 days", split: D5.map((d, i) => [d, [3, 4, 6.5, 3, 5][i]]) },
  { id: "ship", label: "Shipped this year", sub: "", unit: "count", vals: [0, 0, 0, 1, 1, 1, 2], note: "Ideas that reached their goal and were handed over to the line.", splitTitle: "Where this year’s ideas ended up", split: [["Shipped", 2], ["Running as pilot", 4], ["Stopped early", 3], ["Approved, not started", 5]] },
  { id: "val", label: "Value booked", sub: "", unit: "euroK", vals: [270, 270, 270, 380, 480, 590, 705], note: "Value confirmed by Finance for shipped ideas, cumulative.", splitTitle: "By idea", split: [["Retrofit kit line", 410], ["Spare parts quoting", 231], ["New-hire access", 40], ["Fixture redesign", 24]] },
  { id: "saved", label: "Waiting days saved", sub: "across 8 ideas", unit: "daysSaved", vals: [0, 0, 0, 28, 55, 86, 120], note: "Days ideas would have waited on the old approval route, minus the days they waited here.", splitTitle: "Top ideas", split: [["Team spend authority", 38], ["Test-rig time", 26], ["Supplier scorecard", 21], ["Laptop swaps", 18], ["Contract template", 17]] },
  { id: "within", label: "Answered within 5 days", sub: "share of ideas, this quarter", unit: "pct", vals: [31, 29, 33, 58, 72, 80, 84], note: "Share of ideas that got a first answer from a team lead within 5 working days.", splitTitle: "By department, this quarter", split: D5.map((d, i) => [d, [89, 81, 71, 92, 84][i]]) },
  { id: "first", label: "Median to first answer", sub: "from raising to first reply", unit: "hours", vals: [216, 200, 220, 96, 52, 34, 26], note: "Median hours from raising an idea to the first answer from a team lead. Lower is better.", splitTitle: "By department, last 30 days", split: D5.map((d, i) => [d, [22, 30, 41, 18, 27][i]]) },
];
/** "Shipped this year" has no count in the seed yet. */
export const SHIPPED_THIS_YEAR = 2;

/** Ideas raised per month, Apr-Sep: raised, answered, answered within the promise, approved or piloted. */
export const TREND_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
export const TREND_YEAR = 2026;
export const TREND_FIRST_LONG = "April";
export const TREND: [number, number, number, number][] = [[21, 18, 6, 5], [26, 24, 11, 7], [30, 29, 17, 9], [38, 36, 25, 12], [48, 45, 35, 14], [62, 57, 48, 15]];
export const TREND_MAX = 80;

/** Open ideas per stage, with average days in the stage and the ideas in it (longest first). */
export type StageIdea = { title: string; who: string; days: number };
export type Stage = { name: string; n: number; days: number; color: string; running?: boolean; ideas: StageIdea[] };
const si = (title: string, who: string, days: number): StageIdea => ({ title, who, days });
export const STAGES: Stage[] = [
  { name: "Raised", n: 6, days: 0.1, color: "#c7cfdb", ideas: [si("Night-shift handover checklist", "Production · Ali Demir", 0.4), si("Shared forklift booking", "Logistics · Jana Weiss", 0.2), si("Label printers at every line", "Production · Ivo Petrov", 0.1)] },
  { name: "AI check", n: 4, days: 0.2, color: "#9fb4d1", ideas: [si("Reusable test fixtures library", "Engineering · Lukas Brandl", 0.3), si("Vendor portal for invoices", "Operations · Mia Graf", 0.2)] },
  { name: "Team lead", n: 23, days: 3.4, color: "#007aff", ideas: [si("Team-level spend authority up to €5k", "Operations · Clara Ilg · desk: T. Vogel", 4.6), si("Hold 20% of test-rig time for experiments", "Engineering · Markus Roth · desk: K. Hofer", 4.1), si("One contract template for all regions", "Legal · Elena Rossi · desk: C. Baker", 3.2), si("Energy dashboard on every shop floor", "Sustainability · Kerem Yilmaz · desk: R. Keller", 1.4)] },
  { name: "Decision", n: 9, days: 6.8, color: "#0b4fa8", ideas: [si("Shared supplier scorecard across plants", "Procurement · Anton Novak · desk: Plant board", 11.2), si("One measurement record, one place", "Quality · Hanna Sander · desk: Digital board", 8.4), si("Self-service laptop swaps at reception", "IT · Peter Okafor · desk: IT council", 6.1), si("Open the canteen for supplier visits", "Facilities · Rolf Keller · desk: Site lead", 2.0)] },
  { name: "In progress", n: 31, days: 41, color: "#1f7a3a", running: true, ideas: [si("Reuse packaging from inbound parts", "Logistics · Tobias Vogel · pilot week 6", 41), si("Pair new hires with a line operator", "People · Sara Lindqvist · rolling out", 33), si("Retire the monthly status deck", "PMO · Julia Brenner · pilot week 3", 19)] },
];

/** How team leads answered this quarter, and the mix per lead (same order as ANSWERS). */
export const ANSWERS: { label: string; n: number; color: string }[] = [
  { label: "Approve", n: 22, color: "#1f7a3a" },
  { label: "Start as pilot", n: 19, color: "#007aff" },
  { label: "More info", n: 31, color: "#8e8e93" },
  { label: "Route to expert", n: 14, color: "#5b6b82" },
  { label: "Decline", n: 52, color: "#1c1c1e" },
];
export type Lead = { name: string; dept: string; mix: number[]; median: number; within: string };
export const LEADS: Lead[] = [
  { name: "Tobias Vogel", dept: "Operations", mix: [7, 6, 8, 3, 10], median: 2.6, within: "94%" },
  { name: "Katrin Hofer", dept: "Engineering", mix: [5, 6, 7, 4, 11], median: 3.1, within: "88%" },
  { name: "Chris Baker", dept: "Quality", mix: [3, 2, 9, 2, 12], median: 6.4, within: "64%" },
  { name: "Rolf Keller", dept: "Facilities", mix: [4, 3, 4, 3, 9], median: 2.9, within: "91%" },
  { name: "Ines Brandt", dept: "Production", mix: [3, 2, 3, 2, 10], median: 3.8, within: "80%" },
];

/** Did shipped work pay off: who shipped it and when (by outcome title), and the two still running. */
export const SHIPPED_BY: Record<string, { team: string; when: string }> = {
  "Bundle new-hire access into one request": { team: "People", when: "Mar 2026" },
  "Self-serve spare parts quoting": { team: "Sales", when: "Feb 2026" },
  "4-series fixture redesign": { team: "Engineering", when: "May 2026" },
  "Retrofit kit line, phase one": { team: "Production", when: "Jun 2026" },
};
export const RUNNING: { title: string; team: string; when: string; promised: string; actual: string }[] = [
  { title: "Reuse packaging from inbound parts", team: "Logistics", when: "Aug 2026", promised: "€180k / yr", actual: "€64k so far" },
  { title: "Pair new hires with a line operator", team: "People", when: "Sep 2026", promised: "−30% early leavers", actual: "measuring" },
];

/** Where the waiting goes: the design's copy per stall reason, and its longest cases. */
export const STALL_DETAIL: Record<string, { desc: string; ex: [string, string][] }> = {
  "Wrong department": { desc: "The routing was wrong. It went one level up instead of sideways.", ex: [["Shared supplier scorecard across plants", "9 d"], ["Vendor portal for invoices", "6 d"]] },
  "Not responsible": { desc: "The routing had no entry, so nobody owned it.", ex: [["One measurement record, one place", "8 d"], ["Open the canteen for supplier visits", "5 d"]] },
  "No time → returned": { desc: "Bounced back to the sender unread.", ex: [["Hold 20% of test-rig time for experiments", "4 d"], ["Label printers at every line", "3 d"]] },
  "Is it important": { desc: "The lead could not rank it against their own work.", ex: [["Energy dashboard on every shop floor", "5 d"], ["Quarterly open day for internal tools", "3 d"]] },
};

const p = (label: string, tint: Tint): Pill => ({ label, tint });
export const SUPPORTED: ListRow[] = [
  { title: "Customer complaints routed straight to design", right: "64", pills: [p("Team lead", "blue")], meta: "supporters · 18 comments" },
  { title: "Energy dashboard on every shop floor", right: "41", pills: [p("AI check", "grey")], meta: "supporters · 9 comments" },
  { title: "Reuse packaging from inbound parts", right: "33", pills: [p("In progress", "green")], meta: "supporters · 12 comments" },
  { title: "Self-service laptop swaps at reception", right: "27", pills: [p("Decision", "blue")], meta: "supporters · 6 comments" },
  { title: "Quarterly open day for internal tools", right: "22", pills: [p("Team lead", "blue")], meta: "supporters · 4 comments" },
  { title: "One contract template for all regions", right: "19", pills: [p("Team lead", "blue")], meta: "supporters · 7 comments" },
  { title: "Pair new hires with a line operator", right: "17", pills: [p("In progress", "green")], meta: "supporters · 5 comments" },
  { title: "Open the canteen for supplier visits", right: "12", pills: [p("Decision", "blue")], meta: "supporters · 3 comments" },
];
export const SCORED: ListRow[] = [
  { title: "Shared supplier scorecard across plants", right: "86", pills: [p("Decision", "blue")], meta: "Procurement · Anton Novak" },
  { title: "Team-level spend authority up to €5k", right: "78", pills: [p("Team lead", "blue")], meta: "Operations · Clara Ilg" },
  { title: "Pair new hires with a line operator", right: "74", pills: [p("In progress", "green")], meta: "People · Sara Lindqvist" },
  { title: "One contract template for all regions", right: "71", pills: [p("Team lead", "blue")], meta: "Legal · Elena Rossi" },
  { title: "Customer complaints routed straight to design", right: "70", pills: [p("Team lead", "blue")], meta: "Customer Service · Léa Moreau" },
  { title: "Hold 20% of test-rig time for experiments", right: "66", pills: [p("Team lead", "blue")], meta: "Engineering · Markus Roth" },
  { title: "One measurement record, one place", right: "62", pills: [p("Decision", "blue")], meta: "Quality · Hanna Sander" },
  { title: "Reuse packaging from inbound parts", right: "61", pills: [p("In progress", "green")], meta: "Logistics · Tobias Vogel" },
];
export const BY_DEPT: ListRow[] = [
  { title: "Production", right: "38", pills: [], meta: "ideas · 89% answered within 5 days" },
  { title: "Engineering", right: "27", pills: [], meta: "ideas · 81% answered within 5 days" },
  { title: "Quality", right: "21", pills: [p("2 past promise", "orange")], meta: "ideas · 71% within 5 days" },
  { title: "Operations", right: "19", pills: [], meta: "ideas · 92% answered within 5 days" },
  { title: "Logistics", right: "14", pills: [], meta: "ideas · 84% answered within 5 days" },
  { title: "People", right: "11", pills: [], meta: "ideas · 90% answered within 5 days" },
  { title: "Procurement", right: "10", pills: [p("1 past promise", "orange")], meta: "ideas · 78% within 5 days" },
  { title: "Facilities", right: "8", pills: [], meta: "ideas · 91% answered within 5 days" },
];
