// What the desk's sheets show and send for the reasoned no (plan NOR, decisions D13, D14, D17, D19, D20): the No sheet's
// categories and what each needs, the Pass sheet's modes (pass, Not mine, Send up), the Ask sheet's "Discuss first" and the
// check-in's "No view yet". Pure: the reduced case, the rules and plain values in, plain facts and the event payload out.
// The sheets (components/shell) only draw it; the server checks the same rules (NOR-B1).
import type { Me, SeatRow } from "@/features/auth/identity";
import type { EventPayload } from "@/features/cases/events";
import type { ReducedCase } from "@/features/cases/reducer";
import { workdayOf, isWorkday } from "@/features/clock/calendar";
import type { ClockSpec } from "@/features/clock";
import type { Route, SeedRole } from "@/features/demo/types";
import type { LoopRules } from "@/features/loop/rules";
import { noViewYet } from "./discussion";
import type { Comment } from "./selectors";
import { passPayload, routeOfSeat } from "./hand";
import {
  CHANGE_IF_MAX, NO_CATEGORIES, NOT_NOW_MAX_IN_ROW, PASS_LIMIT, PASS_REASON_MIN, REASON_MAX, REVISIT_MAX_AHEAD, passDueDay, revisitAllowed, revisitRequired,
  type NoCategory,
} from "./no";

// ── the No sheet ──────────────────────────────────────────────────────────────────────────────────────────────

/** What a person typed and picked on the No sheet. `revisitDay` is a working-day number (the sheet converts the date), `duplicateOf` an id. */
export type NoInput = { category?: NoCategory | null; reason?: string; changeIf?: string; revisitDay?: number | null; duplicateOf?: string | null };

export type NoCategoryChoice = {
  id: NoCategory;
  /** Not now is hidden once the case was answered with it twice in a row (D17). */
  hidden: boolean;
  /** Which fields the category needs besides the reason: a date (required, optional or not allowed) and a case or project it duplicates. */
  date: "required" | "optional" | "none";
  needsRef: boolean;
};

export type NoSheet = {
  /** The six categories, in the order the sheet lists them; Not now stays in the list, flagged hidden. */
  categories: NoCategoryChoice[];
  /** The picked category's choice, null when none is picked. */
  picked: NoCategoryChoice | null;
  /** Why the sheet cannot be sent yet, in order; empty when it can. */
  problems: NoProblem[];
  ok: boolean;
  /** The `case.decided` payload of D17; only while ok. */
  payload: () => EventPayload | null;
};
export type NoProblem = "category" | "reason" | "reasonLong" | "changeIf" | "revisit" | "revisitUnneeded" | "ref";

/**
 * The No sheet of a case (D17): the categories with what they need, whether what was typed can be sent, and the payload.
 * `refs` are the ids of the cases and projects the desk can see, for Already solved or in work (never the case itself).
 */
export function noSheet(
  kase: Pick<ReducedCase, "id" | "notNowInRow">,
  rules: Pick<LoopRules, "noReasonMin">,
  today: number,
  input: NoInput = {},
  refs: readonly string[] = [],
): NoSheet {
  const categories: NoCategoryChoice[] = NO_CATEGORIES.map((id) => ({
    id,
    hidden: id === "not-now" && kase.notNowInRow >= NOT_NOW_MAX_IN_ROW,
    date: revisitRequired(id) ? "required" : revisitAllowed(id) ? "optional" : "none",
    needsRef: id === "duplicate",
  }));
  const picked = categories.find((c) => c.id === input.category && !c.hidden) ?? null;
  const reason = (input.reason ?? "").trim();
  const changeIf = (input.changeIf ?? "").trim();
  const day = input.revisitDay ?? null;
  const problems: NoProblem[] = [];
  if (!picked) problems.push("category");
  if (reason.length < rules.noReasonMin) problems.push("reason");
  if (reason.length > REASON_MAX) problems.push("reasonLong");
  if (changeIf.length > CHANGE_IF_MAX) problems.push("changeIf");
  if (picked) {
    const validDay = day !== null && Number.isInteger(day) && day > today && day <= today + REVISIT_MAX_AHEAD;
    if (picked.date === "required" && !validDay) problems.push("revisit");
    else if (picked.date === "optional" && day !== null && !validDay) problems.push("revisit");
    else if (picked.date === "none" && day !== null) problems.push("revisitUnneeded");
    if (picked.needsRef && !(input.duplicateOf && input.duplicateOf !== kase.id && refs.includes(input.duplicateOf))) problems.push("ref");
  }
  const ok = problems.length === 0;
  return {
    categories, picked, problems, ok,
    payload: () => !ok || !picked ? null : {
      answer: "no", category: picked.id, reason,
      ...(changeIf ? { changeIf } : {}),
      ...(picked.date !== "none" && day !== null ? { revisitDay: day } : {}),
      ...(picked.needsRef && input.duplicateOf ? { duplicateOf: input.duplicateOf } : {}),
    },
  };
}

/**
 * The working-day number of a date the sheet's date field sent (YYYY-MM-DD), or null when the day is none for it. A company
 * with a calendar counts working days and a holiday or weekend is no day (it is refused, never moved); the demo counts calendar
 * days from `today`.
 */
export function dayOfDate(iso: string, clock: ClockSpec, todayDate: Date, todayDay: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (at.toISOString().slice(0, 10) !== iso) return null;
  if (clock.mode === "workdays") return isWorkday(iso, clock.calendar) ? workdayOf(at, clock.calendar) : null;
  const start = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), 12);
  return todayDay + Math.round((at.getTime() - start) / 864e5);
}

