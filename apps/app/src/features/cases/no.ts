// The reasoned no (plan NOR, decisions D12, D13, D17, D18): its categories, what an old no maps to, the limits of a pass
// and of the second look, and who may answer a second look. Pure: the reduced case and plain values in, plain facts out.
// The helpers read only fields of ReducedCase; the reducer fills them (NOR-A1) and the server checks with them (NOR-B1).
import type { Me, SeatRow } from "@/features/auth/identity";
import type { MessageKey } from "@/i18n";
import type { ReducedCase } from "./reducer";

/** Why a person says no, as new noes pick it (D17). */
export const NO_CATEGORIES = ["not-now", "no-budget", "no-fit", "duplicate", "risk", "not-feasible"] as const;
export type NoCategory = (typeof NO_CATEGORIES)[number];

/** What an old no (the picked id in `reason`, the text in `note`) is shown as: today's four labels, and the rest. */
export const LEGACY_NO_CATEGORIES = ["wrong-department", "not-responsible", "no-time", "no-rank", "other"] as const;
export type LegacyNoCategory = (typeof LEGACY_NO_CATEGORIES)[number];
export type AnyNoCategory = NoCategory | LegacyNoCategory;

/** The ids the old No sheet stored in `reason` (components/shell/InputSheet.tsx), and the category each maps to. */
const OLD_IDS: Record<string, AnyNoCategory> = {
  "not now": "not-now", "wrong department": "wrong-department", "not responsible": "not-responsible",
  "no time": "no-time", "is it important": "no-rank",
};

const isNew = (c: unknown): c is NoCategory => (NO_CATEGORIES as readonly unknown[]).includes(c);
const isLegacy = (c: unknown): c is LegacyNoCategory => (LEGACY_NO_CATEGORIES as readonly unknown[]).includes(c);
const oldId = (reason: string): AnyNoCategory | null => OLD_IDS[reason.trim().toLowerCase()] ?? null;

/** At most two not-now in a row on one case (D17). */
export const NOT_NOW_MAX_IN_ROW = 2;
/** After this many passes by people a non-manager may only send up (D13). */
export const PASS_LIMIT = 2;
/** A pass needs a why of at least this many characters, trimmed (D13). */
export const PASS_REASON_MIN = 8;
/** The new desk gets at least this many working days (Q4.10). */
export const PASS_MIN_DAYS = 2;
/** What would make it a yes: up to this many characters (D17). */
export const CHANGE_IF_MAX = 400;
/** The reason's text: up to this many characters (D17). */
export const REASON_MAX = 2000;
/** A revisit day is at most this many working days ahead (D17). */
export const REVISIT_MAX_AHEAD = 250;
/** The raiser's text for a second look (D18). */
export const APPEAL_TEXT_MIN = 20;
export const APPEAL_TEXT_MAX = 1000;

/**
 * The category of a decision: the new no's own; an old no's by its picked id (an old id, or the free text the Teams card
 * wrote, is `other`); a yes has none (D17). A reduced decision already carrying a category returns it.
 */
export function noCategoryOf(d: { answer: "yes" | "no"; reason: string; category?: string | null }): AnyNoCategory | null {
  if (d.answer !== "no") return null;
  if (isNew(d.category) || isLegacy(d.category)) return d.category;
  return oldId(d.reason) ?? "other";
}

/**
 * The text of a no. New (a category of NO_CATEGORIES): `reason`. Old with a known id: `note`. Old with free text in
 * `reason`, as the Teams card wrote it: `reason` and `note` joined.
 */
export function noReasonOf(d: { reason: string; note: string; category?: string | null }): string {
  if (isNew(d.category)) return d.reason;
  if (oldId(d.reason) !== null) return d.note;
  return [d.reason, d.note].filter((x) => x.trim() !== "").join(" - ");
}

const LABELS: Record<AnyNoCategory, MessageKey> = {
  "not-now": "caseNo.catNotNow", "no-budget": "caseNo.catNoBudget", "no-fit": "caseNo.catNoFit", duplicate: "caseNo.catDuplicate",
  risk: "caseNo.catRisk", "not-feasible": "caseNo.catNotFeasible",
  // The old noes keep today's labels (shell.ts, the old No sheet).
  "wrong-department": "shell.noWrongDept", "not-responsible": "shell.noNobody", "no-time": "shell.noNoTime", "no-rank": "shell.noNoRank",
  other: "caseNo.catOther",
};
const SUBS: Record<NoCategory, MessageKey> = {
  "not-now": "caseNo.catNotNowSub", "no-budget": "caseNo.catNoBudgetSub", "no-fit": "caseNo.catNoFitSub", duplicate: "caseNo.catDuplicateSub",
  risk: "caseNo.catRiskSub", "not-feasible": "caseNo.catNotFeasibleSub",
};

/** The message key of a category's label. */
export const noCategoryLabel = (c: AnyNoCategory): MessageKey => LABELS[c];
/** The message key of a new category's one-line sub. */
export const noCategorySub = (c: NoCategory): MessageKey => SUBS[c];

