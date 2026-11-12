"use server";
// Absence and the seat above's share of a loaded desk (plan OVL, D13, D15, D19, D28, D31). Every action loads the viewer, the company's seed, the log and the
// reduced state the way appendEventAction does, resolves its target on the server (a user by id among the company's active members, a span by its awayId in the
// company's own state), checks the rights of features/overload/rights.ts against what it resolved, and appends with appendEventRow. The six OVL events do not come
// through appendEventAction (server/actions/append/overload.ts), so these actions, the clock and the directory are their only writers.
import { revalidatePath } from "next/cache";
import { meFor, type Actor } from "@/features/auth/identity";
import { getViewerFor, type Viewer } from "@/features/auth/session";
import type { EventPayload } from "@/features/cases/events";
import { handPayload } from "@/features/cases/hand";
import { mayAppend } from "@/features/cases/permissions";
import { reduce, type State } from "@/features/cases/reducer";
import type { SeatAbove } from "@/features/clock/due";
import { seedFor } from "@/features/demo";
import type { Seed } from "@/features/demo/types";
import { DEFAULT_POST_AS, eventLabel } from "@/features/ideas/posting";
import { seatAbove } from "@/features/knowledge";
import { seatPresent } from "@/features/overload/away";
import { awayTargets, checkSpan, currentOrNextSpan, maySetAway, mayShareLoad, mayTakeBack, type Verdict } from "@/features/overload/rights";
import { overloadOf } from "@/features/overload/reduce";
import { createT, type Locale, type MessageKey, type T } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appendEventRow, loadLog, loadLogAround } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { prepareCaseAppend } from "./append/case";

type Ctx = { viewer: Viewer; seed: Seed; state: State; log: Awaited<ReturnType<typeof loadLog>>; above: SeatAbove; t: T; locale: Locale };
type Begun = { ok: true; ctx: Ctx } | { ok: false; error: string };

/** The viewer, the seed, the log and the reduced state, as appendEventAction loads them. `around`: the cases the action is about; none = only the events without a target (the absence), "company" = the whole log (the load of the desks). */
async function begin(slug: string, around: readonly string[] | "company"): Promise<Begun> {
  const locale = await getLocale();
  const t = createT(locale);
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };
  const seed = await seedFor(slug);
  const log = around === "company" ? await loadLog(viewer.companyId) : await loadLogAround(viewer.companyId, seed, around);
  const knowledge = await loadKnowledge(viewer.companyId);
  const above: SeatAbove = (roleId, skip) => seatAbove(knowledge, roleId, skip)?.id ?? null;
  return { ok: true, ctx: { viewer, seed, state: reduce(seed, log), log, above, t, locale } };
}

const refresh = (slug: string): void => {
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout"); // subdomain mode: the company is the host, so the path has no slug
};

const sentence = (t: T, v: Verdict): string => (v.ok ? "" : t(v.key));
export type AwayOutcome = { ok: true } | { ok: false; error: string };

/** A person of this company by id, as the server resolves them: never an id from the client alone (D19). */
async function memberOf(companyId: string, userId: unknown): Promise<{ userId: string; active: boolean } | null> {
  if (typeof userId !== "string" || userId === "" || userId.length > 64) return null;
  const row = await getDb().user.findFirst({ where: { id: userId, companyId }, select: { id: true, active: true } });
  return row ? { userId: row.id, active: row.active } : null;
}

const SET_AWAY_KEYS = ["slug", "userId", "from", "to"];

/** Sets an absence of a person: themselves, a company admin, or the holder of the seat directly above them (D31). No reason is asked and none is kept (D3). */
export async function setAway(input: { slug: string; userId: string; from: number; to: number }): Promise<AwayOutcome> {
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", []);
  if (!begun.ok) return begun;
  const { viewer, state, above, t } = begun.ctx;
  // A payload key beyond these is refused: the event carries a person and two days, nothing else.
  if (typeof input !== "object" || input === null || !Object.keys(input).every((k) => SET_AWAY_KEYS.includes(k))) return { ok: false, error: t("cases.actionBadEvent") };
  const target = await memberOf(viewer.companyId, input.userId);
  const rights = maySetAway(viewer, target, state, above);
  if (!rights.ok) return { ok: false, error: sentence(t, rights) };
  const span = checkSpan(input.from, input.to, state.day);
  if (!span.ok) return { ok: false, error: sentence(t, span) };
  const id = `e_away_${crypto.randomUUID()}`;
  // `to` is a day number here and a hand-over's label (a string) in the core payload: the cast is the one place the two meet.
  const payload = { userId: target!.userId, from: input.from, to: input.to, awayId: id, setBy: viewer.userId } as unknown as EventPayload;
  const written = await appendEventRow(viewer.companyId, { id, day: 0, type: "person.away", actor: viewer.name, targetId: null, payload }, { actorUserId: viewer.userId });
  if (!written.ok) return { ok: false, error: written.error };
  refresh(input.slug);
  return { ok: true };
}

