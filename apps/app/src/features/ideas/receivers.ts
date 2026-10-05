// Who should receive an idea when it is published (the raise page's "Who should receive it?"): 2-3
// suggestions, each with the reason and - where routing can tell - a match score. The author picks one
// or names someone else; the case is raised with that person as its assignee. Pure.
import type { OrgPerson, Route } from "@/features/demo/types";

export type Receiver = {
  name: string;
  role: string;
  score: number | null; // match %, where a routing row backs it
  why: string;
  routeId: string | null;
  kind: "yours" | "route" | "lead" | "escalate" | "other";
  recommended: boolean;
};

export type ReceiverInput = {
  text: string; // the idea: title, context and answers
  routes: readonly Route[];
  people: readonly OrgPerson[];
  lead: string; // the author's team lead - where anything raised lands first
  me: string;
  brain: { routeId: string | null; confidence: number; reason: string } | null; // the router's proposal, where the stack runs it
  yours: string | null; // a receiver the author suggested in the actions menu
};

export const MAX_RECEIVERS = 3;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

// The router's keyword formula (features/routing: 55% + 14 per keyword, capped at 96), for every row that matches.
function matches(text: string, routes: readonly Route[]) {
  const t = text.toLowerCase();
  return routes
    .map((r) => ({ r, keys: r.keys.filter((k) => t.includes(k.toLowerCase())) }))
    .filter((m) => m.keys.length > 0)
    .map((m) => ({ ...m, score: Math.min(96, 55 + m.keys.length * 14) }))
    .sort((a, b) => b.score - a.score);
}

export function receiversFor(input: ReceiverInput): Receiver[] {
  const roleOf = (name: string) => input.people.find((p) => p.name === name)?.role ?? "";
  const out: Receiver[] = [];
  const add = (r: Omit<Receiver, "recommended">) => {
    if (r.name === input.me) return;
    const had = out.find((x) => x.name === r.name);
    if (!had) { out.push({ ...r, recommended: false }); return; }
    // The same person twice (the route owner is also the team lead): one card, the stronger reason first.
    if (had.score === null && r.score !== null) { had.score = r.score; had.routeId = r.routeId; had.kind = r.kind; had.why = r.why + " " + had.why; }
    else if (r.kind === "lead") had.why += " They are also your team lead.";
  };

  // What the router would choose: the brain's proposal first, then every row whose keywords the idea uses.
  const routes: { route: Route; score: number; why: string }[] = [];
  const brainRoute = input.brain?.routeId ? input.routes.find((r) => r.id === input.brain?.routeId) : undefined;
  if (brainRoute && input.brain) routes.push({ route: brainRoute, score: Math.round(input.brain.confidence), why: input.brain.reason || "Owns “" + brainRoute.type + "”, where the router places this idea." });
  for (const m of matches(input.text, input.routes)) {
    if (routes.some((x) => x.route.id === m.r.id)) continue;
    routes.push({ route: m.r, score: m.score, why: "Owns “" + m.r.type + "”. Your idea mentions " + list(m.keys.slice(0, 3).map((k) => "“" + k + "”")) + "." });
  }

  if (input.yours) {
    const backed = routes.find((x) => x.route.owner.name === input.yours);
    add({ name: input.yours, role: roleOf(input.yours) || backed?.route.owner.role || "", score: backed?.score ?? null, routeId: backed?.route.id ?? null, kind: "yours", why: "Your own suggestion." + (backed ? " " + backed.why : "") });
  }
  routes.slice(0, 2).forEach((x) => add({ name: x.route.owner.name, role: x.route.owner.role, score: x.score, routeId: x.route.id, kind: "route", why: x.why }));
  add({ name: input.lead, role: roleOf(input.lead) || "Team lead", score: null, routeId: null, kind: "lead", why: "Your team lead. Anything you raise lands on their desk first, and they pass it on when it is not theirs." });
  // Fewer than two: the lead's own manager, for ideas that reach beyond the team.
  const above = input.people.find((p) => p.name === input.lead)?.reportsTo;
  if (out.length < 2 && above) add({ name: above, role: roleOf(above), score: null, routeId: null, kind: "escalate", why: "Your lead's manager - for an idea that reaches beyond your own team." });

  const shown = out.slice(0, MAX_RECEIVERS);
  // Recommended: the best routing match, else the team lead - never just because the author named them.
  const best = shown.filter((r) => r.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? shown.find((r) => r.kind === "lead") ?? shown[0];
  return shown.map((r) => ({ ...r, recommended: r === best }));
}

// Someone else from the directory, chosen by hand.
export function otherReceiver(person: OrgPerson, deptName: string): Receiver {
  return { name: person.name, role: person.role + (deptName ? " · " + deptName : ""), score: null, routeId: null, kind: "other", why: "Chosen by you.", recommended: false };
}
