// What NextUp looked up across the company for each analysis dial - the "Checked across the company"
// list under a dial's reasoning (components/ideas/RaiseSheets.tsx): the org chart, the routing map and
// how its desks decided, the company goals, the problems employees have named, the ideas and initiatives
// already in motion, what shipped against its promise and the spend rule. Every line is built here from
// that data, so it names the real desk, person and figure; where a company has no such data yet, the
// line is left out rather than made up. Pure.
import type { Dept, Idea, Initiative, OrgPerson, Outcome, Problem, Route } from "@/features/demo/types";
import { closest } from "@/features/evaluate";
import { proposeRoute } from "@/features/routing";
import type { DialKey } from "./raise";

export type CompanyFact = { source: string; text: string };
export type CompanyCase = {
  title: string; from: string; assignee: string; routeId: string | null; upside: string; open: boolean; raisedDay: number;
  decided: { answer: "yes" | "no"; day: number } | null;
};
export type CompanyInput = {
  text: string; // the idea as it stands: the first message and every answer
  lead: string; // the author's team lead - where anything raised lands first
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
  spendLimitEur: number;
};

export const LAST_DECISIONS = 5; // the last decisions on a desk its record looks at
const q = (s: string) => "“" + s + "”";
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const count = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);
const TREND: Record<Problem["trend"], string> = { Worsening: "and it is getting worse", Flat: "and it is not easing", Improving: "though it is easing" };
// A goal key as a whole word: "mes" is the MES, not the middle of "times".
const says = (text: string, key: string) => new RegExp("\\b" + key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text);
const latest = <C extends CompanyCase>(cs: readonly C[]) =>
  cs.flatMap((c) => (c.decided ? [{ c, d: c.decided }] : [])).sort((a, b) => b.d.day - a.d.day).slice(0, LAST_DECISIONS);