// ── the Pass sheet ────────────────────────────────────────────────────────────────────────────────────────────

/** What a person picked on the Pass sheet: a seat, or Not mine (`back`), and why. */
export type PassInput = { seatId?: string | null; back?: boolean; why?: string };

export type PassSheet = {
  /** `up`: Send up, no seat list (after the limit, not for managers); `back`: Not mine is picked; else a plain pass. */
  mode: "pass" | "back" | "up";
  /** Not mine as the first option: the seat the case came from, offered once to the holder of the seat the last pass reached; null otherwise. */
  notMine: { seatId: string; from: string } | null;
  /** Send up: the seat above the desk (the first occupied seat of the role above), or null when nobody is (then ask a manager). */
  up: { seatId: string | null; label: string } | null;
  ok: boolean;
  /** The `case.handed` payload; only while ok. */
  payload: () => EventPayload | null;
};

/** The seat above a role: the first occupied seat of the role it reports to, then that one's boss (never a seat of `roleId` itself). */
export function seatAboveRole(seats: readonly SeatRow[], roles: readonly Pick<SeedRole, "id" | "reportsToId">[], roleId: string | null): SeatRow | null {
  if (roleId === null) return null;
  const seen = new Set<string>([roleId]);
  for (let up = roles.find((r) => r.id === roleId)?.reportsToId ?? null; up !== null && !seen.has(up); up = roles.find((r) => r.id === up)?.reportsToId ?? null) {
    seen.add(up);
    const seat = [...seats].sort((a, b) => a.sort - b.sort).find((s) => s.roleId === up && s.userId !== null);
    if (seat) return seat;
  }
  return null;
}

/**
 * The Pass sheet of a case (D13). Every pass needs a why of PASS_REASON_MIN characters. After PASS_LIMIT passes by people a
 * non-manager can only send up; a manager passes freely. Not mine goes back to the seat the case came from, once, and only for
 * a holder of the seat the last pass reached. The payload carries the route of the seat it goes to, the new desk's two-day floor
 * on the answer date and, on an asked case, the flag that keeps the question.
 */
export function passSheet(
  kase: Pick<ReducedCase, "passes" | "handed" | "status" | "dueDay" | "assigneeRoleId">,
  me: Pick<Me, "seatIds">,
  isManager: boolean,
  today: number,
  data: { seats: readonly SeatRow[]; routes: readonly Route[]; roles?: readonly Pick<SeedRole, "id" | "reportsToId">[] },
  input: PassInput = {},
): PassSheet {
  const last = kase.handed[kase.handed.length - 1];
  const notMine = last && !last.back && last.fromSeatId !== null && last.toSeatId !== null && me.seatIds.includes(last.toSeatId) && !me.seatIds.includes(last.fromSeatId)
    ? { seatId: last.fromSeatId, from: last.from } : null;
  const limit = !isManager && kase.passes >= PASS_LIMIT;
  const mode: PassSheet["mode"] = limit ? "up" : input.back && notMine ? "back" : "pass";
  const above = limit ? seatAboveRole(data.seats, data.roles ?? [], kase.assigneeRoleId) : null;
  const up = limit ? { seatId: above?.id ?? null, label: above?.label ?? "" } : null;
  const why = (input.why ?? "").trim();
  const target = mode === "back" ? notMine?.seatId ?? null : mode === "up" ? up?.seatId ?? null : input.seatId ?? null;
  const dueDay = passDueDay(kase, today);
  const ok = why.length >= PASS_REASON_MIN && (mode === "up" ? true : target !== null);
  return {
    mode, notMine, up, ok,
    payload: () => {
      if (!ok) return null;
      const extras = { ...(dueDay !== null ? { dueDay } : {}), ...(kase.status === "asked" ? { keepsQuestion: true } : {}) };
      if (mode === "up") {
        // The server sets the seat (it asks the knowledge for the seat above); a seat found here rides along for the demo, which has no server.
        return up?.seatId ? passPayload(data.seats, up.seatId, why, { up: true, ...extras }) : { why, up: true, ...extras };
      }
      if (mode === "back") return passPayload(data.seats, target ?? "", why, { back: true, ...extras });
      return passPayload(data.seats, target ?? "", why, { routeId: routeOfSeat([...data.routes], target ?? "")?.id, ...extras });
    },
  };
}

// ── the Ask sheet ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The Ask sheet (D20): from the second question on a case it offers "Discuss first instead", only with the discussion step on and
 * while the case is open (the Discuss sheet starts only on an open case).
 */
export function askSheet(kase: Pick<ReducedCase, "history" | "status">, flags: { discussion: boolean }): { discussFirst: boolean } {
  const asked = kase.history.filter((e) => e.type === "case.asked").length;
  return { discussFirst: flags.discussion && kase.status === "open" && asked >= 1 };
}

// ── the check-in ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The check-in sheet (D14, D19): the invitees (user ids) who gave no view yet, and whether "Another round" may still be added:
 * not after the discussion's last day.
 */
export function checkinSheet(kase: Pick<ReducedCase, "discussion">, comments: readonly Pick<Comment, "byUserId" | "day">[], today: number): { noViewYet: string[]; roundAllowed: boolean } {
  const d = kase.discussion;
  return { noViewYet: noViewYet(kase, comments), roundAllowed: !d || d.lastDay === 0 || today <= d.lastDay };
}
