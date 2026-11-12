// Lists derived from the demo context that more than one component needs (rail counts, the
// decisions dropdown, the inbox and My cases views). Pure over the context value.
import { invitedTo, scoreVersions, versionReader, type VersionScore } from "@/features/cases/discussion";
import type { Me } from "@/features/auth/identity";
import { cosignRow, mineRow, raisedWith, type MineRow } from "@/features/cases/rows";
import { affectedOn, onDeskOf, rescoresOn } from "@/features/cases/selectors";
import { ideaContext } from "@/features/ideas/drafts";
import { projectOfCase } from "@/features/projects/selectors";
import { scoreCase } from "@/features/scoring";
import { canOpen as canOpenCase, unitsOf } from "@/features/cases/visibility";
import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n";
import type { DemoContext } from "./DemoProvider";
import { withoutLinkedCases } from "./inbox-order";
import { inboxCounts, inboxItems, type InboxSourceInput } from "@/features/inbox";

// Live cases on someone's desk (open) - the number the rail shows as "Inbox" and the dev panel
// shows next to each leader; the desk including those paused on a question.
export const openCasesOf = (ctx: DemoContext, me: Me) => ctx.D.cases.filter((c) => onDeskOf(c, me) && c.open);
export const openCases = (ctx: DemoContext) => openCasesOf(ctx, ctx.me);
export const deskCases = (ctx: DemoContext) => ctx.D.cases.filter((c) => onDeskOf(c, ctx.me) && (c.open || c.status === "asked"));

