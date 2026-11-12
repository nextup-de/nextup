// The Feed (docs/ROUTES.md /feed): every problem and idea this viewer may see, as cards to browse and
// back. Pure: the stage pill, the cover's number and line, the supporters line, the filters and the
// two sort orders. The page builds the cards from these; nothing here is invented - the cover's
// number comes from what the raiser wrote, how many back it, or how long it has been open.
import type { Me, SeatRow } from "@/features/auth/identity";
import type { Dept } from "@/features/demo/types";
import { MIN_GROUP } from "@/features/metrics/types";
import type { EventLog } from "./events";
import { actorLabel, type ActorLabels } from "./actor-label";
import type { ReducedCase } from "./reducer";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";

export type FeedTone = "new" | "review" | "piloting" | "approved";
export type FeedStage = { label: string; tone: FeedTone };

// The pill on the card and in the opened idea: where the case is, in the design's four tones.
export function feedStage(c: Pick<ReducedCase, "shipped" | "building" | "decided" | "status" | "read">, locale: Locale = DEFAULT_LOCALE): FeedStage {
  const stage = (key: MessageKey, tone: FeedTone): FeedStage => ({ label: translate(locale, key), tone });
  if (c.shipped) return stage("team.feedStageShipped", "approved");
  if (c.building) return stage("team.feedStagePiloting", "piloting");
  if (c.decided) return c.decided.answer === "yes" ? stage("team.feedStageApproved", "approved") : stage("team.feedStageNotNow", "new");
  if (c.status === "asked") return stage("team.feedStageNeedsInfo", "review");
  if (c.status === "discussion") return stage("team.feedStageDiscussion", "review");
  if (c.read !== null) return stage("team.feedStageReview", "review");
  return stage("team.feedStageNew", "new");
}

// The cover's big number (at most 7 characters, units abbreviated) and the short lowercase line
// that completes it (2-4 words, at most 24 characters) - docs/AI_COVERS.md. Until the text model
// writes them: the first amount in what the raiser said it is worth, else how many back it, else
// how long it has been open.
export type FeedCover = { stat: string; hook: string };
const AMOUNT = /(?:[€$£]\s?\d[\d.,]*\s?(?:k|m|bn)?|\d[\d.,]*\s?(?:k|m|bn)?\s?(?:€|eur|%|minutes?|min|hours?|h|days?|weeks?|pcs)?)(?![\w])/i;
const UNITS: [RegExp, string][] = [[/\s?minutes?$/i, " min"], [/\s?hours?$/i, " h"], [/\s?days?$/i, " d"], [/\s?weeks?$/i, " wk"]];
export const STAT_MAX = 7, HOOK_MAX = 24;
// The number as short as it goes: "20 minutes" -> "20 min", "5 weeks" -> "5 wk" only when too long.
export function shortStat(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length <= STAT_MAX) return s;
  return UNITS.reduce((x, [re, to]) => x.replace(re, to), s);
}
// At most four words and 24 characters, cut at a word - and never ending on a loose "per" or "of".
const LOOSE = new Set(["a", "an", "the", "of", "per", "for", "to", "on", "in", "at", "by", "with", "and", "or", "from", "under", "over", "into", "than"]);
export function shortHook(text: string): string {
  const out: string[] = [];
  for (const w of text.split(" ").filter(Boolean)) {
    if (out.length === 4 || [...out, w].join(" ").length > HOOK_MAX) break;
    out.push(w);
  }
  while (out.length > 1 && LOOSE.has(out[out.length - 1])) out.pop();
  return out.join(" ");
}
export function feedCover(c: Pick<ReducedCase, "upside" | "age" | "open">, supporters: number): FeedCover {
  const m = c.upside ? AMOUNT.exec(c.upside) : null;
  const stat = m && /\d/.test(m[0]) ? shortStat(m[0]) : "";
  if (m && stat.length <= STAT_MAX) {
    // The words after the number complete it ("25 min | idle every morning"); only without them the words before.
    const tidy = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/\s+/g, " ").toLowerCase();
    const hook = shortHook(tidy(c.upside.slice(m.index + m[0].length)) || tidy(c.upside.slice(0, m.index)));
    return { stat, hook: hook || "says the raiser" };
  }
  if (supporters >= 2) return { stat: String(supporters), hook: "say it affects them" };
  return { stat: c.age + " d", hook: c.open ? "waiting for an answer" : "until it was answered" };
}

