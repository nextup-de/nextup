"use server";
// What a person does with the project agent (plan AGT, D11, D13, D14, D15): the lead's switch, accepting (with or without editing the words) and
// dismissing a suggestion, and reading the words of the project's suggestions. Agent events are appended here, never through appendEventAction.
//
// Every write is ONE transaction under a lock per company and project (the lock a project's stop takes too). Inside it the world is read again:
// the flag, the log reduced, the suggestion's state, the project, the person's rights, the words, the people who are active. So:
//   - an acceptance and its follow-up (a Report's update, a Plan's step) and the text kept for the Agent tab's history commit together or not at all;
//   - two answers to one suggestion (accept/accept, accept/dismiss) are serialised: the second waits for the first, reads that the suggestion is
//     answered, and writes nothing;
//   - a retry of an accept that went through returns the stored result; what the retry typed cannot change what was accepted;
//   - nothing the client sends decides who gets a nudge, which week an update is for or whether a person may: all of that is read in here.
import { revalidatePath } from "next/cache";
import { meFor, type Actor } from "@/features/auth/identity";
import { getViewerFor, type Viewer } from "@/features/auth/session";
import type { EventPayload } from "@/features/cases/events";
import type { AppEventType } from "@/features/cases/persist";
import { reduce } from "@/features/cases/reducer";
import { mayAppend } from "@/features/cases/permissions";
import { seedFor } from "@/features/demo";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { isEnabled } from "@/features/flags";
import { DEFAULT_POST_AS, eventLabel } from "@/features/ideas/posting";
import { acceptPlan, dismissPlan, nudgeCandidates, parseSuggestionText, type PlannedEvent } from "@/features/agent/accept";
import { maySeeAgentTab, maySwitchAgent } from "@/features/agent/permissions";
import { agentStateOf } from "@/features/agent/reduce";
import type { AgentSuggestion, SuggestionText } from "@/features/agent/types";
import { createT, translate, type Locale } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { loadAgentTexts, newAgentTextId, saveAgentText } from "@/lib/db/agent-text";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companyDay, loadLogAround } from "@/lib/db/events";
import type { Tx } from "@/lib/db/integrations";
import { projectCases } from "@/lib/db/projections/case-view";
import { kickJira } from "@/server/jira-sync";
import { prepareProjectAppend } from "@/server/actions/append/project";
import { randomUUID } from "node:crypto";

export type AgentOutcome = { ok: true; /** The answer was given before: nothing was written now. */ duplicate: boolean } | { ok: false; error: string };
export type TextsOutcome = { ok: true; texts: Record<string, SuggestionText | null> } | { ok: false; error: string };

// An event id is as long as the writer made it: the daily run builds the suggestion's from the company, the project, the day and the kind.
const ID = /^[A-Za-z0-9_-]{1,200}$/;
const EDIT_MAX = 20_000;
/** An interactive transaction that waits for a lock and reads the log again needs more than the default five seconds. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/** A refusal inside the transaction: the message to show, and the rollback of everything written so far. */
class Refusal extends Error {}

type Ctx = { viewer: Viewer; locale: Locale; t: ReturnType<typeof createT> };

/** The viewer, the flag and the language, or the sentence that says why not. */
async function enter(slug: unknown): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: string }> {
  const locale = await getLocale();
  const t = createT(locale);
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  if (typeof slug !== "string" || slug === "") return { ok: false, error: t("cases.actionBadEvent") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };
  if (!(await isEnabled(slug, "agent"))) return { ok: false, error: t("projectAgent.permFlagOff") };
  return { ok: true, ctx: { viewer, locale, t } };
}

/** The company's world as one request sees it: the seed, the log around the project, the state and the agent's state. */
async function worldOf(slug: string, viewer: Viewer, projectId: string) {
  const seed = await seedFor(slug);
  const log = await loadLogAround(viewer.companyId, seed, [projectId]);
  const state = reduce(seed, log);
  const project = state.projects.find((p) => p.id === projectId);
  const agent = agentStateOf(log, state);
  const actor: Actor = { role: viewer.role, userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: viewer.name, handle: viewer.handle };
  return { seed, state, project, agent, actor };
}

