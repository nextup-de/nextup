// What NextUp looked up across the company for each analysis dial - the "Checked across the company"
// list under a dial's reasoning (components/ideas/RaiseSheets.tsx): the org chart, the routing map and
// how its desks decided, the company goals, the problems employees have named, the ideas and initiatives
// already in motion, what shipped against its promise and the spend rule. Every line is built here from
// that data, so it names the real desk, person and figure; where a company has no such data yet, the
// line is left out rather than made up. Pure.
import type { Dept, Idea, Initiative, OrgPerson, Outcome, Problem, Route } from "@/features/demo/types";
import { closest, goalOf } from "@/features/evaluate";
import { proposeRoute } from "@/features/routing";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import { formatEuro } from "@/i18n/format";
import type { DialKey } from "./raise";

export type CompanyFact = { source: string; text: string };
export type CompanyCase = {
  title: string; from: string; assignee: string; assigneeSeatId?: string | null; routeId: string | null; upside: string; open: boolean; raisedDay: number;
  decided: { answer: "yes" | "no"; day: number } | null;
};
export type CompanyInput = {
  text: string; // the idea as it stands: the first message and every answer
  lead: string; // the author's team lead - where anything raised lands first
  leadSeatId?: string | null; // that lead's seat, for the cases on their desk when no route names one
  myDept: string; // the author's department, by name ("Production")
  affected: readonly string[]; // people and departments named as affected
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  routes: readonly Route[];
  goals: readonly { goal: string; keys: string[] }[];
  problems: readonly Problem[];
  ideas: readonly Idea[];
  initiatives: readonly Initiative[];
  outcomes: readonly Outcome[];
  cases: readonly CompanyCase[];
  promiseDays: number;
  spendLimitEur: number | null;
};

export const LAST_DECISIONS = 5; // the last decisions on a desk its record looks at
const TREND: Record<Problem["trend"], MessageKey> = {
  Worsening: "ideas.readTrendWorse",
  Flat: "ideas.readTrendFlat",
  Improving: "ideas.readTrendBetter",
};
// A goal key as a whole word: "mes" is the MES, not the middle of "times".
const says = (text: string, key: string) => new RegExp("\\b" + key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text);
const latest = <C extends CompanyCase>(cs: readonly C[]) =>
  cs.flatMap((c) => (c.decided ? [{ c, d: c.decided }] : [])).sort((a, b) => b.d.day - a.d.day).slice(0, LAST_DECISIONS);

