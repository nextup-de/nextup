// Lists derived from the demo context that more than one component needs (rail counts, the
// decisions dropdown, the inbox and My cases views). Pure over the context value.
import { cosignRow, mineRow, type MineRow } from "@/features/cases/rows";
import { onDesk } from "@/features/cases/selectors";
import type { DemoContext } from "./DemoProvider";

// Live cases on someone's desk (open) - the number the rail shows as "Inbox" and the dev panel
// shows next to each leader; the desk including those paused on a question.
export const openCasesOf = (ctx: DemoContext, name: string) => ctx.D.cases.filter((c) => onDesk(c, name) && c.open);
export const openCases = (ctx: DemoContext) => openCasesOf(ctx, ctx.persona.who.name);
export const deskCases = (ctx: DemoContext) => ctx.D.cases.filter((c) => onDesk(c, ctx.persona.who.name) && (c.open || c.status === "asked"));

// Inbox order: live cases first (oldest clock on top), then the ones paused on a question.
export const inboxSorted = (ctx: DemoContext) =>
  deskCases(ctx).slice().sort((a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || b.clock - a.clock || b.age - a.age);

// A manager's inbox also holds the ideas waiting on their decision (the Overview's "Waiting on
// you"): oldest wait on top. Leaders and members decide no ideas, so they get none.
export const inboxIdeas = (ctx: DemoContext) => (ctx.role === "manager" ? decisionsWaiting(ctx.D) : []);
// What the Inbox badge counts: live cases on the desk plus the decisions owed.
export const inboxCount = (ctx: DemoContext) => openCases(ctx).length + inboxIdeas(ctx).length;

// My cases: what I raised plus the ideas I co-signed, newest first. "I" is whoever the events were
// posted as - the same rule as DemoProvider's `actor` and server/actions/events.ts: a member with an
// anonymous handle posts under it, everyone else (and people added in /admin or Settings, who have
// no handle) under their name.
export function mineRows(ctx: DemoContext): MineRow[] {
  const { name, handle } = ctx.persona.who;
  const me = ctx.persona.role.id === "member" && handle ? handle : name;
  const { promiseDays, outcomeDays } = ctx.seed;
  return ctx.D.cases.filter((c) => c.from === me).map((c) => mineRow(c, ctx.S.day, ctx.f, promiseDays, outcomeDays))
    .concat(ctx.D.ideas.filter((i) => i.cosigners.some((x) => x.name === me)).map((i) => cosignRow(i, ctx.S.day, ctx.f, me, promiseDays)))
    .sort((a, b) => b.sortDay - a.sortDay);
}

// Who sees which case in the lists. An employee: only what they raised. A team leader: what they
// raised and what the people who report to them raised (by name or by their anonymous handle) -
// not the rest of the company; what merely sits on their desk is the inbox's job. A manager: everything.
export function visibleTo(ctx: DemoContext, c: ReducedCase): boolean {
  const { name, handle } = ctx.persona.who;
  const own = c.from === name || (handle !== null && c.from === handle);
  if (ctx.role === "member") return own;
  if (ctx.role !== "leader") return true;
  const reports = ctx.seed.people.filter((p) => p.reportsTo === name).map((p) => p.name);
  const handles = ctx.seed.personas.filter((r) => reports.includes(r.who.name) && r.who.handle).map((r) => r.who.handle as string);
  return own || reports.includes(c.from) || handles.includes(c.from);
}

// Who may open a case by its link: what they see in the lists, plus what sits on their desk (a
// lead opens their inbox cases here too). An employee cannot open a colleague's case by URL.
export const canOpen = (ctx: DemoContext, c: ReducedCase) => visibleTo(ctx, c) || onDesk(c, ctx.persona.who.name);

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
export function criteriaTags(c: ReducedIdea["criteria"]): { label: string; strong: boolean; none?: boolean }[] {
  const t: { label: string; strong: boolean; none?: boolean }[] = [];
  if (c.fit) t.push({ label: "Strategic fit", strong: false });
  if (c.urgent) t.push({ label: "Urgent", strong: false });
  if (c.kpi) t.push({ label: "Moves: " + c.kpi, strong: true });
  if (!t.length) t.push({ label: "No criterion met", strong: false, none: true });
  return t;
}
