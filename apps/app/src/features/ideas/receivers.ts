// Who should get an idea when it is published (the raise page's "Who should get this?"): 2-3
// people, each with a match score and the facts behind it. The score is built from those facts only -
// the routing row they own (or their place in the org), whether the idea lands in their area, whether
// they can approve its spend, and how they answered the last cases on their desk - so every point
// shows up as a "why". The author picks one or anyone else; the case is raised with that person as
// its assignee. Pure.
import type { Dept, OrgPerson, Route } from "@/features/demo/types";
import { amountEur } from "./benchmarks";

export type Receiver = {
  name: string;
  role: string;
  yourLead: boolean;
  score: number; // 0-98: the facts below, added up
  reasons: string[];
  routeId: string | null;
  kind: "route" | "lead" | "escalate" | "other";
  yours: boolean; // the author suggested them in the actions menu
  recommended: boolean;
};

export type DeskCase = { assignee: string; raisedDay: number; decided: { day: number } | null };

export type ReceiverInput = {
  text: string; // the idea: title, context and answers
  routes: readonly Route[];
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  cases: readonly DeskCase[]; // what is on everyone's desk, for the track record
  promiseDays: number; // the answer every case is owed within
  spendLimitEur: number; // team-level authority (features/ideas/drafts SPEND_LIMIT_EUR)
  lead: string; // the author's team lead - where anything raised lands first
  me: string;
  myDept: string; // the author's department, by name ("Production")
  affected: readonly string[]; // people and departments the author named
  brain: { routeId: string | null; confidence: number; reason: string } | null; // the router's proposal, where the stack runs it
  yours: string | null; // a receiver the author suggested in the actions menu
};

export const MAX_RECEIVERS = 3;
export const TRACK_CASES = 5; // the last cases on a desk the track record looks at
const CAP = 98;
const BASE = { lead: 60, escalate: 45, other: 40 } as const;
const quote = (xs: string[]) => xs.map((k) => "“" + k + "”");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const euros = (n: number) => "€" + (n >= 1000 && n % 1000 === 0 ? n / 1000 + "k" : n.toLocaleString("en"));

// The router's keyword formula (features/routing: 55% + 14 per keyword, capped at 96), for every row that matches.
function matches(text: string, routes: readonly Route[]) {
  const t = text.toLowerCase();
  return routes
    .map((r) => ({ r, keys: r.keys.filter((k) => t.includes(k.toLowerCase())) }))
    .filter((m) => m.keys.length > 0)
    .map((m) => ({ ...m, score: Math.min(96, 55 + m.keys.length * 14) }))
    .sort((a, b) => b.score - a.score);
}

type Start = { base: number; why: string; also?: string; routeId: string | null; kind: Receiver["kind"] };

// The facts that add to a person's score, beyond where they start.
function scored(name: string, start: Start, input: ReceiverInput): Omit<Receiver, "recommended"> {
  const person = input.people.find((p) => p.name === name);
  const dept = person ? input.depts.find((d) => d.id === person.dept)?.name ?? "" : "";
  const reasons = [start.why, ...(start.also ? [start.also] : [])];
  let score = start.base;

  // The idea lands in their area: the author's own department, or one they named as affected.
  const area = dept && (dept === input.myDept || input.affected.includes(dept));
  if (input.affected.includes(name)) { score += 8; reasons.push("Named as affected by this idea"); }
  else if (area) { score += 8; reasons.push(dept + " is their area, so this lands with them"); }

  // They can say yes to what it costs without escalating: team leads, within the team's limit.
  const amount = amountEur(input.text);
  if (start.kind === "lead" && amount !== null && amount <= input.spendLimitEur) {
    score += 6; reasons.push("Can approve up to " + euros(input.spendLimitEur) + " without escalating");
  }

  // How they answered the last cases on their desk.
  const desk = input.cases.filter((c) => c.assignee === name).sort((a, b) => b.raisedDay - a.raisedDay).slice(0, TRACK_CASES);
  if (desk.length) {
    const onTime = desk.filter((c) => c.decided && c.decided.day - c.raisedDay <= input.promiseDays).length;
    // Only a record that speaks for them is a reason; none answered in time adds nothing either.
    if (onTime) {
      score += Math.round((onTime / desk.length) * 6);
      reasons.push(desk.length === 1 ? "Answered their last case within " + input.promiseDays + " days"
        : "Answered " + onTime + " of the last " + desk.length + " cases on their desk within " + input.promiseDays + " days");
    }
  }

  return {
    name, role: person?.role ?? (start.kind === "lead" ? "Team lead" : ""), yourLead: name === input.lead,
    score: Math.min(CAP, Math.round(score)), reasons, routeId: start.routeId, kind: start.kind, yours: name === input.yours,
  };
}

