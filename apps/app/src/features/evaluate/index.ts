// NextUp's evaluation of one raised problem or idea. It reads the company context the demo
// seed carries - org chart, routing map (who owns which decision type), known problems, the
// spend rule, goals - and returns what it checked, step by step, plus where the case goes and
// what it is worth. Pure: facts in, steps out. The page animates the steps; nothing here waits.
//
// Demo honesty: this is arithmetic over the seed, not a model. Every step names the fact it
// used, so a manager can ask "where did that come from?" and get an answer.
import type { CaseKind, RouteProposal, Visibility } from "@/features/cases/events";
import type { OrgPerson, Problem, RolePersona, Route, SeedGoal, SpendRule } from "@/features/demo/types";
import { propose, ROUTER_VERSION } from "@/features/routing";
import type { BrainProposal } from "@/features/routing/brain";
import { scoreCase, type Score } from "@/features/scoring";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";

export type EvalInput = { kind: CaseKind; text: string; context?: string; affected: string[]; attachments: number; who: { name: string; line: string; handle: string | null }; visibility?: Visibility; seenBy?: string[] };
export type KnownCase = { id?: string; title: string; from: string; age: number; open: boolean };
export type EvalContext = { routes: readonly Route[]; people: readonly OrgPerson[]; personas: readonly RolePersona[]; problems: readonly Problem[]; cases: readonly KnownCase[]; promiseDays: number; goals: readonly SeedGoal[]; spend: SpendRule | null };
export type EvalStep = { id: string; title: string; detail: string };
export type Evaluation = {
  steps: EvalStep[];
  route: Route | null; confidence: number;
  lead: string; // the desk it lands on first: the raiser's own team lead
  leadIs: "lead" | "route" | "triage"; // what `lead` is: the team lead, the proposed route's owner (no lead known), or the triage desk
  passesTo: string | null; // where the lead passes it if it is not theirs
  similar: Problem | null; // a known problem it looks like
  sameAs: KnownCase | null; // a case someone already raised that reads like this one
  score: Score;
  payload: { kind: CaseKind; title: string; body: string; upside: string; routeId: string | null; assignee: string; fromDept: string; reason: string; affected: string[]; attachments: number; proposal: RouteProposal; visibility?: Visibility; seenBy?: string[] };
};

// Words that say nothing about what a text is about, however often two texts share them.
const FILLER = new Set(("that this with from have been were will would could should there their they them then than what when where which while " +
  "about after before also into only just more most much some such very still even each every other over under again once here does done " +
  "four five three week weeks today said says make made take like want need know think back away same").split(" "));
export const words = (s: string) => (s.toLowerCase().match(/[a-zäöüß€0-9]{4,}/g) ?? []).filter((w) => !FILLER.has(w));

// The closest of `items` by shared words (4+ letters, no filler): three, or two that are half of the
// item's own words - a long text shares a word or two with almost anything.
export function closest<T>(text: string, items: readonly T[], of: (t: T) => string): T | null {
  const w = new Set(words(text));
  let best: T | null = null, bestHits = 0;
  for (const it of items) {
    const own = new Set(words(of(it)));
    const hits = [...own].filter((x) => w.has(x)).length;
    if ((hits >= 3 || (hits === 2 && hits * 2 >= own.size)) && hits > bestHits) { best = it; bestHits = hits; }
  }
  return best;
}