export function companyRead(x: CompanyInput): Record<DialKey, CompanyFact[]> {
  const lower = x.text.toLowerCase();
  const route = proposeRoute(x.text, x.routes);
  const desk = route?.owner.name ?? x.lead;
  // The goal with the most keyword hits, as the benchmark picks it (benchmarks.ts).
  const hits = (g: { keys: string[] }) => g.keys.filter((k) => lower.includes(k.toLowerCase())).length;
  const goal = x.goals.reduce<CompanyInput["goals"][number] | null>((b, g) => (hits(g) > (b ? hits(b) : 0) ? g : b), null);
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
  const named = (is: readonly Initiative[]) => list([...is.slice(0, 2).map((i) => q(i.name) + " (" + i.status.toLowerCase() + ")"), ...(is.length > 2 ? [is.length - 2 + " more"] : [])]);

  // ── Value: is the pain real, and how far does it reach ──
  const felt = x.problems.filter((p) => touched.some((d) => p.depts.includes(d.id))).sort((a, b) => b.people - a.people);
  const value: (CompanyFact | null)[] = [
    problem ? { source: "Named problems", text: count(problem.people, "person", "people") + " in " + count(problem.depts.length, "department") + " have named " + q(problem.title) + ", " + TREND[problem.trend] + (problem.timeLost !== "—" ? " (" + problem.timeLost + " lost so far)" : "") + "." }
      : felt.length ? { source: "Named problems", text: "Employees in " + list(touched.map((d) => d.name)) + " have named " + count(felt.length, "problem") + "; the most widely felt is " + q(felt[0].title) + " (" + felt[0].people + " people). None matches this one yet, so it would start a new one." }
      : null,
    touched.length === 1 ? { source: "Org chart", text: touched[0].name + ", where this lands, has " + touched[0].people + " people." }
      : touched.length ? { source: "Org chart", text: list(touched.map((d) => d.name + " (" + d.people + ")")) + ": " + touched.reduce((n, d) => n + d.people, 0) + " people work where this lands." }
      : null,
    outcome ? { source: "Shipped outcomes", text: "The closest change already shipped, " + q(outcome.title) + ", promised " + outcome.promised + " and delivered " + outcome.actual + "." } : null,
  ];

  // ── Feasibility: who decides, how they decide, how loaded they are ──
  const onDesk = x.cases.filter((c) => c.assignee === desk);
  const deskDecided = latest(onDesk);
  const onTime = deskDecided.filter(({ c, d }) => d.day - c.raisedDay <= x.promiseDays).length;
  const openNow = onDesk.filter((c) => c.open).length;
  const busy = ownerDept ? x.initiatives.filter((i) => live(i) && i.depts.includes(ownerDept.id)) : [];
  const feas: (CompanyFact | null)[] = [
    route ? { source: "Routing map", text: q(route.type) + " is " + route.owner.name + "’s desk (" + route.owner.role + "), with " + route.deputy + " as deputy. That desk usually answers in " + route.wait + "." }
      : x.routes.length ? { source: "Routing map", text: "None of the " + x.routes.length + " rows in the routing map matches, so it lands with " + x.lead + ", your team lead." }
      : null,
    deskDecided.length ? { source: "Case history", text: desk + " decided " + onTime + " of the last " + deskDecided.length + " cases on that desk within " + x.promiseDays + " days; " + (openNow === 1 ? "1 case is" : openNow + " cases are") + " open there today." }
      : openNow ? { source: "Case history", text: desk + " has " + count(openNow, "open case") + " and no decision on record yet." }
      : null,
    busy.length && ownerDept ? { source: "Initiatives", text: ownerDept.name + " already carries " + count(busy.length, "initiative") + ": " + named(busy) + "." } : null,
  ];

  // ── Cost: what the team may spend, who signs above it, what comparable ideas cost ──
  const cfo = x.people.find((p) => /\bCFO\b/.test(p.role));
  const waiting = cfo ? x.initiatives.find((i) => live(i) && i.stuckOn?.name === cfo.name) : undefined;
  const cost: (CompanyFact | null)[] = [
    { source: "Spend rule", text: "Team leads approve up to €" + x.spendLimitEur.toLocaleString("en") + " without a controlling sign-off." },
    cfo ? { source: "Org chart", text: "Above that it goes to " + cfo.name + " (" + cfo.role + ")" + (waiting ? ", the signature " + q(waiting.name) + " is waiting on right now" : "") + "." } : null,
    idea ? { source: "Idea board", text: "The closest idea on the board, " + q(idea.title) + ", is sized at " + idea.effort + " for an upside of " + idea.upside + "." }
      : x.ideas.length ? { source: "Idea board", text: "None of the " + x.ideas.length + " ideas on the board is close enough to compare its size with." }
      : null,
  ];

  // ── Fit: which goal, and what else already pulls on it ──
  const sameGoal = goal ? x.cases.filter((c) => c.open && c.upside === goal.goal).sort((a, b) => b.raisedDay - a.raisedDay) : [];
  // Work on the same goal so far, what is still running first.
  const moving = goal ? x.initiatives.filter((i) => goal.keys.some((k) => says(i.name + " " + i.why, k))).sort((a, b) => Number(live(b)) - Number(live(a))) : [];
  const fit: (CompanyFact | null)[] = [
    { source: "Company goals", text: "Checked against the " + x.goals.length + " company goals: " + (goal ? "it serves " + q(goal.goal) + "." : "none names it directly, so it would be logged as a new signal.") },
    goal ? { source: "Case history", text: sameGoal.length ? count(sameGoal.length, "open case") + (sameGoal.length === 1 ? " already serves" : " already serve") + " that goal, the newest " + q(sameGoal[0].title) + " from " + sameGoal[0].from + "." : "No open case serves that goal yet; this would be the first." } : null,
    moving.length ? { source: "Initiatives", text: "Worked on for that goal so far: " + named(moving) + "." } : null,
  ];

  // ── Risk: how that desk decides, how promises held, who feels it first ──
  const routeDecided = route ? latest(x.cases.filter((c) => c.routeId === route.id)) : [];
  const yes = routeDecided.filter(({ d }) => d.answer === "yes").length;
  const lastNo = routeDecided.find(({ d }) => d.answer === "no");
  const short = x.outcomes.filter((o) => o.verdict === "Short");
  const heads = touched.map((d) => head(d.id)).filter((p): p is OrgPerson => !!p);
  const risk: (CompanyFact | null)[] = [
    route ? { source: "Decisions", text: routeDecided.length ? "On that desk, " + yes + " of the last " + routeDecided.length + " decisions were yes" + (lastNo ? "; the latest no was " + q(lastNo.c.title) : "") + "." : "Nothing on that desk has been decided yet, so there is no record to go by." } : null,
    x.outcomes.length ? { source: "Shipped outcomes", text: short.length ? short.length + " of the " + x.outcomes.length + " changes shipped so far delivered less than promised" + (short.length > 1 ? ", among them " : ": ") + q(short[0].title) + " promised " + short[0].promised + " and delivered " + short[0].actual + ". A measured first step guards against that." : "All " + x.outcomes.length + " changes shipped so far delivered what they promised or more." } : null,
    heads.length ? { source: "Org chart", text: "Who would feel it first: " + list(heads.map((p) => p.name + " (" + p.role + ")")) + "." } : null,
  ];

  const keep = (xs: (CompanyFact | null)[]) => xs.filter((f): f is CompanyFact => !!f);
  return { value: keep(value), feas: keep(feas), cost: keep(cost), fit: keep(fit), risk: keep(risk) };
}