export function receiversFor(input: ReceiverInput): Receiver[] {
  // Where each candidate starts: the router's proposal, the route owners the idea's words match, the lead.
  const starts = new Map<string, Start>();
  const offer = (name: string, s: Start) => { if (name === input.me) return; const had = starts.get(name); if (!had || s.base > had.base) starts.set(name, s); };
  const brainRoute = input.brain?.routeId ? input.routes.find((r) => r.id === input.brain?.routeId) : undefined;
  if (brainRoute && input.brain) offer(brainRoute.owner.name, { base: Math.round(input.brain.confidence), routeId: brainRoute.id, kind: "route", why: input.brain.reason || "Owns “" + brainRoute.type + "”, where the router places this idea" });
  for (const m of matches(input.text, input.routes).slice(0, 2)) {
    offer(m.r.owner.name, { base: m.score, routeId: m.r.id, kind: "route", why: "Owns “" + m.r.type + "” - your idea mentions " + list(quote(m.keys.slice(0, 3))) });
  }
  offer(input.lead, { base: BASE.lead, routeId: null, kind: "lead", why: "Your team lead - anything you raise reaches them first" });
  // A route owner who is also the lead keeps the route's start, and says so.
  const leadStart = starts.get(input.lead);
  if (leadStart && leadStart.kind === "route") starts.set(input.lead, { ...leadStart, kind: "lead", also: "Your team lead - anything you raise reaches them first" });
  if (input.yours && !starts.has(input.yours)) offer(input.yours, { base: BASE.other, routeId: null, kind: "other", why: "Your own suggestion" });
  // Fewer than two: the lead's own manager, for ideas that reach beyond the team.
  const above = input.people.find((p) => p.name === input.lead)?.reportsTo;
  if (starts.size < 2 && above) offer(above, { base: BASE.escalate, routeId: null, kind: "escalate", why: "Your lead's manager - for an idea that reaches beyond your own team" });

  const all = [...starts].map(([name, s]) => scored(name, s, input)).sort((a, b) => b.score - a.score);
  // Three at most - but the author's own suggestion always stays in.
  const shown = all.slice(0, MAX_RECEIVERS);
  const mine = all.find((r) => r.yours);
  if (mine && !shown.includes(mine)) shown[shown.length - 1] = mine;
  const best = shown.reduce((b, r) => (r.score > b.score ? r : b), shown[0]);
  return shown.map((r) => ({ ...r, recommended: r === best }));
}

// Someone else from the directory, chosen by hand - scored on the same facts.
export function receiverFor(name: string, input: ReceiverInput): Receiver {
  const owned = input.routes.find((r) => r.owner.name === name);
  const start: Start = name === input.lead
    ? { base: BASE.lead, routeId: null, kind: "lead", why: "Your team lead - anything you raise reaches them first" }
    : { base: BASE.other, routeId: null, kind: "other", why: owned ? "Owns “" + owned.type + "”" : "Chosen by you" };
  return { ...scored(name, start, input), recommended: false };
}
