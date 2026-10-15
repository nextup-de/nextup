// The discussion stage and the archive as the pages read them (docs/plans/2026-10-15_idea-to-project.md
// sections 1-2): whether a case may skip the discussion, whom to ask, where the rounds stand, what the
// next check-in should say, and which list a case belongs in. Facts in, plain values out - the reducer
// owns the state, the pages build the sentences. Pure: no React, no storage.
import type { Action, IdeaBrief } from "@/features/ideas/brief";
import { splitBody } from "@/features/ideas/brief";
import { amountEur, benchmark, type BenchmarkContext } from "@/features/ideas/benchmarks";
import { dialsOf, dialsUp, type Dial } from "@/features/ideas/raise";
import type { OrgPerson } from "@/features/demo/types";
import type { LoopRules } from "@/features/loop/rules";
import type { ReducedCase, Version } from "./reducer";
import type { Comment } from "./selectors";

// ── Fast lane ─────────────────────────────────────────────────────────────────────────────────

const FREE = /^(none|no spend|no cost|nothing|free|zero|€?\s*0\b)/i;

/** What the case's brief says it costs, in euros: its "*Cost*" fact, if it has one. Null when it does not say. */
export function costEurOf(body: string): number | null {
  const fact = splitBody(body).facts.find((f) => /^(cost|spend|budget)$/i.test(f.label));
  if (!fact) return null;
  if (FREE.test(fact.text.trim())) return 0;
  return amountEur(fact.text);
}

/** Small enough to say yes at once: the stated cost is within the team's spend authority. */
export const fastLane = (body: string, limitEur: number): boolean => {
  const eur = costEurOf(body);
  return eur !== null && eur <= limitEur;
};

// ── The decision card ─────────────────────────────────────────────────────────────────────────

export type DiscussionMode = { fast: boolean; costEur: number | null; limitEur: number };

const euro = (n: number) => "€" + n.toLocaleString("en");
const action = (key: string, label: string): Action => ({ key, label, live: true });

/**
 * The case's decision card with the discussion stage in it (only call it when the flag is on).
 * An open case gets "Discuss first" next to its four answers; outside the fast lane it is the
 * advice, unless the case belongs on someone else's desk. A case in a discussion offers the
 * check-in until the last one said "ready", then the decision; "Ask" is gone, the discussion asks.
 */
export function withDiscussion(brief: IdeaBrief, c: Pick<ReducedCase, "status" | "discussion" | "from">, m: DiscussionMode): IdeaBrief {
  if (!brief.actions.length) return brief;
  if (c.status === "open") {
    const actions = [...brief.actions];
    actions.splice(1, 0, action("discuss", "Discuss first"));
    if (m.fast || brief.rec === "hand") return { ...brief, actions };
    const cost = m.costEur === null ? "It does not say what it costs" : "It costs about " + euro(m.costEur) + ", above the team's " + euro(m.limitEur);
    return {
      ...brief, actions, rec: "discuss",
      recText: cost + ", so ask the people it touches before you decide. Yes, no and pass stay open the whole time.",
      next: "Start a discussion: say what is missing and invite people.",
    };
  }
  if (c.status !== "discussion" || !c.discussion) return brief;
  const keep = brief.actions.filter((a) => a.key !== "ask");
  if (c.discussion.ready) {
    return { ...brief, actions: keep, rec: "", recText: "The last check-in said it is ready. Decide now: yes, or no and why.", next: "Decide.", by: null };
  }
  return {
    ...brief,
    actions: [action("checkin", "Check in"), ...keep, action("invite", "Invite more")],
    rec: "checkin",
    recText: "A check-in ends the round: ready to decide, or another round with what is still open. Everyone in the discussion sees it.",
    next: "Check in with " + c.from + " and the people you invited.",
  };
}

// ── Whom to invite ────────────────────────────────────────────────────────────────────────────

export type InviteWhy = "buddy" | "deputy" | "affected" | "head" | "close";
export type InviteSuggestion = { name: string; why: InviteWhy; note: string };