/** Ends an absence today. The span is found by its awayId in this company's state and the person is the span's own; the same rights as setting it (D19, D31). */
export async function endAway(input: { slug: string; awayId: string }): Promise<AwayOutcome> {
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", []);
  if (!begun.ok) return begun;
  const { viewer, state, above, t } = begun.ctx;
  const span = typeof input.awayId === "string" ? overloadOf(state).away.find((s) => s.awayId === input.awayId) : undefined;
  if (!span || span.endedDay !== null || span.to < state.day) return { ok: false, error: t("overload.err.notAway") };
  const rights = maySetAway(viewer, await memberOf(viewer.companyId, span.userId), state, above);
  if (!rights.ok) return { ok: false, error: sentence(t, rights) };
  const written = await appendEventRow(
    viewer.companyId,
    { id: `e_back_${crypto.randomUUID()}`, day: 0, type: "person.back", actor: viewer.name, targetId: null, payload: { userId: span.userId, awayId: span.awayId } },
    { actorUserId: viewer.userId },
  );
  if (!written.ok) return { ok: false, error: written.error };
  refresh(input.slug);
  return { ok: true };
}

export type Refused = { caseId: string; key: MessageKey; error?: string };
export type ShareOutcome = { done: string[]; refused: Refused[]; error?: string };

/**
 * Takes back the cases the clock handed away from the viewer's seat while they were away and nobody has touched since (D19). One case.handed per case to the
 * seat it was handed away from, why 'takeback', written as system:cover with the person in `takenBy`, so it is no pass of anybody (NOR counts people's only).
 */
export async function takeBack(input: { slug: string; caseIds: string[] }): Promise<ShareOutcome> {
  const ids = Array.isArray(input?.caseIds) ? input.caseIds.filter((id): id is string => typeof id === "string" && id !== "" && id.length <= 64).slice(0, 200) : [];
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", ids);
  if (!begun.ok) return { done: [], refused: [], error: begun.error };
  const { viewer, state, log } = begun.ctx;
  const out: ShareOutcome = { done: [], refused: [] };
  for (const caseId of ids) {
    const kase = state.cases.find((c) => c.id === caseId);
    const verdict = mayTakeBack(viewer, caseId, state, state.day, log.events);
    const last = kase?.handed[kase.handed.length - 1];
    const seat = last?.fromSeatId == null ? undefined : state.seats.find((s) => s.id === last.fromSeatId);
    const handedId = kase?.history.findLast((e) => e.type === "case.handed" && e.payload.why === "away")?.id;
    if (!kase || !verdict.ok || !seat || !handedId) {
      out.refused.push({ caseId, key: verdict.ok ? "overload.err.nothing" : verdict.key });
      continue;
    }
    // One take-back per hand-over: a second click finds the row there already.
    const written = await appendEventRow(
      viewer.companyId,
      { id: `e_takeback_${handedId}`, day: 0, type: "case.handed", actor: "system:cover", targetId: caseId, payload: { ...handPayload(state.seats, seat.id, "takeback"), takenBy: viewer.userId } as EventPayload },
      { actorUserId: null },
    );
    if (written.ok) out.done.push(caseId);
    else out.refused.push({ caseId, key: "overload.inbox.refused", error: written.error });
  }
  if (out.done.length > 0) refresh(input.slug);
  return out;
}

export type AwayTarget = { userId: string; name: string; span: { awayId: string; from: number; to: number } | null };

/** The people the viewer may set away, each with the current or next span and nothing else about them (D31): a company admin sees every active member, a seat holder the people directly below. */
export async function listAwayTargets(input: { slug: string }): Promise<AwayTarget[]> {
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", []);
  if (!begun.ok) return [];
  const { viewer, state, above } = begun.ctx;
  const rows = await getDb().user.findMany({ where: { companyId: viewer.companyId, active: true }, select: { id: true, name: true, active: true } });
  return awayTargets(viewer, rows.map((r) => ({ userId: r.id, name: r.name, active: r.active })), state, above)
    .map((m) => ({ userId: m.userId, name: m.name, span: currentOrNextSpan(state, m.userId, state.day) }));
}

