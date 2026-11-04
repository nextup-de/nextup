// The server's side of a picked audience: names become ids, because the rule matches ids only (VIS/D10), and a
// browser never chooses the ids itself. Also which cases and projects stay inside the app (FX4).
import type { EventPayload } from "@/features/cases/events";
import { userByLabel } from "@/features/demo/identity";
import { getDb } from "./client";

/**
 * case.raised with visibility "custom": seenByUserIds and seenByUnitIds from the names in seenBy, whatever the
 * browser sent as ids. A name that matches nobody, or two people, is dropped: the case gets narrower, never wider.
 */
export async function stampAudience(companyId: string, type: string, payload: EventPayload): Promise<EventPayload> {
  if (type !== "case.raised" || payload.visibility !== "custom") return payload;
  const db = getDb();
  const [users, units] = await Promise.all([
    db.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, handle: true } }),
    db.orgUnit.findMany({ where: { companyId }, select: { id: true, name: true } }),
  ]);
  const labels = Array.isArray(payload.seenBy) ? payload.seenBy : [];
  const unitOf = new Map(units.map((u) => [u.name, u.id]));
  const seenByUnitIds = [...new Set(labels.flatMap((l) => { const id = unitOf.get(l); return id ? [id] : []; }))];
  const seenByUserIds = [...new Set(labels.flatMap((l) => { const id = unitOf.has(l) ? null : userByLabel(users, l); return id ? [id] : []; }))];
  return { ...payload, seenByUserIds, seenByUnitIds };
}

const CLOSED = ["private", "custom"];

/** The ids of the cases whose raiser chose who sees them, and of the projects they became. */
export async function closedTargets(companyId: string): Promise<Set<string>> {
  const db = getDb();
  const raised = await db.caseEvent.findMany({
    where: { companyId, type: "case.raised", OR: CLOSED.map((v) => ({ payload: { path: ["visibility"], equals: v } })) },
    select: { targetId: true },
  });
  const cases = raised.flatMap((r) => (r.targetId ? [r.targetId] : []));
  if (cases.length === 0) return new Set();
  const decided = await db.caseEvent.findMany({ where: { companyId, type: "case.decided", targetId: { in: cases } }, select: { payload: true } });
  const projects = decided.flatMap((d) => {
    const id = (d.payload as EventPayload | null)?.projectId;
    return typeof id === "string" ? [id] : [];
  });
  return new Set([...cases, ...projects]);
}