export type InviteInput = {
  people: readonly OrgPerson[];
  /** Names the raiser added as Affected, and everyone who said it affects them too. */
  affected: readonly string[];
  /** Other cases that read like this one, with who raised them. */
  close: readonly { from: string; title: string }[];
  /** The desk holder: never suggested, they are in already. */
  me: string;
};

const WHY_LINE: Record<InviteWhy, string> = {
  buddy: "Buddy on the route",
  deputy: "Deputy on the route",
  affected: "Says it affects them",
  head: "Heads the department",
  close: "Raised something close",
};

/**
 * The people the "Discuss first" sheet offers, each once, in this order: the route's buddy and
 * deputy, the people who said it affects them, the head of the raiser's department, and the people
 * who raised close ideas. Only people in the directory; never the desk holder or the raiser
 * (the raiser is always in).
 */
export function inviteSuggestions(c: Pick<ReducedCase, "route" | "from" | "fromDept">, x: InviteInput): InviteSuggestion[] {
  const out: InviteSuggestion[] = [];
  const known = (n: string) => x.people.some((p) => p.name === n);
  const add = (name: string | undefined | null, why: InviteWhy, note = WHY_LINE[why]) => {
    const n = name?.trim();
    if (!n || n === x.me || n === c.from || !known(n) || out.some((s) => s.name === n)) return;
    out.push({ name: n, why, note });
  };
  if (c.route) {
    add(c.route.buddy.split(" · ")[0], "buddy"); // "C. Ilg · Ops & Admin"
    add(c.route.deputy, "deputy");
  }
  x.affected.forEach((n) => add(n, "affected"));
  const head = headOf(c, x.people);
  if (head) add(head.name, "head", head.role);
  x.close.forEach((k) => add(k.from, "close", "Raised “" + k.title + "”"));
  return out;
}

/**
 * The head of the department a case came from: the raiser's own department when they are on the
 * directory, otherwise the department named in `fromDept` ("Production, Line 3"). The head is the
 * one in it who reports to nobody in it.
 */
export function headOf(c: Pick<ReducedCase, "from" | "fromDept">, people: readonly OrgPerson[]): OrgPerson | null {
  const raiser = people.find((p) => p.name === c.from);
  const word = c.fromDept.split(",")[0].trim().toLowerCase();
  const dept = raiser?.dept ?? people.find((p) => p.dept.toLowerCase() === word || p.role.toLowerCase().includes(word))?.dept;
  if (!dept) return null;
  const inDept = people.filter((p) => p.dept === dept);
  return inDept.find((p) => !inDept.some((q) => q.name === p.reportsTo)) ?? null;
}

// ── Where the rounds stand ────────────────────────────────────────────────────────────────────

export type RoundState = {
  round: number; of: number;
  /** The day the next check-in is due (or, once ready, the decision). */
  dueDay: number;
  late: boolean;
  /** Days left until it is due; negative when late. */
  left: number;
  /** This round is the last one the rules allow: going on needs a manager. */
  last: boolean;
  ready: boolean;
};

export function roundState(c: Pick<ReducedCase, "discussion" | "dueDay" | "overdue">, rules: Pick<LoopRules, "discussMaxRounds">, day: number): RoundState | null {
  const d = c.discussion;
  if (!d) return null;
  return {
    round: Math.max(1, d.round), of: rules.discussMaxRounds, dueDay: c.dueDay, late: c.overdue, left: c.dueDay - day,
    last: d.rounds.length + 1 >= rules.discussMaxRounds, ready: d.ready,
  };
}

/** Invited to a discussion that is still running (and so asked for their view). */
export const invitedTo = (c: Pick<ReducedCase, "status" | "discussion">, name: string): boolean =>
  c.status === "discussion" && !!c.discussion && c.discussion.invited.includes(name);

// ── The check-in draft ────────────────────────────────────────────────────────────────────────

export type CheckinDraft = { open: string[]; note: string };

/** The dials still weak: below `bar` (70 is "Strong" / low cost / low risk, raise.ts levelOf). */
export const weakDials = (dials: readonly Dial[], bar = 70): string[] => dials.filter((d) => !d.scored || d.value < bar).map((d) => d.label);