// A goal's keys as whole words or word starts ("wait" in "waiting", never "mes" in "comes").
const says = (lower: string, key: string) => new RegExp("\\b" + key.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(lower);
export const goalHits = (text: string, g: { keys: readonly string[] }) => { const lower = text.toLowerCase(); return g.keys.filter((k) => says(lower, k)).length; };

// The goal an idea serves: the one with the most of its keys in the text, and at least two - one shared
// word ("tooling" in a list of problem types) does not make an idea about a goal.
export function goalOf<G extends { keys: readonly string[] }>(text: string, goals: readonly G[]): G | null {
  let best: G | null = null, bestHits = 1;
  for (const g of goals) { const n = goalHits(text, g); if (n > bestHits) { best = g; bestHits = n; } }
  return best;
}

// `brain`: the language model's proposal (features/routing/brain), when the stack has one and it
// answered in time. It replaces the keyword row and the "raised before?" match; without it both
// come from the keywords, as before.
export function evaluate(input: EvalInput, ctx: EvalContext, brain: BrainProposal | null = null, locale: Locale = DEFAULT_LOCALE): Evaluation {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
  const text = input.text.trim();
  const context = (input.context ?? "").trim();
  const full = context ? text + " " + context : text; // the one line is the title; the optional context only helps the matching
  const lower = full.toLowerCase();
  const keywords = brain ? null : propose(full, ctx.routes);
  const route = brain ? ctx.routes.find((r) => r.id === brain.proposal.routeId) ?? null : keywords?.route ?? null;
  const confidence = brain ? (route ? brain.proposal.confidence : 0) : keywords?.confidence ?? 0;
  const me = ctx.people.find((p) => p.name === input.who.name);
  // The first desk: the raiser's team lead, else (a company whose personas have no names) the owner of the route
  // it is proposed for, else the triage desk. An empty name is no desk: it showed as "?" in the studio.
  const named = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  const teamLead = named(me?.reportsTo) ?? named(ctx.personas.find((r) => r.id === "leader")?.who.name);
  const routeDesk = route ? named(route.owner.name) ?? named(route.owner.role) : null;
  const leadIs: Evaluation["leadIs"] = teamLead ? "lead" : routeDesk ? "route" : "triage";
  const lead = teamLead ?? routeDesk ?? "Triage desk"; // eslint-disable-line -- stored as the case assignee: data, not display text
  const leadRow = ctx.people.find((p) => p.name === lead);
  const passesTo = route && route.owner.name !== lead ? route.owner.name : null;
  const similar = brain ? ctx.problems.find((p) => p.id === brain.sameAs) ?? null : closest(full, ctx.problems, (p) => p.title + " " + p.sub);
  const sameAs = brain ? ctx.cases.find((c) => c.id !== undefined && c.id === brain.sameAs) ?? null : closest(full, ctx.cases.filter((c) => c.title !== text), (c) => c.title);
  const goal = goalOf(full, ctx.goals);
  const spend = /€|spend|buy|order|purchase|budget|cost|invoice/.test(lower);
  // Scored exactly as the dashboard will score the stored case: the goal it serves is kept as its upside.
  const upside = goal ? goal.goal : "";
  const score = scoreCase({ routeId: route?.id ?? null, upside, body: "", age: 0, open: true, affected: input.affected.length, evidence: input.attachments, routeSource: brain ? "llm" : "keywords" }, ctx.promiseDays, t);
  const sep = " · ";
  const shots = input.attachments ? [t("structure.evalReadScreenshots", { count: input.attachments })] : [];
  const owns = route ? t("structure.evalOrgOwns", { owner: route.owner.name, type: route.type }) : t("structure.evalOrgNoMatch");
  const when = sameAs ? (sameAs.age === 0 ? t("structure.evalHistoryToday") : t("structure.evalHistoryDaysAgo", { age: sameAs.age })) : "";

  const steps: EvalStep[] = [
    { id: "read", title: t(input.kind === "idea" ? "structure.evalReadTitleIdea" : "structure.evalReadTitleProblem"), detail: [t("structure.evalReadDetail", { words: words(full).length, who: input.who.handle ?? input.who.name, line: input.who.line }), ...shots].join(sep) },
    { id: "org", title: t("structure.evalOrgTitle"), detail: [leadRow ? t("structure.evalOrgLeadsRole", { lead, role: leadRow.role }) : t("structure.evalOrgLeads", { lead }), owns, ...(brain?.reason ? [brain.reason] : [])].join(sep) },
    { id: "goals", title: t("structure.evalGoalsTitle"), detail: goal ? t("structure.evalGoalsServes", { goal: goal.goal }) : t("structure.evalGoalsNone") },
    { id: "budget", title: t("structure.evalBudgetTitle"), detail: spend ? t("structure.evalBudgetSpend", { rule: ctx.spend ? ctx.spend.text : t("structure.evalBudgetNoRule") }) : t("structure.evalBudgetNone") },
    { id: "history", title: t("structure.evalHistoryTitle"), detail: sameAs ? t(sameAs.open ? "structure.evalHistorySameOpen" : "structure.evalHistorySame", { title: sameAs.title, from: sameAs.from, when })
      : similar ? t("structure.evalHistoryLooks", { title: similar.title, people: similar.people, age: similar.age }) : t("structure.evalHistoryNone") },
    { id: "affected", title: t("structure.evalAffectedTitle"), detail: input.affected.length ? t("structure.evalAffectedList", { names: input.affected.join(", "), total: input.affected.length + 1 }) : t("structure.evalAffectedNone") },
    { id: "worth", title: t("structure.evalWorthTitle"), detail: t("structure.evalWorthDetail", { score: score.value, parts: score.parts.map((p) => p.label.toLowerCase()).join(", ") || t("structure.evalWorthBase") }) },
    { id: "route", title: t("structure.evalRouteTitle"), detail: passesTo ? t("structure.evalRoutePasses", { lead, next: passesTo, days: ctx.promiseDays }) : t("structure.evalRouteDetail", { lead, days: ctx.promiseDays }) },
  ];

  return {
    steps, route, confidence, lead, leadIs, passesTo, similar, sameAs, score,
    payload: { kind: input.kind, title: text, body: context, upside, routeId: route?.id ?? null, assignee: lead, fromDept: input.who.line, reason: route ? "triage" : "not responsible", affected: input.affected, attachments: input.attachments,
      proposal: brain ? { ...brain.proposal, routeId: route?.id ?? null, confidence } : { routeId: route?.id ?? null, confidence, source: "keywords", version: ROUTER_VERSION },
      ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.visibility === "custom" ? { seenBy: input.seenBy ?? [] } : {}) },
  };
}
