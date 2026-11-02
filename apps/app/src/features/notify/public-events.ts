// The internal event as customers see it (NTF/D10, docs/adr/0005-event-versioning.md). Pure. Ids only: never a
// display name, a handle or a personnel number, and never free text someone typed (a reason can name people).
import type { PublicEvent } from "@nextup/contracts/public";
import { holderOf } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";

type Source = Pick<CaseEvent, "id" | "ts" | "type" | "target" | "payload" | "actorUserId">;

const VERSION = 1;

/** The public events one internal event becomes: none, one, or two (a yes that opens a project). */
export function toPublicEvents(ev: Source, state: State, companyId: string): PublicEvent[] {
  const target = ev.target;
  if (!target) return [];
  const uid = ev.actorUserId ?? null;
  const make = (suffix: string, type: PublicEvent["type"], kind: "case" | "project", id: string, data: Record<string, unknown>): PublicEvent => ({
    id: ev.id + suffix,
    type,
    typeVersion: VERSION,
    companyId,
    occurredAt: new Date(ev.ts).toISOString(),
    actor: { userId: uid, roleId: uid ? holderOf(state.seats, uid)?.roleId ?? null : null },
    subject: { kind, id },
    data,
  });
  const kase = state.cases.find((c) => c.id === target);
  const pl = ev.payload;

  switch (ev.type) {
    case "case.raised":
      return [make("", "case.raised", "case", target, {
        routeId: kase?.routeId ?? pl.routeId ?? null,
        kind: kase?.kind ?? pl.kind ?? "problem",
        seatId: pl.assigneeRoleHolderId ?? kase?.assigneeSeatId ?? null,
      })];
    case "case.handed":
      return [make("", "case.handed", "case", target, { toSeatId: pl.toRoleHolderId ?? null })];
    case "case.answered":
      return [make("", "case.answered", "case", target, {})];
    case "case.decided": {
      const answer = pl.answer === "no" ? "no" : "yes";
      const projectId = answer === "yes" ? pl.projectId ?? kase?.decided?.projectId ?? null : null;
      const out = [make("", "case.decided", "case", target, { answer, projectId })];
      if (projectId) {
        const project = state.projects.find((p) => p.id === projectId);
        out.push(make(":project", "project.started", "project", projectId, { caseId: target, leadUserId: pl.leadUserId ?? project?.leadUserId ?? null }));
      }
      return out;
    }
    case "project.started":
      return [make("", "project.started", "project", target, { leadUserId: state.projects.find((p) => p.id === target)?.leadUserId ?? null })];
    case "project.done":
      return [make("", "project.done", "project", target, {})];
    case "project.stopped":
      return [make("", "project.stopped", "project", target, {})];
    default:
      return [];
  }
}