export type VersionScore = Version & { score: number; dials: Dial[]; up: string[] };

/**
 * What the brain would draft, offline: the new versions and the new comments since the last
 * check-in (or since the discussion started), then the points still open from the latest dials.
 * The desk holder edits it before it is sent.
 */
export function checkinDraft(c: Pick<ReducedCase, "discussion">, versions: readonly VersionScore[], comments: readonly Comment[], dials: readonly Dial[]): CheckinDraft {
  const d = c.discussion;
  const since = d ? (d.rounds.length ? d.rounds[d.rounds.length - 1].day : d.startedDay) : 0;
  const open = weakDials(dials);
  const lines: string[] = [];
  versions.filter((v) => v.version > 1 && v.day >= since).forEach((v) => {
    const before = versions.find((x) => x.version === v.version - 1);
    lines.push("v" + v.version + " from " + v.by + (before ? ": score " + before.score + " → " + v.score : "") + (v.up.length ? " (better: " + v.up.join(", ") + ")" : "") + ".");
  });
  comments.filter((m) => m.day >= since).forEach((m) => lines.push(m.by + ": “" + m.text + "”"));
  const head = lines.length ? (d && d.rounds.length ? "Since the last check-in:" : "Since the discussion started:") : "Nothing new since " + (d && d.rounds.length ? "the last check-in." : "the discussion started.");
  const tail = open.length ? "Still open: " + open.join(", ") + "." : "Every point is covered.";
  return { open, note: [head, ...lines.map((l) => "- " + l), tail].join("\n") };
}

/** A version as the benchmark reads it: its title, then its text. */
export const versionText = (v: Pick<Version, "title" | "body">) => (v.title.trim() + "\n\n" + v.body.trim()).trim();

/**
 * Scores a version the way the raise page scores a draft (features/ideas/benchmarks), against
 * every other case - never against itself, or it would read as "already raised".
 */
export function versionReader(ctx: BenchmarkContext, caseId: string, idea: { affected: readonly string[]; attachments: number }) {
  const others: BenchmarkContext = { ...ctx, cases: ctx.cases.filter((k) => k.id !== caseId) };
  return (v: Pick<Version, "title" | "body">) => {
    const b = benchmark({ text: versionText(v), affected: idea.affected, attachments: idea.attachments }, others);
    return { overall: b.overall, dials: dialsOf(b.parts) };
  };
}

/** Each version with its score and dials, and the dials that got better on the one before (the ▲). */
export function scoreVersions(versions: readonly Version[], read: (v: Version) => { overall: number; dials: Dial[] }): VersionScore[] {
  const out: VersionScore[] = [];
  versions.forEach((v) => {
    const r = read(v);
    const before = out[out.length - 1];
    const up = before ? dialsUp(before.dials, r.dials).map((k) => r.dials.find((x) => x.key === k)?.label ?? k) : [];
    out.push({ ...v, score: v.overall ?? r.overall, dials: r.dials, up });
  });
  return out;
}

// ── Open lists and the archive ────────────────────────────────────────────────────────────────

/** Still moving: open, in a discussion, or waiting on an answer. The open lists show these by default. */
export const isLive = (c: Pick<ReducedCase, "open" | "status">) => c.open || c.status === "asked";

export type ArchiveOutcome = "project" | "declined";
export const ARCHIVE_LABEL: Record<ArchiveOutcome, string> = { project: "Became a project", declined: "Declined" };

/**
 * Where an idea went once it left the open lists: a no is declined, every yes became work - a project,
 * or for old seed history a build. Null while it is still live.
 */
export function archiveOf(c: Pick<ReducedCase, "decided" | "open" | "status">): ArchiveOutcome | null {
  if (isLive(c)) return null;
  return c.decided?.answer === "no" ? "declined" : "project";
}

export type ListView = "open" | "archive";
export type ArchiveFilter = "all" | ArchiveOutcome;
/** The open lists show live cases; the archive the rest, by outcome. */
export const inView = (outcome: ArchiveOutcome | null, view: ListView, filter: ArchiveFilter = "all") =>
  view === "open" ? outcome === null : outcome !== null && (filter === "all" || filter === outcome);