// "You, Martin and 40 others" / "Martin, Tom and 40 others" - the names first, the rest as a count.
// "You" is whoever has your user id; the names are labels, only shown.
export type Backer = { userId: string | null; name: string };
export const isMe = (b: Backer, me: Me): boolean => me.userId !== null && b.userId === me.userId;
export function supportLine(backers: readonly Backer[], me: Me): string {
  const mine = backers.some((b) => isMe(b, me));
  const shown = [...(mine ? ["You"] : []), ...backers.filter((b) => !isMe(b, me)).map((b) => b.name)];
  if (!shown.length) return "Nobody backs this yet";
  if (shown.length === 1) return mine ? "You back this" : shown[0] + " backs this";
  if (shown.length === 2) return shown[0] + " and " + shown[1];
  const rest = shown.length - 2;
  return shown[0] + ", " + shown[1] + " and " + rest + (rest === 1 ? " other" : " others");
}

// A card matches a department chip when it was raised there or names that department as affected.
export const inDept = (tags: readonly string[], dept: string) => dept === "All" || tags.includes(dept);

// The unit tree the filters read: sites are the first level, units the children of the chosen site.
// A unit with no parent (or one the seed does not know) is first level; Dept carries no parent yet, so
// a flat seed has sites only.
export type UnitNode = Dept & { parentId?: string | null };
export type UnitFilter = { id: string; name: string };
const nodes = (seed: { depts: readonly UnitNode[] }) => seed.depts;
const parentOf = (seed: { depts: readonly UnitNode[] }, u: UnitNode): string | null =>
  u.parentId && u.parentId !== u.id && nodes(seed).some((x) => x.id === u.parentId) ? u.parentId : null;
export const siteFilters = (seed: { depts: readonly UnitNode[] }): UnitFilter[] =>
  nodes(seed).filter((u) => parentOf(seed, u) === null).map((u) => ({ id: u.id, name: u.name }));
export const unitFilters = (seed: { depts: readonly UnitNode[] }, siteId: string): UnitFilter[] =>
  nodes(seed).filter((u) => parentOf(seed, u) === siteId).map((u) => ({ id: u.id, name: u.name }));
// Is the card's unit (its id) inside the chosen site, or the chosen unit?
export const inSite = (seed: { depts: readonly UnitNode[] }, unitId: string | null, siteId: string): boolean => {
  const u = unitId === null ? undefined : nodes(seed).find((x) => x.id === unitId);
  return !!u && (u.id === siteId || parentOf(seed, u) === siteId);
};
export const inUnit = (unitId: string | null, filterId: string): boolean => unitId !== null && unitId === filterId;

// The department chips: each name once (a department at three sites is one chip), sites left out (the
// site menu has them), the busiest few as chips and the rest behind "More". The chosen one is always
// a chip: picked from "More", it takes the last place. Busiest first; a tie keeps the seed's order.
export const DEPT_CHIPS = 3;
export function deptChips(seed: { depts: readonly UnitNode[] }, countOf: (name: string) => number, chosen: string, max = DEPT_CHIPS): { chips: string[]; more: string[] } {
  const sites = new Set(siteFilters(seed).filter((s) => nodes(seed).some((u) => parentOf(seed, u) === s.id)).map((s) => s.name));
  const names = [...new Set(nodes(seed).map((u) => u.name))].filter((n) => !sites.has(n));
  const ranked = names.map((name, i) => ({ name, n: countOf(name), i })).sort((a, b) => b.n - a.n || a.i - b.i);
  const chips = ranked.filter((x) => x.n > 0).slice(0, max).map((x) => x.name);
  if (chosen !== "All" && names.includes(chosen) && !chips.includes(chosen)) chips.splice(Math.min(chips.length, max - 1), 1, chosen);
  return { chips, more: ranked.map((x) => x.name).filter((n) => !chips.includes(n)) };
}

// The supporters line on a card: a unit is named only with at least MIN_GROUP supporters from it (a
// disclosure control, D6); otherwise the count. "You" alone, or nobody, have their own lines.
export type SupportSummary = { kind: "none" } | { kind: "you" } | { kind: "count"; count: number } | { kind: "unit"; count: number; unit: string };
export function supportSummary(backers: readonly (Backer & { unit?: string | null })[], me: Me): SupportSummary {
  if (!backers.length) return { kind: "none" };
  if (backers.length === 1 && isMe(backers[0], me)) return { kind: "you" };
  const per = new Map<string, number>();
  for (const b of backers) if (b.unit) per.set(b.unit, (per.get(b.unit) ?? 0) + 1);
  const top = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top && top[1] >= MIN_GROUP ? { kind: "unit", count: top[1], unit: top[0] } : { kind: "count", count: backers.length };
}