/** A revisit day may be given: not-now and no-budget (D17). */
export const revisitAllowed = (c: AnyNoCategory | null): boolean => c === "not-now" || c === "no-budget";
/** A revisit day must be given: not-now. */
export const revisitRequired = (c: AnyNoCategory | null): boolean => c === "not-now";

/**
 * The answer date a pass carries (Q4.10): null when the case's answer date is at least PASS_MIN_DAYS working days away,
 * else today + PASS_MIN_DAYS, so the new desk gets at least that long.
 */
export function passDueDay(kase: Pick<ReducedCase, "dueDay">, today: number): number | null {
  return kase.dueDay - today >= PASS_MIN_DAYS ? null : today + PASS_MIN_DAYS;
}

/** The second look may still be asked for: the latest decision is a no, nobody asked yet (once per case), and the window is open (D18). */
export function appealOpen(kase: Pick<ReducedCase, "decided" | "appeal">, today: number, appealDays: number): boolean {
  const d = kase.decided;
  return d !== null && d.answer === "no" && kase.appeal === null && today <= d.day + appealDays;
}

/**
 * Where the latest decision stands in the case's event order. Two events of one day have a total order only by their place
 * in the history: the key names a decision by that place, never by its day (so a no, a second look that reopens the case and
 * a new no on one day are three distinct things).
 */
export const decisionKey = (kase: Pick<ReducedCase, "id" | "decidedSeq">): string | null =>
  kase.decidedSeq === null ? null : `${kase.id}:${kase.decidedSeq}`;

/** The latest decision was written after the latest reopen: it is this cycle's. */
export const decidedThisCycle = (kase: Pick<ReducedCase, "decidedSeq" | "reopenSeq">): boolean =>
  kase.decidedSeq !== null && (kase.reopenSeq === null || kase.decidedSeq > kase.reopenSeq);

/** The events of the current cycle: everything after the latest reopen (all of them before the first). */
export const cycleEvents = (kase: Pick<ReducedCase, "history" | "reopenSeq">) =>
  kase.reopenSeq === null ? kase.history : kase.history.slice(kase.reopenSeq + 1);

/** Where a pending second look stands: no second look, answered, routed to a desk someone else holds, or with nobody who may answer it. */
export type AppealRouting = { state: "none" | "decided" | "routed" | "unroutable"; roleIds: string[] };

/**
 * The roles whose holders may answer the pending second look (D18): the role of the appeal's seat and of the seat the latest
 * `appeal` fact with check 2 names, minus every role the person who said no holds. A role nobody but the no-sayer holds
 * does not count: if no eligible occupied seat is left the second look is `unroutable`, and a manager assigns it. Empty
 * when there is no pending second look.
 */
export function appealRouting(kase: Pick<ReducedCase, "appeal" | "decided" | "history">, seats: readonly SeatRow[]): AppealRouting {
  const a = kase.appeal;
  if (a === null) return { state: "none", roleIds: [] };
  if (a.decided !== null) return { state: "decided", roleIds: [] };
  const noSayer = kase.decided?.answer === "no" ? kase.decided.byUserId ?? null : null;
  const noSayerRoles = new Set(seats.filter((s) => noSayer !== null && s.userId === noSayer).map((s) => s.roleId));
  const roleOf = (seatId: string | null) => (seatId === null ? null : seats.find((s) => s.id === seatId)?.roleId ?? null);
  const second = [...kase.history].reverse().find((e) => e.type === "clock.due" && e.payload.kind === "appeal" && e.payload.check === 2);
  const roleIds = [...new Set([roleOf(a.seatId), roleOf(second?.payload.toRoleHolderId ?? null)].filter((r): r is string => r !== null && !noSayerRoles.has(r)))];
  // Someone other than the no-sayer must sit in one of them, or nobody can answer.
  const occupied = roleIds.filter((r) => seats.some((s) => s.roleId === r && s.userId !== null && s.userId !== noSayer));
  return occupied.length > 0 ? { state: "routed", roleIds } : { state: "unroutable", roleIds: [] };
}

/** The role ids that may answer the pending second look; [] when there is none or it is unroutable. */
export const appealDeskRoles = (kase: Pick<ReducedCase, "appeal" | "decided" | "history">, seats: readonly SeatRow[]): string[] =>
  appealRouting(kase, seats).roleIds;

/**
 * May this person answer the pending second look: a holder of one of its desk roles, or a manager - never the person who
 * said no, by user id, whatever role they hold now (D18).
 */
export function mayAnswerAppeal(kase: Pick<ReducedCase, "appeal" | "decided" | "history">, me: Me, isManager: boolean, seats: readonly SeatRow[]): boolean {
  const a = kase.appeal;
  if (a === null || a.decided !== null || me.userId === null) return false;
  if (kase.decided?.answer === "no" && kase.decided.byUserId === me.userId) return false;
  return isManager || appealDeskRoles(kase, seats).some((r) => me.roleIds.includes(r));
}
