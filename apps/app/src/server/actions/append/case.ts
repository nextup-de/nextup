// The case area's hook of the append action (plan REG, decision D18): NOR and SEE write here; server/actions/events.ts is closed.
// NOR-B1: what the server decides about a person's pass and second look, whatever the client sent (the destination of Not mine and
// Send up, the route and the date floor of a pass, the desk of a second look), and the link of a no that says Already solved or in work.
// It runs before mayAppend, which then checks the stamped payload against the same state.
import { stampNor, type SeatAboveFn } from "@/features/cases/stamp";
import { seatAbove } from "@/features/knowledge";
import { translate } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadCaseFor, type LogViewer } from "@/lib/db/viewer-log";
import type { Role } from "@/config/roles";
import type { AppendCtx, AppendHook } from "./shared";

/** The case events whose payload the server stamps. */
const STAMPED: readonly string[] = ["case.handed", "case.appealed", "case.appeal.decided", "case.reopened"];

/**
 * May this viewer link to `id` as the case or project that already covers an idea? Only a target of this company that they may open:
 * a missing id, another company's and a private case all answer the same, so the answer never shows that one exists (VIS, FX4).
 * A project is reached through the case whose yes opened it.
 */
export async function mayLinkTo(companyId: string, viewer: LogViewer, id: string): Promise<boolean> {
  if (await loadCaseFor(companyId, viewer, id)) return true;
  const yes = await getDb().caseEvent.findFirst({
    where: { companyId, type: "case.decided", payload: { path: ["projectId"], equals: id } },
    orderBy: { seq: "asc" },
    select: { targetId: true },
  });
  return yes?.targetId ? (await loadCaseFor(companyId, viewer, yes.targetId)) !== null : false;
}

export async function prepareCaseAppend(c: AppendCtx): Promise<AppendHook> {
  const refuse = (key: Parameters<typeof translate>[1]): AppendHook => ({ ok: false, error: translate(c.locale, key) });
  const kase = c.target ? c.state.cases.find((x) => x.id === c.target) : undefined;

  // Already solved or in work: the link is the viewer's to see (D17), checked against the database, not the slice of the log in `state`.
  if (c.type === "case.decided" && c.payload.answer === "no" && c.payload.category === "duplicate") {
    const link = c.payload.duplicateOf;
    if (typeof link !== "string" || link.length < 1 || link.length > 64 || link === c.target) return refuse("cases.permDuplicateTarget");
    if (!(await mayLinkTo(c.companyId, { userId: c.viewer.userId, role: c.viewer.role as Role }, link))) return refuse("cases.permDuplicateTarget");
    return { ok: true, payload: c.payload };
  }

  if (!STAMPED.includes(c.type) || !kase) return { ok: true, payload: c.payload };
  const knowledge = await loadKnowledge(c.companyId);
  const above: SeatAboveFn = (roleId, skip) => {
    const seat = seatAbove(knowledge, roleId, skip);
    return seat ? { id: seat.id, label: seat.name } : null;
  };
  const payload = stampNor(c.type, c.payload, kase, c.state, above);
  // A send-up needs a seat above the desk (D13): nobody there, and the person is told to ask a manager.
  if (c.type === "case.handed" && payload.up === true && typeof payload.toRoleHolderId !== "string") return refuse("cases.permNoAbove");
  return { ok: true, payload };
}
