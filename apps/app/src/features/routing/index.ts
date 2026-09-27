// Routing table matcher: free text -> the route (owner, deputy, buddy) with the most keyword hits.
// It *proposes* the row - it never decides (§11.2). Overrides are logged against the map.
export type RouteRow = { id: string; keys: string[] };

export function proposeRoute<R extends RouteRow>(text: string, routes: readonly R[]): R | null {
  const words = text.toLowerCase();
  let best: R | null = null;
  let bestHits = 0;
  for (const r of routes) {
    const hits = r.keys.filter((k) => words.includes(k.toLowerCase())).length;
    if (hits > bestHits) {
      best = r;
      bestHits = hits;
    }
  }
  return best;
}

export type Proposal<R> = { route: R | null; confidence: number };

// Stamped on every proposal that is stored (case.raised payload.proposal). Bump it whenever the
// matching or the confidence formula changes, so /admin/decisions can compare versions.
export const ROUTER_VERSION = "keywords-v1";

// The intake box: nothing until 8 characters, then the best row with a confidence figure
// (55% + 14 per keyword hit, capped at 96). `route: null` = no row in the map matches yet.
export function propose<R extends RouteRow>(text: string, routes: readonly R[]): Proposal<R> | null {
  const t = (text || "").toLowerCase();
  if (t.trim().length < 8) return null;
  const route = proposeRoute(t, routes);
  if (!route) return { route: null, confidence: 0 };
  const hits = route.keys.filter((k) => t.includes(k.toLowerCase())).length;
  return { route, confidence: Math.min(96, 55 + hits * 14) };
}
