// The decision log in /admin: what the router proposed for each raised case, what people then did
// with it, and what n8n did. Pure - no database, no next/* - so every verdict is unit-tested.
//
// Why it exists: "AI proposes, never decides" (docs/INTEGRATIONS.md) only improves anything if
// someone can see where the proposal was wrong. The label comes from people, never from the model:
//   agreed            answered on the proposed route, nobody overruled it or sent it elsewhere
//   overridden        someone moved it to another route (case.override) - the proposal was wrong
//   handed elsewhere  handed to someone who is neither the first desk nor the route's owner or
//                     deputy - the proposal (or the map row) was wrong. Today this is how a lead
//                     corrects a routing: nothing in the UI emits case.override yet.
//   no route          the router found no row; a human triaged it - the map has a gap
//   open              not answered yet, not overruled - no label yet
// A hand-off from the first desk to the route's owner is the normal path and changes nothing.
import type { CaseEventType, EventPayload } from "@/features/cases/events";

export type Verdict = "agreed" | "overridden" | "handed elsewhere" | "no route" | "open";

/** One raise, with the later events on the same case that say whether the proposal held. */
export type DecisionInput = {
  eventId: string;
  company: string; // slug
  caseId: string | null;
  raisedAt: string;
  payload: EventPayload;
  /** case.override, case.handed and case.decided on this case, oldest first. */
  later: { type: CaseEventType; payload: EventPayload }[];
  /** When n8n wrote its notice back, or null. */
  noticeAt: string | null;
  /** Who may hold the case on the proposed route: the first desk, the owner, the deputy. */
  desks: string[];
};

export type DecisionRow = {
  eventId: string;
  company: string;
  caseId: string | null;
  raisedAt: string;
  title: string;
  /** Title and body: what the router read. */
  text: string;
  proposed: string | null;
  confidence: number | null;
  /** "unrecorded" = raised before proposals were stored; `proposed` is then the route it was saved with. */
  source: "keywords" | "llm" | "unrecorded";
  version: string | null;
  /** The route the case ended up on. */
  chosen: string | null;
  verdict: Verdict;
  handoffs: number;
  answer: "yes" | "no" | null;
  noticeAt: string | null;
};

export function toDecision(d: DecisionInput): DecisionRow {
  const p = d.payload;
  const proposal = p.proposal;
  const proposed = proposal ? proposal.routeId : p.routeId ?? null;
  const overrides = d.later.filter((e) => e.type === "case.override");
  const chosen = overrides.length ? overrides[overrides.length - 1].payload.chosen ?? null : proposed;
  const decided = d.later.filter((e) => e.type === "case.decided").pop();
  const answer = decided?.payload.answer ?? null;

  const handed = d.later.filter((e) => e.type === "case.handed");
  const elsewhere = handed.filter((e) => e.payload.to && !d.desks.includes(e.payload.to));

  const verdict: Verdict =
    overrides.some((o) => o.payload.chosen !== proposed) ? "overridden"
      : proposed === null ? "no route"
        : elsewhere.length ? "handed elsewhere"
          : answer ? "agreed"
            : "open";

  return {
    eventId: d.eventId,
    company: d.company,
    caseId: d.caseId,
    raisedAt: d.raisedAt,
    title: p.title ?? "",
    text: [p.title, p.body].filter(Boolean).join(" \n"),
    proposed,
    confidence: proposal ? proposal.confidence : null,
    source: proposal ? proposal.source : "unrecorded",
    version: proposal ? proposal.version : null,
    chosen,
    verdict,
    handoffs: handed.length,
    answer,
    noticeAt: d.noticeAt,
  };
}

export type VersionStats = { version: string; raised: number; agreed: number; overridden: number; handedElsewhere: number; noRoute: number };

export type DecisionSummary = {
  raised: number;
  agreed: number;
  overridden: number;
  handedElsewhere: number;
  noRoute: number;
  open: number;
  /** agreed / (agreed + overridden + handed elsewhere): how often a settled proposal held. Null until one settles. */
  agreement: number | null;
  /** Mean confidence of the recorded proposals, or null when none were recorded. */
  meanConfidence: number | null;
  /** Raises that n8n wrote a notice back for. */
  notified: number;
  byVersion: VersionStats[];
};

export function summarise(rows: readonly DecisionRow[]): DecisionSummary {
  const count = (v: Verdict, rs: readonly DecisionRow[] = rows) => rs.filter((r) => r.verdict === v).length;
  const agreed = count("agreed");
  const overridden = count("overridden");
  const handedElsewhere = count("handed elsewhere");
  const confidences = rows.flatMap((r) => (r.confidence === null ? [] : [r.confidence]));

  const versions = [...new Set(rows.map((r) => r.version ?? "unrecorded"))];
  const byVersion = versions.map((version) => {
    const rs = rows.filter((r) => (r.version ?? "unrecorded") === version);
    return { version, raised: rs.length, agreed: count("agreed", rs), overridden: count("overridden", rs), handedElsewhere: count("handed elsewhere", rs), noRoute: count("no route", rs) };
  });

  return {
    raised: rows.length,
    agreed,
    overridden,
    handedElsewhere,
    noRoute: count("no route"),
    open: count("open"),
    agreement: agreed + overridden + handedElsewhere ? agreed / (agreed + overridden + handedElsewhere) : null,
    meanConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
    notified: rows.filter((r) => r.noticeAt).length,
    byVersion,
  };
}

/**
 * The eval set, one JSON object per line: the text the router read and the route people settled
 * on. Only agreed and overridden rows: an open case has no label yet, and "handed elsewhere" says
 * the proposal was wrong without saying which route was right. Feed it
 * to tests/eval/routing/<company>.jsonl to score a new matcher or prompt before it ships.
 */
export function toEvalJsonl(rows: readonly DecisionRow[]): string {
  return rows
    .filter((r) => r.verdict === "agreed" || r.verdict === "overridden")
    .map((r) => JSON.stringify({ company: r.company, text: r.text, expected: r.chosen, proposed: r.proposed, confidence: r.confidence, version: r.version, verdict: r.verdict }))
    .join("\n");
}