/** Everything one transaction needs of a project, under its lock: the world is read again after the lock is held, never before. */
async function locked<T>(viewer: Viewer, projectId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${viewer.companyId + ":" + projectId}))::text`;
    return run(tx);
  }, TX_OPTIONS);
}

const failure = (err: unknown, t: Ctx["t"]): { ok: false; error: string } => {
  if (err instanceof Refusal) return { ok: false, error: err.message };
  console.error("agent action failed", err);
  return { ok: false, error: t("cases.actionBadEvent") };
};

/** The suggestion with this id of this company and the project it is about (the event's target): null for an id that is none here. */
async function projectOfSuggestion(companyId: string, suggestionId: unknown): Promise<string | null> {
  if (typeof suggestionId !== "string" || !ID.test(suggestionId)) return null;
  const row = await getDb().caseEvent.findFirst({ where: { companyId, id: suggestionId, type: "agent.suggested" }, select: { targetId: true } });
  return row?.targetId ?? null;
}

type Written = { id: string; type: AppEventType; target: string; payload: EventPayload; idemKey: string | null };

/** Writes the events in order, in the transaction, as the person: the company's day and the label the person's other events carry. */
async function write(tx: Tx, c: Ctx, actor: Actor, postAs: Parameters<typeof eventLabel>[3], events: readonly Written[], now: Date): Promise<void> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: c.viewer.companyId }, select: { stage: true, demoDay: true } });
  const calendar = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(c.viewer.companyId);
  const day = companyDay(company, calendar, now);
  for (const e of events) {
    await tx.caseEvent.create({
      data: {
        id: e.id, companyId: c.viewer.companyId, day, type: e.type, actor: eventLabel(actor, { type: e.type, payload: e.payload }, undefined, postAs),
        actorUserId: c.viewer.userId, targetId: e.target, payload: e.payload as object, source: "app", idemKey: e.idemKey,
      },
    });
  }
}

/** After the commit: the projections, the outside world and the pages. A failure here never undoes what was written. */
async function afterwards(slug: string, companyId: string, projectId: string, events: readonly Written[], now: Date): Promise<void> {
  try {
    await projectCases(companyId, [projectId], now);
  } catch (err) {
    console.error("projectCases failed", err);
  }
  if (events.some((e) => e.type.startsWith("project."))) kickJira(slug);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
}

/** The lead or a manager switches the agent on or off for a project (D11, D15). Switching to what it already is writes nothing. */
export async function switchAgentAction(slug: string, projectId: string, on: boolean): Promise<AgentOutcome> {
  const entered = await enter(slug);
  if (!entered.ok) return entered;
  const { ctx } = entered;
  if (typeof projectId !== "string" || !ID.test(projectId) || typeof on !== "boolean") return { ok: false, error: ctx.t("cases.actionBadEvent") };
  const now = new Date();
  try {
    const written: Written[] = [];
    const duplicate = await locked(ctx.viewer, projectId, async (tx) => {
      const w = await worldOf(slug, ctx.viewer, projectId);
      if (!w.project) throw new Refusal(ctx.t("projects.permNoProject"));
      const verdict = maySwitchAgent({ userId: w.actor.userId, role: w.actor.role, me: w.actor.me }, w.project);
      if (!verdict.ok) throw new Refusal(translate(ctx.locale, verdict.key));
      if ((w.agent.projects[projectId]?.on ?? false) === on) return true;
      const event: Written = { id: `ags_${randomUUID()}`, type: "agent.switched", target: projectId, payload: { on }, idemKey: null };
      await write(tx, ctx, w.actor, w.seed.postAs ?? DEFAULT_POST_AS, [event], now);
      written.push(event);
      return false;
    });
    if (written.length > 0) await afterwards(slug, ctx.viewer.companyId, projectId, written, now);
    return { ok: true, duplicate };
  } catch (err) {
    return failure(err, ctx.t);
  }
}

const planned = (e: PlannedEvent): Written => ({ id: e.id, type: e.type, target: e.target, payload: e.payload, idemKey: e.idemKey });

/** Is this suggestion answered already, by this very person the way asked? Then the answer stands and a retry is that answer, not another. */
const answeredBy = (s: AgentSuggestion, userId: string, status: "accepted" | "dismissed"): boolean => s.status === status && s.answeredByUserId === userId;

/**
 * Accepts a suggestion, with the words as drafted or as the person edited them. An Unblock sends the one notice (to the recipients read here), a
 * Report writes the week's update, a Plan adds the step: the answer and its follow-up are one write.
 */
export async function acceptSuggestionAction(slug: string, suggestionId: string, text?: string): Promise<AgentOutcome> {
  const entered = await enter(slug);
  if (!entered.ok) return entered;
  const { ctx } = entered;
  if (text !== undefined && (typeof text !== "string" || text.length > EDIT_MAX)) return { ok: false, error: ctx.t("projectAgent.permText") };
  const projectId = await projectOfSuggestion(ctx.viewer.companyId, suggestionId);
  if (projectId === null) return { ok: false, error: ctx.t("cases.actionBadEvent") };
  const now = new Date();
  try {
    const written: Written[] = [];
    const duplicate = await locked(ctx.viewer, projectId, async (tx) => {
      const w = await worldOf(slug, ctx.viewer, projectId);
      const s = w.agent.projects[projectId]?.suggestions.find((x) => x.id === suggestionId);
      if (!w.project || !s) throw new Refusal(ctx.t("cases.actionBadEvent"));
      if (answeredBy(s, ctx.viewer.userId, "accepted")) return true;

      const words = parseSuggestionText((await loadAgentTexts(ctx.viewer.companyId, [s.textId], tx)).get(s.textId));
      // The people who may get a nudge, as the company has them now: active, and of this company.
      const project = w.project;
      const candidates = [...new Set(project.steps.flatMap((st) => nudgeCandidates(project, st)))];
      const active = candidates.length === 0
        ? []
        : await tx.user.findMany({ where: { companyId: ctx.viewer.companyId, id: { in: candidates }, active: true }, select: { id: true } });
      const plan = acceptPlan({ actor: w.actor, project: w.project, suggestion: s, words, editedText: text, state: w.state, activeUserIds: new Set(active.map((u) => u.id)), locale: ctx.locale });
      if (!plan.ok) throw new Refusal(plan.error ?? translate(ctx.locale, plan.key));

      // Every follow-up goes through the project's own hook and rule once more, as the person, on the state it commits against.
      const events = plan.events.map(planned);
      for (const e of events.filter((x) => x.type.startsWith("project."))) {
        const hook = await prepareProjectAppend({ companyId: ctx.viewer.companyId, viewer: { userId: ctx.viewer.userId, role: ctx.viewer.role }, type: e.type, target: e.target, payload: e.payload, state: w.state, seed: w.seed, locale: ctx.locale });
        if (!hook.ok) throw new Refusal(hook.error);
        e.payload = hook.payload;
        const verdict = mayAppend(w.actor, { type: e.type, target: e.target, payload: e.payload }, w.state, ctx.locale);
        if (!verdict.ok) throw new Refusal(verdict.error);
      }
      // An edited text is kept as a text of its own for the Agent tab's history; the answer points at it.
      const accepted = events[0];
      if (accepted.payload.edited === true) {
        const textId = newAgentTextId();
        await saveAgentText(ctx.viewer.companyId, "suggestion", plan.text, { id: textId, tx });
        accepted.payload = { ...accepted.payload, textId };
      }
      await write(tx, ctx, w.actor, w.seed.postAs ?? DEFAULT_POST_AS, events, now);
      written.push(...events);
      return false;
    });
    if (written.length > 0) await afterwards(slug, ctx.viewer.companyId, projectId, written, now);
    return { ok: true, duplicate };
  } catch (err) {
    return failure(err, ctx.t);
  }
}

/** Dismisses an open suggestion, with the reason when the person gave one (at most 400 characters). */
export async function dismissSuggestionAction(slug: string, suggestionId: string, why?: string): Promise<AgentOutcome> {
  const entered = await enter(slug);
  if (!entered.ok) return entered;
  const { ctx } = entered;
  if (why !== undefined && typeof why !== "string") return { ok: false, error: ctx.t("projectAgent.permText") };
  const projectId = await projectOfSuggestion(ctx.viewer.companyId, suggestionId);
  if (projectId === null) return { ok: false, error: ctx.t("cases.actionBadEvent") };
  const now = new Date();
  try {
    const written: Written[] = [];
    const duplicate = await locked(ctx.viewer, projectId, async (tx) => {
      const w = await worldOf(slug, ctx.viewer, projectId);
      const s = w.agent.projects[projectId]?.suggestions.find((x) => x.id === suggestionId);
      if (!w.project || !s) throw new Refusal(ctx.t("cases.actionBadEvent"));
      if (answeredBy(s, ctx.viewer.userId, "dismissed")) return true;
      const plan = dismissPlan({ actor: w.actor, project: w.project, suggestion: s, why });
      if (!plan.ok) throw new Refusal(translate(ctx.locale, plan.key));
      const events = plan.events.map(planned);
      await write(tx, ctx, w.actor, w.seed.postAs ?? DEFAULT_POST_AS, events, now);
      written.push(...events);
      return false;
    });
    if (written.length > 0) await afterwards(slug, ctx.viewer.companyId, projectId, written, now);
    return { ok: true, duplicate };
  } catch (err) {
    return failure(err, ctx.t);
  }
}

/**
 * The words of the project's suggestions, for a person who may see the Agent tab (the lead, the sponsor, a manager): by suggestion id; a text the
 * retention run removed, and one that is not readable as words, is null. Nobody else gets any, whatever ids they know.
 */
export async function loadSuggestionTextsAction(slug: string, projectId: string): Promise<TextsOutcome> {
  const entered = await enter(slug);
  if (!entered.ok) return entered;
  const { ctx } = entered;
  if (typeof projectId !== "string" || !ID.test(projectId)) return { ok: false, error: ctx.t("cases.actionBadEvent") };
  try {
    const w = await worldOf(slug, ctx.viewer, projectId);
    if (!w.project) return { ok: false, error: ctx.t("projects.permNoProject") };
    const verdict = maySeeAgentTab({ userId: w.actor.userId, role: w.actor.role, me: w.actor.me }, w.project);
    if (!verdict.ok) return { ok: false, error: translate(ctx.locale, verdict.key) };
    const suggestions = w.agent.projects[projectId]?.suggestions ?? [];
    const texts = await loadAgentTexts(ctx.viewer.companyId, suggestions.map((s) => s.textId));
    return { ok: true, texts: Object.fromEntries(suggestions.map((s) => [s.id, parseSuggestionText(texts.get(s.textId))])) };
  } catch (err) {
    return failure(err, ctx.t);
  }
}