// Inbox order: live cases first (oldest clock on top), then the ones paused on a question.
export const inboxSorted = (ctx: DemoContext) =>
  deskCases(ctx).slice().sort((a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || b.clock - a.clock || b.age - a.age);

// A manager's inbox also holds the ideas waiting on their decision (the Overview's "Waiting on
// you"): oldest wait on top. Leaders and members decide no ideas, so they get none.
export const inboxIdeas = (ctx: DemoContext) => (ctx.role === "manager" ? decisionsWaiting(ctx.D) : []);
// The ids of those ideas: a case that became one of them is not listed or counted a second time.
export const inboxIdeaIds = (ctx: DemoContext): ReadonlySet<string> => new Set(inboxIdeas(ctx).map((i) => i.id));
// What the one inbox lists for the person looking: the input of `inboxItems`, built the way components/inbox/InboxPage builds it.
export const inboxInputOf = (ctx: DemoContext): InboxSourceInput => ({
  state: ctx.S, me: ctx.me, seats: ctx.seed.seats ?? [], today: ctx.S.day, demo: ctx.demo, role: ctx.role,
  flags: { projects: ctx.flag("projects"), discussion: ctx.flag("discussion") },
});
// What the Inbox badge counts: every item in the one inbox (features/inbox inboxCounts total, never a sum of the overlapping counts).
export const inboxTotal = (ctx: DemoContext): number => inboxCounts(inboxItems(inboxInputOf(ctx))).total;
/** @deprecated Use `inboxTotal`. Kept so nothing that still imports it breaks; it is the same number now. */
export const inboxCount = inboxTotal;

// My cases: what I raised plus the ideas I co-signed, newest first. "I" is my user id (ctx.me): the
// cases whose raiser it is, the ideas it co-signed. The names on the rows are labels, only shown.
export function mineRows(ctx: DemoContext): MineRow[] {
  const { me } = ctx;
  const { promiseDays, outcomeDays } = ctx.seed;
  // With the loop on, each row follows the case past the decision: the discussion, the project it became.
  const loop = ctx.flag("discussion") || ctx.flag("projects");
  return ctx.D.cases.filter((c) => me.userId !== null && c.fromUserId === me.userId)
    .map((c) => mineRow(c, ctx.S.day, ctx.f, promiseDays, outcomeDays, loop ? { rules: ctx.S.rules, project: projectOfCase(ctx.S, c) ?? null } : undefined, ctx.locale))
    .concat(ctx.D.ideas.filter((i) => me.userId !== null && i.cosigners.some((x) => x.userId === me.userId)).map((i) => cosignRow(i, ctx.S.day, ctx.f, me, promiseDays, ctx.locale)))
    .sort((a, b) => b.sortDay - a.sortDay);
}

// Who sees which case in the lists, and who may open one by its link: one rule, by ids
// (features/cases/visibility). The lists show exactly the cases a viewer may open.
const visCtx = (ctx: DemoContext) => ({ seats: ctx.seed.seats, roles: ctx.seed.roles ?? [], projects: ctx.S.projects, members: ctx.seed.members, approvals: ctx.S.approvals });
export const canOpen = (ctx: DemoContext, c: ReducedCase) =>
  canOpenCase(c, { me: ctx.me, role: ctx.role, unitIds: unitsOf(ctx.me, visCtx(ctx)) }, visCtx(ctx));
export const visibleTo = (ctx: DemoContext, c: ReducedCase): boolean => canOpen(ctx, c);

// Everyone who stands behind a case: named when it was raised, plus everyone who said it affects them too.
export function standingOn(ctx: DemoContext, c: ReducedCase): string[] {
  const raised = raisedWith(c).affected;
  return [...raised, ...affectedOn(ctx.log, c.id).map((a) => a.name).filter((n) => !raised.includes(n))];
}

// The case score as the case page shows it: the case's facts, who stands behind it, the evidence and the news since.
export const caseScore = (ctx: DemoContext, c: ReducedCase): number =>
  scoreCase({ ...c, affected: standingOn(ctx, c).length, evidence: raisedWith(c).attachments, updates: rescoresOn(ctx.log, c.id).length }, ctx.seed.promiseDays).value;

// Every version of a case, scored by the idea benchmarks (v1 as raised, then each revision), with the ▲.
export function versionsOf(ctx: DemoContext, c: ReducedCase): VersionScore[] {
  const read = versionReader(ideaContext(ctx.seed.routes, ctx.seed.goals, ctx.S.cases, ctx.seed.spend), c.id, { affected: standingOn(ctx, c), attachments: raisedWith(c).attachments });
  return scoreVersions(c.versions, read);
}

// Discussions this person was asked into ("Asked for your view"), not on their own desk and not their own.
export const askedForView = (ctx: DemoContext) => {
  const { me } = ctx;
  return ctx.D.cases.filter((c) => invitedTo(c, me) && !onDeskOf(c, me) && c.fromUserId !== me.userId);
};

// ── problems / ideas in the current department scope, with the list views' sort orders ──
import type { ReducedCase, ReducedIdea, ReducedProblem } from "@/features/cases/reducer";
import { criteriaCount, decisionsWaiting, upsideNum } from "@/features/metrics";

export const problemOf = (ctx: DemoContext, i: ReducedIdea) => ctx.S.problems.find((p) => p.id === i.problem);
export const scopedProblems = (ctx: DemoContext) => ctx.D.problems.filter((p) => ctx.matches(p.depts));
export const scopedIdeas = (ctx: DemoContext) => ctx.D.ideas.filter((i) => ctx.matches(problemOf(ctx, i)?.depts ?? []));

export type ProblemSort = "people" | "trend" | "age" | "title";
export function sortProblems(list: ReducedProblem[], sort: ProblemSort): ReducedProblem[] {
  return list.slice().sort((a, b) => {
    if (sort === "people") return b.people - a.people;
    if (sort === "trend") return b.spark[6] - b.spark[0] - (a.spark[6] - a.spark[0]);
    if (sort === "title") return a.title.localeCompare(b.title);
    return (b.months || 0) - (a.months || 0);
  });
}

export type IdeaSort = "score" | "wait" | "upside" | "title";
const byCriteria = (a: ReducedIdea, b: ReducedIdea) => criteriaCount(b.criteria) - criteriaCount(a.criteria) || (b.wait || 0) - (a.wait || 0);
export function sortIdeas(list: ReducedIdea[], sort: IdeaSort): ReducedIdea[] {
  return list.slice().sort((a, b) => {
    if (sort === "wait") return (b.wait || 0) - (a.wait || 0) || byCriteria(a, b);
    if (sort === "upside") return upsideNum(b.upside) - upsideNum(a.upside) || byCriteria(a, b);
    if (sort === "title") return a.title.localeCompare(b.title);
    return byCriteria(a, b);
  });
}

// The three case criteria as tags - the KPI tag is the routing criterion and gets the ink.
export function criteriaTags(c: ReducedIdea["criteria"], locale: Locale = DEFAULT_LOCALE): { label: string; strong: boolean; none?: boolean }[] {
  const t: { label: string; strong: boolean; none?: boolean }[] = [];
  if (c.fit) t.push({ label: translate(locale, "dashboard.criteriaFit"), strong: false });
  if (c.urgent) t.push({ label: translate(locale, "dashboard.criteriaUrgent"), strong: false });
  if (c.kpi) t.push({ label: translate(locale, "dashboard.criteriaMoves", { kpi: c.kpi }), strong: true });
  if (!t.length) t.push({ label: translate(locale, "dashboard.criteriaNone"), strong: false, none: true });
  return t;
}
