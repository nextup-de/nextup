// The brain (services/brain): a language model proposes the routing row and spots a repeat. This
// file is the pure half - what the app sends and how the answer becomes a RouteProposal. The call
// itself is src/server/brain.ts. The brain proposes; the keyword row stays the fallback, and
// people still decide (§11.2).
import type { RouteProposal } from "@/features/cases/events";
import type { Dept, Route } from "@/features/demo/types";

export type BrainItem = { id: string; title: string; status: string };
export type BrainRequest = {
  company: string;
  idea: { title: string; body: string };
  routes: { id: string; type: string; owner: string }[];
  known: BrainItem[];
};
export type BrainAnswer = {
  route_id: string | null; confidence: number; reason: string;
  same_as: string | null; related: string | null; model: string; version: string;
};
// What the page gets: the proposal to store, and the earlier item it repeats, if any.
export type BrainProposal = { proposal: RouteProposal; reason: string; sameAs: string | null; related: string | null };

export const BRAIN_MAX_KNOWN = 80; // the brain's own limit (services/brain/brain/schemas.py)

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Rows go out with the owner's role and department only - never a name.
export function brainRequest(
  company: string, idea: { title: string; body: string },
  routes: readonly Route[], depts: readonly Dept[], known: readonly BrainItem[],
): BrainRequest {
  const dept = (id: string) => depts.find((d) => d.id === id)?.name ?? id;
  return {
    company: clip(company, 120),
    idea: { title: clip(idea.title.trim(), 300), body: clip(idea.body.trim(), 5000) },
    routes: routes.slice(0, 50).map((r) => ({ id: r.id, type: clip(r.type, 200), owner: clip(r.owner.role + ", " + dept(r.owner.dept), 200) })),
    known: known.slice(0, BRAIN_MAX_KNOWN).map((k) => ({ id: k.id, title: clip(k.title, 300), status: clip(k.status, 40) })),
  };
}

// Checks the answer against what was sent: a row or an item the request did not contain is
// dropped, not trusted. Null = nothing usable, the keyword proposal stands.
export function fromBrain(a: BrainAnswer, req: BrainRequest): BrainProposal | null {
  const rows = new Set(req.routes.map((r) => r.id));
  const items = new Set(req.known.map((k) => k.id));
  if (a.route_id !== null && !rows.has(a.route_id)) return null;
  const confidence = a.route_id === null ? 0 : Math.max(0, Math.min(96, Math.round(a.confidence)));
  return {
    proposal: { routeId: a.route_id, confidence, source: "llm", version: a.version },
    reason: a.reason,
    sameAs: a.same_as && items.has(a.same_as) ? a.same_as : null,
    related: a.related && items.has(a.related) ? a.related : null,
  };
}
