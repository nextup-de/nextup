"use server";
// Stopping a project and, when the stopper chooses so, sending its ideas back to their desks: one server operation (plan RES, D24).
// project.stopped and one case.reopened per eligible source case land in one transaction or not at all. The state they are checked
// against is reloaded here, checked again inside the transaction against what was appended since, and the ids derive from the
// caller's request id, so a retry writes nothing twice. The UI awaits this result before it shows success.
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { meFor, type Actor } from "@/features/auth/identity";
import { getViewerFor } from "@/features/auth/session";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { mayAppend, needsCaseAccess } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { isEnabled } from "@/features/flags";
import { DEFAULT_POST_AS, eventLabel } from "@/features/ideas/posting";
import { notEligible, reopenEvents } from "@/features/projects/stop-choice";
import { createT } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appendEventRow, companyDay, loadLogAround } from "@/lib/db/events";
import { loadMembers } from "@/lib/db/knowledge";
import { projectCases } from "@/lib/db/projections/case-view";
import { kickJira } from "@/server/jira-sync";
import { prepareCaseAppend } from "./append/case";
import { prepareProjectAppend } from "./append/project";

const Input = z.object({
  slug: z.string().min(1),
  projectId: z.string().min(1).max(64),
  why: z.string().trim().min(1).max(2000),
  pick: z.enum(["keep", "return"]),
  /** The caller's own id for this stop: a retry sends the same one. */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

export type StopProjectInput = z.input<typeof Input>;
/** `reopened`: the cases that went back to their desk; `skipped`: source cases left alone because their latest decision is no longer this project's yes. */
export type StopProjectOutcome = { ok: true; reopened: string[]; skipped: string[] } | { ok: false; error: string };

/** What does not change who may reopen what: a clock fact, a comment, a read mark. */
const IRRELEVANT = ["clock.due", "project.commented", "case.commented", "case.read", "case.affected", "case.unaffected"];

/**
 * The id of the stop event, scoped to the company, the project, the person and the operation: another person's request id, another
 * project's or another company's never collides with this one, and nobody can read a result by guessing an id.
 */
const stopIdOf = (companyId: string, projectId: string, userId: string, requestId: string): string =>
  "stop-" + createHash("sha256").update([companyId, projectId, userId, "project.stop", requestId].join("|")).digest("hex").slice(0, 40);

export async function stopProjectAction(input: StopProjectInput): Promise<StopProjectOutcome> {
  const locale = await getLocale();
  const t = createT(locale);
  const failed = (error: string): StopProjectOutcome => ({ ok: false, error: t("projectResult.stopFailed", { error }) });
  if (!hasDatabase()) return failed(t("cases.actionNoDatabase"));

  const parsed = Input.safeParse(input);
  if (!parsed.success) return failed(t("cases.actionBadEvent"));
  const { slug, projectId, why, pick, requestId } = parsed.data;

  const viewer = await getViewerFor(slug);
  if (!viewer) return failed(t("cases.actionSessionExpired"));
  if (!(await isEnabled(slug, "projects"))) return failed(t("cases.actionProjectsOff"));
  const companyId = viewer.companyId;
  const stopId = stopIdOf(companyId, projectId, viewer.userId, requestId);
  const db = getDb();

  // A retry: the stop is already written. Only the one who wrote it, with the same body, gets its result back (the id carries the person).
  const earlier = async (): Promise<StopProjectOutcome | null> => {
    const prior = await db.caseEvent.findFirst({ where: { companyId, id: stopId }, select: { type: true, targetId: true, actorUserId: true, payload: true } });
    if (!prior) return null;
    const sameBody = prior.type === "project.stopped" && prior.targetId === projectId && prior.actorUserId === viewer.userId && (prior.payload as EventPayload | null)?.why === why;
    const rows = await db.caseEvent.findMany({ where: { companyId, id: { startsWith: stopId + "-r" } }, select: { targetId: true }, orderBy: { id: "asc" } });
    // A request id that was used for another body is not a retry of this one.
    if (!sameBody || (pick === "keep" && rows.length > 0)) return failed(t("cases.actionBadEvent"));
    return { ok: true, reopened: rows.flatMap((r) => (r.targetId === null ? [] : [r.targetId])), skipped: [] };
  };
  const seen = await earlier();
  if (seen) return seen;

  // The sequence number of the last event before anything is read: whatever lands on the affected cases after it makes this stop stale.
  const baseline = (await db.caseEvent.aggregate({ where: { companyId }, _max: { seq: true } }))._max.seq ?? 0;

  const seed = await seedFor(slug);
  const log = await loadLogAround(companyId, seed, [projectId]);
  const who: Actor = { role: viewer.role, userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: viewer.name, handle: viewer.handle };
  const state = reduce(seed, log);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return failed(t("projects.permNoProject"));
  const postAs = seed.postAs ?? DEFAULT_POST_AS;
  const accessFor = async (type: string) => (needsCaseAccess(type as never) ? { roles: seed.roles ?? [], members: await loadMembers(companyId) } : undefined);

  // The stop, checked as the append action checks any project event (hook, then rights), against the state as reloaded.
  const stopPayload: EventPayload = { why };
  const stopHook = await prepareProjectAppend({ companyId, viewer: { userId: viewer.userId, role: viewer.role }, type: "project.stopped", target: projectId, payload: stopPayload, state, seed, locale });
  if (!stopHook.ok) return failed(stopHook.error);
  const stopVerdict = mayAppend(who, { type: "project.stopped", target: projectId, payload: stopHook.payload }, state, locale);
  if (!stopVerdict.ok) return failed(stopVerdict.error);

  // Apply it in memory and ask again: which source cases may go back is decided on the state after the stop.
  const stopLabel = eventLabel(viewer, { type: "project.stopped", payload: {} }, undefined, postAs);
  const stopEvent: CaseEvent = { id: stopId, ts: Date.now(), day: log.day, type: "project.stopped", actor: stopLabel, actorUserId: viewer.userId, target: projectId, payload: stopHook.payload };
  const after = reduce(seed, { events: [...log.events, stopEvent], day: log.day });
  const stopped = after.projects.find((p) => p.id === projectId);
  if (!stopped) return failed(t("projects.permNoProject"));
  const wanted = reopenEvents(stopped, after, pick, log.day, seed.promiseDays);
  const skipped = pick === "return" ? notEligible(stopped, after).map((c) => c.id) : [];

  const reopens: { id: string; target: string; actor: string; payload: EventPayload }[] = [];
  for (const [i, e] of wanted.entries()) {
    const hook = await prepareCaseAppend({ companyId, viewer: { userId: viewer.userId, role: viewer.role }, type: e.type, target: e.target, payload: e.payload, state: after, seed, locale });
    if (!hook.ok) return failed(hook.error);
    const verdict = mayAppend(who, { type: e.type, target: e.target, payload: hook.payload }, after, locale, await accessFor(e.type));
    if (!verdict.ok) return failed(verdict.error);
    const own = after.cases.find((c) => c.id === e.target);
    reopens.push({ id: `${stopId}-r${i + 1}`, target: e.target, actor: eventLabel(viewer, { type: e.type, payload: hook.payload }, own, postAs), payload: hook.payload });
  }

  // Write: the stop and every reopen in one transaction. Inside it, under a lock per affected aggregate in id order, nothing relevant may
  // have been appended to them since the baseline; a concurrent decision, withdrawal or stop makes this refuse, and the form is read again.
  const now = new Date();
  const affected = [projectId, ...reopens.map((r) => r.target)];
  const lockKeys = [...new Set(affected)].sort();
  const company = await db.company.findFirstOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const calendar = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(companyId);
  const result = await appendEventRow(
    companyId,
    { id: stopId, day: 0, type: "project.stopped", actor: stopLabel, targetId: projectId, payload: stopHook.payload },
    {
      actorUserId: viewer.userId,
      now,
      along: async (tx) => {
        for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":" + key}))::text`;
        const changed = await tx.caseEvent.count({
          where: {
            companyId, seq: { gt: baseline }, id: { not: stopId }, type: { notIn: IRRELEVANT },
            OR: [{ targetId: { in: affected } }, { payload: { path: ["projectId"], equals: projectId } }],
          },
        });
        if (changed > 0) throw new Error(t("cases.actionBadEvent"));
        const day = companyDay(company, calendar, now);
        for (const r of reopens) {
          await tx.caseEvent.create({ data: { id: r.id, companyId, day, type: "case.reopened", actor: r.actor, actorUserId: viewer.userId, targetId: r.target, payload: r.payload as object, source: "app" } });
        }
      },
    },
  );
  if (!result.ok) return failed(result.error);
  if (result.duplicate) {
    // A collision: either an earlier try of this very request, or a row inside the transaction that made it roll back (then nothing was written).
    return (await earlier()) ?? failed(t("cases.actionBadEvent"));
  }

  // After the commit, for every appended event: the projections and the outside world.
  if (reopens.length > 0) {
    try {
      await projectCases(companyId, reopens.map((r) => r.target), now);
    } catch (err) {
      console.error("projectCases failed", err);
    }
  }
  kickJira(slug);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true, reopened: reopens.map((r) => r.target), skipped };
}
