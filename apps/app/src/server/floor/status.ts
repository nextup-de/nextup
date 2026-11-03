// Status by reference (plan FLR, D12): the reference finds the case, the view shows what a reporter
// without a name may read. Not a "use server" module: the floor-status actions call it.
import { randomUUID } from "node:crypto";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { checkReply, statusView, type StatusView } from "@/features/floor/status";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { hashFloor, referenceByHash } from "@/lib/db/floor";
import { hasDatabase } from "@/lib/db/mode";
import { throttle } from "@/server/throttle";

export type FloorStatusResult =
  | { ok: true; view: StatusView; raisedOn: string }
  | { ok: false; reason: "unknown" | "limited"; message?: string };
export type FloorReplyResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: "unknown" | "limited" | "invalid" | "closed"; message?: string };

const REFERENCE = /^\d{8}$/;

type Found = { companyId: string; caseId: string; areaId: string | null; createdAt: Date };

async function find(slug: string, reference: string): Promise<Found | null> {
  if (!hasDatabase() || !REFERENCE.test(reference)) return null;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return null;
  const ref = await referenceByHash(company.id, hashFloor(company.id, reference));
  return ref ? { companyId: company.id, ...ref } : null;
}

async function reduced(slug: string, found: Found) {
  const seed = await seedFor(slug);
  const log = await loadLog(found.companyId);
  return reduce(seed, log).cases.find((c) => c.id === found.caseId) ?? null;
}

export async function floorStatus(slug: string, reference: string, deviceKey: string): Promise<FloorStatusResult> {
  const limited = await throttle("floorStatus", deviceKey);
  if (limited) return { ok: false, reason: "limited", message: limited };
  const found = await find(slug, reference);
  const kase = found ? await reduced(slug, found) : null;
  if (!found || !kase) return { ok: false, reason: "unknown" };

  const db = getDb();
  const [area, roles] = await Promise.all([
    found.areaId ? db.floorArea.findFirst({ where: { id: found.areaId, companyId: found.companyId }, select: { name: true } }) : null,
    db.orgRole.findMany({ where: { companyId: found.companyId }, select: { id: true, title: true } }),
  ]);
  const view = statusView(kase, {
    areaName: area?.name ?? null,
    roleTitleOf: (id) => (id === null ? null : (roles.find((r) => r.id === id)?.title ?? null)),
  });
  return { ok: true, view, raisedOn: found.createdAt.toISOString() };
}

/** Appends `case.answered` as system:floor; one reply per question through the idempotency key. */
export async function floorReply(slug: string, reference: string, text: string, deviceKey: string): Promise<FloorReplyResult> {
  const checked = checkReply(text);
  if (!checked.ok) return { ok: false, reason: "invalid" };
  // A reply also tells whether a reference exists, so it counts against the same limit as a lookup.
  const limited = await throttle("floorStatus", deviceKey);
  if (limited) return { ok: false, reason: "limited", message: limited };
  const found = await find(slug, reference);
  const kase = found ? await reduced(slug, found) : null;
  if (!found || !kase) return { ok: false, reason: "unknown" };

  const question = statusView(kase, { roleTitleOf: () => null, areaName: null }).question;
  if (!question) return { ok: false, reason: "closed" };
  const result = await appendEventRow(
    found.companyId,
    { id: `e_${randomUUID()}`, day: 0, type: "case.answered", actor: "system:floor", targetId: found.caseId, payload: { text: checked.text } },
    { actorUserId: null, source: "floor", idemKey: `floor-reply:${question.eventId}` },
  );
  if (!result.ok) return { ok: false, reason: "unknown" };
  return { ok: true, duplicate: result.duplicate };
}
