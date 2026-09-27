// NextUp's evaluation of one raised problem or idea. It reads the company context the demo
// seed carries - org chart, routing map (who owns which decision type), known problems, the
// spend rule, goals - and returns what it checked, step by step, plus where the case goes and
// what it is worth. Pure: facts in, steps out. The page animates the steps; nothing here waits.
//
// Demo honesty: this is arithmetic over the seed, not a model. Every step names the fact it
// used, so a manager can ask "where did that come from?" and get an answer.
import type { CaseKind, RouteProposal } from "@/features/cases/events";
import type { OrgPerson, Problem, RolePersona, Route } from "@/features/demo/types";
import { propose, ROUTER_VERSION } from "@/features/routing";
import { scoreCase, type Score } from "@/features/scoring";

export type EvalInput = { kind: CaseKind; text: string; context?: string; affected: string[]; attachments: number; who: { name: string; line: string; handle: string | null } };
export type KnownCase = { title: string; from: string; age: number; open: boolean };
export type EvalContext = { routes: readonly Route[]; people: readonly OrgPerson[]; personas: readonly RolePersona[]; problems: readonly Problem[]; cases: readonly KnownCase[]; promiseDays: number };
export type EvalStep = { id: string; title: string; detail: string };
export type Evaluation = {
  steps: EvalStep[];
  route: Route | null; confidence: number;
  lead: string; // the desk it lands on first: the raiser's own team lead
  passesTo: string | null; // where the lead passes it if it is not theirs
  similar: Problem | null; // a known problem it looks like
  sameAs: KnownCase | null; // a case someone already raised that reads like this one
  score: Score;
  payload: { kind: CaseKind; title: string; body: string; upside: string; routeId: string | null; assignee: string; fromDept: string; reason: string; affected: string[]; attachments: number; proposal: RouteProposal };
};

// The demo company's goals, as the board would state them. Matched by keyword so a step can say which goal a case serves.
export const GOALS: { goal: string; keys: string[] }[] = [
  { goal: "No line stops waiting for a signature", keys: ["stop", "stood", "wait", "sign", "order", "approve", "night"] },
  { goal: "Scrap and rework on the 4-series down 20 %", keys: ["scrap", "rework", "tolerance", "casting", "quality", "drift", "defect"] },
  { goal: "Every changeover under 20 minutes", keys: ["changeover", "setup", "fixture", "jig", "tooling", "sheet", "mes"] },
  { goal: "New hires productive in week one", keys: ["login", "access", "apprentice", "hire", "onboard", "account"] },
];
export const SPEND_RULE = { limit: "€5k", text: "team-level authority up to €5k, no controlling sign-off" };

const words = (s: string) => s.toLowerCase().match(/[a-zäöüß€0-9]{4,}/g) ?? [];

// The closest of `items` by shared words (4+ letters), or null under two shared words.
function closest<T>(text: string, items: readonly T[], of: (t: T) => string): T | null {
  const w = new Set(words(text));
  let best: T | null = null, bestHits = 0;
  for (const it of items) {
    const hits = new Set(words(of(it)).filter((x) => w.has(x))).size;
    if (hits > bestHits) { best = it; bestHits = hits; }
  }
  return bestHits >= 2 ? best : null;
}

export function evaluate(input: EvalInput, ctx: EvalContext): Evaluation {
  const text = input.text.trim();
  const context = (input.context ?? "").trim();
  const full = context ? text + " " + context : text; // the one line is the title; the optional context only helps the matching
  const lower = full.toLowerCase();
  const proposal = propose(full, ctx.routes);
  const route = proposal?.route ?? null;
  const confidence = proposal?.confidence ?? 0;
  const me = ctx.people.find((p) => p.name === input.who.name);
  const lead = me?.reportsTo ?? ctx.personas.find((r) => r.id === "leader")?.who.name ?? "Triage desk";
  const leadRow = ctx.people.find((p) => p.name === lead);
  const passesTo = route && route.owner.name !== lead ? route.owner.name : null;
  const similar = closest(full, ctx.problems, (p) => p.title + " " + p.sub);
  const sameAs = closest(full, ctx.cases.filter((c) => c.title !== text), (c) => c.title);
  const goal = GOALS.find((g) => g.keys.some((k) => lower.includes(k))) ?? null;
  const spend = /€|spend|buy|order|purchase|budget|cost|invoice/.test(lower);
  // Scored exactly as the dashboard will score the stored case: the goal it serves is kept as its upside.
  const upside = goal ? goal.goal : "";
  const score = scoreCase({ routeId: route?.id ?? null, upside, body: "", age: 0, open: true, affected: input.affected.length, evidence: input.attachments }, ctx.promiseDays);
  const thing = input.kind === "idea" ? "idea" : "problem";

  const steps: EvalStep[] = [
    { id: "read", title: "Reading the " + thing, detail: words(full).length + " words from " + (input.who.handle ?? input.who.name) + " · " + input.who.line + (input.attachments ? " · " + input.attachments + (input.attachments === 1 ? " screenshot" : " screenshots") : "") },
    { id: "org", title: "Org chart · who is responsible", detail: (leadRow ? lead + " leads your team (" + leadRow.role + ")" : lead + " leads your team") + (route ? " · " + route.owner.name + " owns “" + route.type + "”" : " · no map entry matches yet") },
    { id: "goals", title: "Company goals & values", detail: goal ? "Serves: “" + goal.goal + "”" : "No stated goal matches directly — logged as a new signal" },
    { id: "budget", title: "Budget & authority", detail: spend ? "Spend involved — " + SPEND_RULE.text : "No spend needed to decide this" },
    { id: "history", title: "Raised before?", detail: sameAs ? "Yes — “" + sameAs.title + "” by " + sameAs.from + ", " + (sameAs.age === 0 ? "today" : sameAs.age + " d ago") + (sameAs.open ? ", still open" : "")
      : similar ? "Looks like “" + similar.title + "” · " + similar.people + " people, " + similar.age : "Nothing similar in the last 12 months" },
    { id: "affected", title: "Who else it touches", detail: input.affected.length ? input.affected.join(", ") + " · " + (input.affected.length + 1) + " people in total" : "You so far — others can add themselves" },
    { id: "worth", title: "What it is worth", detail: "Score " + score.value + " · " + (score.parts.map((p) => p.label.toLowerCase()).join(", ") || "base only") },
    { id: "route", title: "Forwarding", detail: "→ " + lead + (passesTo ? " → " + passesTo + " if it is theirs" : "") + " · answer owed in " + ctx.promiseDays + " d" },
  ];

  return {
    steps, route, confidence, lead, passesTo, similar, sameAs, score,
    payload: { kind: input.kind, title: text, body: context, upside, routeId: route?.id ?? null, assignee: lead, fromDept: input.who.line, reason: route ? "triage" : "not responsible", affected: input.affected, attachments: input.attachments,
      proposal: { routeId: route?.id ?? null, confidence, source: "keywords", version: ROUTER_VERSION } },
  };
}