/**
 * The seat above an overloaded desk (or a company admin) passes some of its cases on (D28): one case.handed per case under the viewer's name, only for cases that are
 * on this desk and open or in a discussion; each runs through the existing mayAppend with the viewer treated as the manager for that one hand-over (so the seat, status,
 * clock-reason and NOR's pass rules apply unchanged) and through the case area's append hook, as appendEventAction runs them. It counts as a pass like any person's.
 */
export async function passForDesk(input: { slug: string; roleId: string; caseIds: string[]; toSeatId: string; why: string }): Promise<ShareOutcome> {
  const ids = Array.isArray(input?.caseIds) ? input.caseIds.filter((id): id is string => typeof id === "string" && id !== "" && id.length <= 64).slice(0, 200) : [];
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", "company");
  if (!begun.ok) return { done: [], refused: [], error: begun.error };
  const { viewer, seed, state, above, t, locale } = begun.ctx;
  const out: ShareOutcome = { done: [], refused: [] };
  const rights = typeof input.roleId === "string" ? mayShareLoad(viewer, input.roleId, state, state.day, above) : ({ ok: false, key: "overload.err.notAbove" } as Verdict);
  if (!rights.ok) return { done: [], refused: ids.map((caseId) => ({ caseId, key: rights.key })), error: t(rights.key) };
  const who: Actor = { role: "manager", userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: viewer.name, handle: viewer.handle };
  for (const caseId of ids) {
    const kase = state.cases.find((c) => c.id === caseId);
    if (!kase || kase.assigneeRoleId !== input.roleId || !(kase.status === "open" || kase.status === "discussion")) {
      out.refused.push({ caseId, key: "overload.err.notOnDesk" });
      continue;
    }
    const refuse = (error: string) => out.refused.push({ caseId, key: "overload.inbox.refused", error });
    let payload: EventPayload = handPayload(seed.seats, typeof input.toSeatId === "string" ? input.toSeatId : "", typeof input.why === "string" ? input.why : "");
    const verdict = mayAppend(who, { type: "case.handed", target: caseId, payload }, state, locale);
    if (!verdict.ok) { refuse(verdict.error); continue; }
    const hook = await prepareCaseAppend({ companyId: viewer.companyId, viewer: { userId: viewer.userId, role: viewer.role }, type: "case.handed", target: caseId, payload, state, seed, locale });
    if (!hook.ok) { refuse(hook.error); continue; }
    payload = hook.payload;
    const actor = eventLabel(viewer, { type: "case.handed", payload }, kase, seed.postAs ?? DEFAULT_POST_AS);
    const written = await appendEventRow(viewer.companyId, { id: `e_pass_${crypto.randomUUID()}`, day: 0, type: "case.handed", actor, targetId: caseId, payload }, { actorUserId: viewer.userId });
    if (written.ok) out.done.push(caseId);
    else refuse(written.error);
  }
  if (out.done.length > 0) refresh(input.slug);
  return out;
}

/**
 * The seat above an overloaded desk (or a company admin) appoints a cover seat for it (D28): a seat of another role whose person is active and present. The
 * result names the seat in `done`; a refusal names it in `refused` (the field is called caseId for both actions). Adding a holder stays in Settings, Org.
 */
export async function appointCover(input: { slug: string; roleId: string; seatId: string }): Promise<ShareOutcome> {
  const begun = await begin(typeof input?.slug === "string" ? input.slug : "", "company");
  if (!begun.ok) return { done: [], refused: [], error: begun.error };
  const { viewer, seed, state, above, t } = begun.ctx;
  const seatId = typeof input.seatId === "string" ? input.seatId : "";
  const rights = typeof input.roleId === "string" ? mayShareLoad(viewer, input.roleId, state, state.day, above) : ({ ok: false, key: "overload.err.notAbove" } as Verdict);
  if (!rights.ok) return { done: [], refused: [{ caseId: seatId, key: rights.key }], error: t(rights.key) };
  const seat = seed.seats.find((s) => s.id === seatId);
  const person = seat?.userId == null ? null : await memberOf(viewer.companyId, seat.userId);
  if (!seat || seat.roleId === input.roleId || !person?.active || !seatPresent(state, seat.id, state.day)) {
    return { done: [], refused: [{ caseId: seatId, key: "overload.err.nothing" }], error: t("overload.err.nothing") };
  }
  const written = await appendEventRow(
    viewer.companyId,
    { id: `e_cover_${crypto.randomUUID()}`, day: 0, type: "desk.covered", actor: viewer.name, targetId: input.roleId, payload: { roleId: input.roleId, seatId } },
    { actorUserId: viewer.userId },
  );
  if (!written.ok) return { done: [], refused: [{ caseId: seatId, key: "overload.inbox.refused", error: written.error }] };
  refresh(input.slug);
  return { done: [seatId], refused: [] };
}