// The case's newest visible event, for the line on the card (D16). `role` is the actor's role id when
// they held the case's desk at that moment (by seat and role id), else null and `label` is the event's
// own label (a raiser's handle stays a handle). For handed and escalated, `role` is where it went.
export type Activity = {
  kind: "raised" | "read" | "asked" | "yes" | "no" | "handed" | "discussion" | "escalated";
  role: string | null; label: string | null; day: number;
};
export function latestActivity(caseId: string, log: EventLog, seats: readonly SeatRow[], labels?: ActorLabels): Activity | null {
  const roleOfSeat = (id: string | null | undefined) => (id ? seats.find((s) => s.id === id)?.roleId ?? null : null);
  let desk: string | null = null, escalated: string | null = null;
  let last: Activity | null = null;
  for (const e of log.events) {
    if (e.target !== caseId) continue;
    const uid = e.actorUserId ?? null;
    const held = uid === null ? null : seats.find((s) => s.userId === uid && (s.roleId === desk || s.roleId === escalated))?.roleId ?? null;
    const by = { role: held, label: held === null ? actorLabel(e, labels) : null, day: e.day };
    switch (e.type) {
      case "case.raised":
        desk = roleOfSeat(e.payload.assigneeRoleHolderId);
        last = { kind: "raised", role: null, label: actorLabel(e, labels), day: e.day };
        break;
      case "case.read": last = { kind: "read", ...by }; break;
      case "case.asked": last = { kind: "asked", ...by }; break;
      case "case.discussion": last = { kind: "discussion", ...by }; break;
      case "case.decided": last = { kind: e.payload.answer === "no" ? "no" : "yes", ...by }; break;
      case "case.handed": {
        const toRole = roleOfSeat(e.payload.toRoleHolderId);
        last = { kind: "handed", role: toRole, label: toRole === null ? e.payload.to ?? actorLabel(e, labels) : null, day: e.day };
        if (toRole !== null) desk = toRole;
        escalated = null;
        break;
      }
      case "clock.due": {
        if (e.payload.kind !== "deadline") break;
        const toRole = roleOfSeat(e.payload.toRoleHolderId);
        if (toRole === null) break;
        escalated = toRole;
        last = { kind: "escalated", role: toRole, label: null, day: e.day };
        break;
      }
      default: break;
    }
  }
  return last;
}
export type FeedSort = "relevant" | "support" | "latest";
export const FEED_SORTS: readonly FeedSort[] = ["relevant", "support", "latest"];
export const FEED_SORT_KEY = { relevant: "feed.sortRelevant", support: "team.feedSortSupport", latest: "feed.sortLatest" } as const satisfies Record<FeedSort, MessageKey>;
type FeedOrderRow = { backers: number; raisedDay: number; comments: number; lastDay: number; own?: boolean };

/** Days until an idea's pull halves when nothing happens on it. */
export const RELEVANCE_HALF_LIFE = 14;
/**
 * How much an idea matters to this reader today: its backers and half its comments (plus one, so a quiet idea
 * still counts), halved for every two weeks without activity, and half again as much from the reader's own unit.
 */
export const feedRelevance = (x: FeedOrderRow, today: number): number =>
  (1 + x.backers + x.comments / 2) * 0.5 ** (Math.max(0, today - x.lastDay) / RELEVANCE_HALF_LIFE) * (x.own ? 1.5 : 1);

// Most relevant: feedRelevance, ties as Most supported. Most supported: backers, then comments, then the
// one waiting longest. Latest activity: the newest event first (lastDay), then the most backed.
export function sortFeed<T extends FeedOrderRow>(list: readonly T[], sort: FeedSort, today = Math.max(0, ...list.map((x) => x.lastDay))): T[] {
  const bySupport = (a: T, b: T) => b.backers - a.backers || b.comments - a.comments || a.raisedDay - b.raisedDay;
  return list.slice().sort((a, b) => (sort === "latest"
    ? b.lastDay - a.lastDay || b.backers - a.backers
    : sort === "relevant" ? feedRelevance(b, today) - feedRelevance(a, today) || bySupport(a, b) : bySupport(a, b)));
}
