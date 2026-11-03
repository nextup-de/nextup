// Where an idea can be raised: a desk is a role that owns a route (D13), its holders second.
// Suggestions and reasons are facts about the route and the role only - no score, no person. Pure.
import type { RouteProposal } from "@/features/cases/events";
import type { Route } from "@/features/demo/types";
import { seatsOfRole, type SeatRow } from "@/features/auth/identity";
import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n";
import { formatEuro } from "@/i18n/format";
import { amountEur } from "./benchmarks";

export type Desk = {
  roleId: string;
  routeId: string;
  title: string; // route.owner.role
  dept: string; // route.owner.dept
  type: string; // route.type
  holders: string[]; // labels of the role's seats that have a user
  vacant: boolean;
  proposedBy: "ai" | "keywords" | null;
  reasons: string[];
  recommended: boolean;
};

export type DeskInput = {
  text: string; // the idea: title, context and answers
  routes: readonly Route[];
  seats: readonly SeatRow[];
  proposal: RouteProposal | null;
  myDept: string; // the author's department, by name
  affected: readonly string[]; // departments the author named
  spendLimitEur: number | null; // the company's spend rule; null: none set
};

export const MAX_DESKS = 3;
const MAX_KEYWORD_DESKS = 2;

const list = (xs: string[], locale: Locale) =>
  xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + translate(locale, "ideas.listAnd") + " " + xs[xs.length - 1];

function holdersOf(seats: readonly SeatRow[], roleId: string): string[] {
  return seatsOfRole(seats, roleId).filter((s) => s.userId !== null).map((s) => s.label);
}

function deskOf(route: Route, roleId: string, seats: readonly SeatRow[], proposedBy: Desk["proposedBy"], reasons: string[]): Desk {
  const holders = holdersOf(seats, roleId);
  return {
    roleId, routeId: route.id, title: route.owner.role, dept: route.owner.dept, type: route.type,
    holders, vacant: holders.length === 0, proposedBy, reasons, recommended: false,
  };
}

function keysIn(text: string, route: Route): string[] {
  const t = text.toLowerCase();
  return route.keys.filter((k) => k.toLowerCase().length > 0 && t.includes(k.toLowerCase()));
}

export function desksFor(input: DeskInput, locale: Locale = DEFAULT_LOCALE): Desk[] {
  const t = (key: "ideas.deskOwns" | "ideas.deskMentions" | "ideas.deskArea" | "ideas.deskApproves", params: Record<string, string | number>) => translate(locale, key, params);
  const amount = amountEur(input.text);
  const reasonsFor = (route: Route, keys: string[]): string[] => {
    const reasons = [t("ideas.deskOwns", { type: route.type })];
    if (keys.length) reasons.push(t("ideas.deskMentions", { keys: list(keys.slice(0, 3).map((k) => translate(locale, "ideas.listQuote", { text: k })), locale) }));
    if (route.owner.dept === input.myDept || input.affected.includes(route.owner.dept)) reasons.push(t("ideas.deskArea", { dept: route.owner.dept }));
    if (amount !== null && input.spendLimitEur !== null && amount <= input.spendLimitEur) reasons.push(t("ideas.deskApproves", { limit: formatEuro(locale, input.spendLimitEur) }));
    return reasons;
  };

  const desks: Desk[] = [];
  const seen = new Set<string>();
  const add = (route: Route, proposedBy: Desk["proposedBy"]): boolean => {
    const roleId = route.ownerRoleId;
    if (!roleId || seen.has(roleId) || desks.length >= MAX_DESKS) return false;
    seen.add(roleId);
    desks.push(deskOf(route, roleId, input.seats, proposedBy, reasonsFor(route, keysIn(input.text, route))));
    return true;
  };

  const proposed = input.proposal?.routeId ? input.routes.find((r) => r.id === input.proposal?.routeId) : undefined;
  if (proposed && input.proposal) add(proposed, input.proposal.source === "llm" ? "ai" : "keywords");

  const matching = input.routes
    .map((route, i) => ({ route, i, n: keysIn(input.text, route).length }))
    .filter((m) => m.n > 0 && m.route.id !== proposed?.id)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  let added = 0;
  for (const m of matching) {
    if (added >= MAX_KEYWORD_DESKS) break;
    if (add(m.route, "keywords")) added += 1;
  }

  if (desks.length) desks[0] = { ...desks[0], recommended: true };
  return desks;
}

// Every route-owning role once, for "Choose another desk"; the query matches title or department.
export function otherDesks(routes: readonly Route[], seats: readonly SeatRow[], query: string, locale: Locale = DEFAULT_LOCALE): Desk[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: Desk[] = [];
  for (const route of routes) {
    const roleId = route.ownerRoleId;
    if (!roleId || seen.has(roleId)) continue;
    if (q && !route.owner.role.toLowerCase().includes(q) && !route.owner.dept.toLowerCase().includes(q)) continue;
    seen.add(roleId);
    out.push(deskOf(route, roleId, seats, null, [translate(locale, "ideas.deskOwns", { type: route.type })]));
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, locale));
}