export function companyRead(x: CompanyInput, locale: Locale = DEFAULT_LOCALE): Record<DialKey, CompanyFact[]> {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
  const q = (text: string) => t("ideas.listQuote", { text });
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + t("ideas.listAnd") + " " + xs[xs.length - 1]);
  const fact = (source: MessageKey, text: string): CompanyFact => ({ source: t(source), text });
  const route = proposeRoute(x.text, x.routes);
  const desk = route?.owner.name ?? x.lead;
  // The goal with the most keyword hits, as the benchmark picks it (benchmarks.ts).
  const goal = goalOf(x.text, x.goals);
  const problem = closest(x.text, x.problems, (p) => p.title + " " + p.sub);
  const outcome = closest(x.text, x.outcomes, (o) => o.title);
  const idea = closest(x.text, x.ideas, (i) => i.title + " " + i.rationale);

  // Where it lands: the author's department, the departments named as affected and the desk's own.
  const ownerDept = route ? x.depts.find((d) => d.id === route.owner.dept) : undefined;
  const touched = [x.myDept, ...x.affected].map((n) => x.depts.find((d) => d.name === n)).concat(ownerDept)
    .filter((d, i, all): d is Dept => !!d && all.findIndex((o) => o?.id === d.id) === i);
  // A department's head: its person who reports to someone outside it (or to nobody).
  const head = (id: string) => x.people.find((p) => p.dept === id && x.people.find((r) => r.name === p.reportsTo)?.dept !== id);
  const live = (i: Initiative) => i.status !== "Shipped";
  const named = (is: readonly Initiative[]) => list([...is.slice(0, 2).map((i) => q(i.name) + " (" + i.status.toLowerCase() + ")"), ...(is.length > 2 ? [t("ideas.readMore", { count: is.length - 2 })] : [])]);

  // ── Value: is the pain real, and how far does it reach ──
  const felt = x.problems.filter((p) => touched.some((d) => p.depts.includes(d.id))).sort((a, b) => b.people - a.people);
  const value: (CompanyFact | null)[] = [
    problem ? fact("ideas.readSrcProblems", t(problem.timeLost !== "—" ? "ideas.readProblemLost" : "ideas.readProblem", {
      people: t("ideas.readPersons", { count: problem.people }), depts: t("ideas.readDepts", { count: problem.depts.length }),
      title: q(problem.title), trend: t(TREND[problem.trend]), time: problem.timeLost,
    }))
      : felt.length ? fact("ideas.readSrcProblems", t("ideas.readFelt", { depts: list(touched.map((d) => d.name)), problems: t("ideas.readProblems", { count: felt.length }), title: q(felt[0].title), people: felt[0].people }))
      : null,
    touched.length === 1 ? fact("ideas.readSrcOrg", t("ideas.readOrgOne", { dept: touched[0].name, people: touched[0].people }))
      : touched.length ? fact("ideas.readSrcOrg", t("ideas.readOrgMany", { depts: list(touched.map((d) => d.name + " (" + d.people + ")")), total: touched.reduce((n, d) => n + d.people, 0) }))
      : null,
    outcome ? fact("ideas.readSrcOutcomes", t("ideas.readOutcome", { title: q(outcome.title), promised: outcome.promised, actual: outcome.actual })) : null,
  ];

  // ── Feasibility: who decides, how they decide, how loaded they are ──
  const deskSeatId = route ? route.ownerSeatId ?? null : x.leadSeatId ?? null;
  const onDesk = deskSeatId === null ? [] : x.cases.filter((c) => c.assigneeSeatId === deskSeatId);
  const deskDecided = latest(onDesk);
  const onTime = deskDecided.filter(({ c, d }) => d.day - c.raisedDay <= x.promiseDays).length;
  const openNow = onDesk.filter((c) => c.open).length;
  const busy = ownerDept ? x.initiatives.filter((i) => live(i) && i.depts.includes(ownerDept.id)) : [];
  const feas: (CompanyFact | null)[] = [
    route ? fact("ideas.readSrcRouting", t("ideas.readRoute", { type: q(route.type), owner: route.owner.name, role: route.owner.role, deputy: route.deputy, wait: route.wait }))
      : x.routes.length ? fact("ideas.readSrcRouting", t("ideas.readNoRoute", { count: x.routes.length, lead: x.lead }))
      : null,
    deskDecided.length ? fact("ideas.readSrcCases", t("ideas.readDecided", { desk, onTime, total: deskDecided.length, days: x.promiseDays, count: openNow }))
      : openNow ? fact("ideas.readSrcCases", t("ideas.readDeskOpen", { desk, count: openNow }))
      : null,
    busy.length && ownerDept ? fact("ideas.readSrcInitiatives", t("ideas.readBusy", { dept: ownerDept.name, count: busy.length, named: named(busy) })) : null,
  ];

  // ── Cost: what the team may spend, who signs above it, what comparable ideas cost ──
  const cfo = x.people.find((p) => /\bCFO\b/.test(p.role));
  const waiting = cfo ? x.initiatives.find((i) => live(i) && i.stuckOn?.name === cfo.name) : undefined;
  const cost: (CompanyFact | null)[] = [
    x.spendLimitEur !== null ? fact("ideas.readSrcSpend", t("ideas.readSpend", { limit: formatEuro(locale, x.spendLimitEur) })) : null,
    cfo ? fact("ideas.readSrcOrg", t(waiting ? "ideas.readCfoWaiting" : "ideas.readCfo", { name: cfo.name, role: cfo.role, initiative: waiting ? q(waiting.name) : "" })) : null,
    idea ? fact("ideas.readSrcBoard", t("ideas.readIdea", { title: q(idea.title), effort: idea.effort, upside: idea.upside }))
      : x.ideas.length ? fact("ideas.readSrcBoard", t("ideas.readNoIdea", { count: x.ideas.length }))
      : null,
  ];

  // ── Fit: which goal, and what else already pulls on it ──
  const sameGoal = goal ? x.cases.filter((c) => c.open && c.upside === goal.goal).sort((a, b) => b.raisedDay - a.raisedDay) : [];
  // Work on the same goal so far, what is still running first.
  const moving = goal ? x.initiatives.filter((i) => goal.keys.some((k) => says(i.name + " " + i.why, k))).sort((a, b) => Number(live(b)) - Number(live(a))) : [];
  const fit: (CompanyFact | null)[] = [
    fact("ideas.readSrcGoals", goal ? t("ideas.readGoal", { count: x.goals.length, goal: q(goal.goal) }) : t("ideas.readNoGoal", { count: x.goals.length })),
    goal ? fact("ideas.readSrcCases", sameGoal.length ? t("ideas.readSame", { count: sameGoal.length, title: q(sameGoal[0].title), from: sameGoal[0].from }) : t("ideas.readSameNone")) : null,
    moving.length ? fact("ideas.readSrcInitiatives", t("ideas.readMoving", { named: named(moving) })) : null,
  ];

  // ── Risk: how that desk decides, how promises held, who feels it first ──
  const routeDecided = route ? latest(x.cases.filter((c) => c.routeId === route.id)) : [];
  const yes = routeDecided.filter(({ d }) => d.answer === "yes").length;
  const lastNo = routeDecided.find(({ d }) => d.answer === "no");
  const short = x.outcomes.filter((o) => o.verdict === "Short");
  const heads = touched.map((d) => head(d.id)).filter((p): p is OrgPerson => !!p);
  const risk: (CompanyFact | null)[] = [
    route ? fact("ideas.readSrcDecisions", routeDecided.length
      ? t(lastNo ? "ideas.readDecisionsNo" : "ideas.readDecisions", { yes, total: routeDecided.length, title: lastNo ? q(lastNo.c.title) : "" })
      : t("ideas.readDecisionsNone")) : null,
    x.outcomes.length ? fact("ideas.readSrcOutcomes", short.length
      ? t("ideas.readShort", { count: short.length, total: x.outcomes.length, title: q(short[0].title), promised: short[0].promised, actual: short[0].actual })
      : t("ideas.readAllKept", { total: x.outcomes.length })) : null,
    heads.length ? fact("ideas.readSrcOrg", t("ideas.readFirst", { list: list(heads.map((p) => p.name + " (" + p.role + ")")) })) : null,
  ];

  const keep = (xs: (CompanyFact | null)[]) => xs.filter((f): f is CompanyFact => !!f);
  return { value: keep(value), feas: keep(feas), cost: keep(cost), fit: keep(fit), risk: keep(risk) };
}
