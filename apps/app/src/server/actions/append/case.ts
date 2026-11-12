// The case area's hook of the append action (plan REG, decision D18): NOR and SEE write here; server/actions/events.ts is closed.
// NOR-B1: what the server decides about a person's pass and second look, whatever the client sent (the destination of Not mine and
// Send up, the route and the date floor of a pass, the desk of a second look), and the link of a no that says Already solved or in work.
// SEE-B1 (D23): a raise keeps the case it looked like, the cases related to it and the case it follows up only when they are the
// person's to see; a merge and a link name a second case the person must be able to open, and the note of a merge is cut.
// It runs before mayAppend, which then checks the stamped payload against the same state.
import { mayFollow, MERGE_NOTE_MAX } from "@/features/cases/links";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { stampNor, type SeatAboveFn } from "@/features/cases/stamp";
import { seatAbove } from "@/features/knowledge";
import { translate } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { loadLogAround } from "@/lib/db/events";
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

/** What the hook asks the database; a test hands in its own. */
export type CaseAppendDeps = {
  /** May this viewer open this case of this company? A missing id, another company's and a private case all answer false. */
  openable: (companyId: string, viewer: LogViewer, id: string) => Promise<boolean>;
  /** The cases as the log says they stand now, reduced together (a merge or a link of one is known to the other). */
  reducedCases: (c: AppendCtx, ids: readonly string[]) => Promise<ReducedCase[]>;
};

const dbDeps: CaseAppendDeps = {
  openable: async (companyId, viewer, id) => (await loadCaseFor(companyId, viewer, id)) !== null,
  reducedCases: async (c, ids) => {
    const state = reduce(c.seed, await loadLogAround(c.companyId, c.seed, ids));
    return state.cases.filter((x) => ids.includes(x.id));
  },
};

export async function prepareCaseAppend(c: AppendCtx, deps: CaseAppendDeps = dbDeps): Promise<AppendHook> {
  const refuse = (key: Parameters<typeof translate>[1]): AppendHook => ({ ok: false, error: translate(c.locale, key) });
  const kase = c.target ? c.state.cases.find((x) => x.id === c.target) : undefined;
  const viewer: LogViewer = { userId: c.viewer.userId, role: c.viewer.role as Role };
  /** A case of this company the viewer may open, other than the one the event is about; null for anything else, so none of it shows which. */
  const known = async (id: unknown): Promise<ReducedCase | null> => {
    if (typeof id !== "string" || id === "" || id.length > 64 || id === c.target) return null;
    const inState = c.state.cases.find((x) => x.id === id);
    if (inState?.seed) return inState;
    if (!(await deps.openable(c.companyId, viewer, id))) return null;
    return inState ?? (await deps.reducedCases(c, [id])).find((x) => x.id === id) ?? null;
  };

  // A raise keeps what it looked like and what it follows only for cases the person may open, and only a follow-up of their own no (D15, D16, D23).
  // Whatever else the client sent about them is dropped: the raise itself always goes through.
  if (c.type === "case.raised") {
    const payload = { ...c.payload };
    if (payload.proposal && typeof payload.proposal === "object") {
      const proposal = { ...payload.proposal };
      if (!(proposal.sameAs && (await known(proposal.sameAs)))) delete proposal.sameAs;
      if (proposal.related !== undefined) {
        const keep: string[] = [];
        for (const id of Array.isArray(proposal.related) ? proposal.related.slice(0, 5) : []) if (!keep.includes(id) && (await known(id))) keep.push(id);
        proposal.related = keep;
      }
      payload.proposal = proposal;
    }
    if (payload.follows !== undefined) {
      const old = await known(payload.follows);
      if (!(old && mayFollow(old, c.viewer.userId))) delete payload.follows;
    }
    return { ok: true, payload };
  }

  // A merge and a link name a second case: the person must be able to open both, here and now. A case they cannot open, another
  // company's and an unknown id are the same missing case to them (mayAppend refuses it as one); the other case comes from the log as it stands.
  if (c.type === "case.merged" || c.type === "case.linked") {
    if (!kase?.seed && c.target && !(await deps.openable(c.companyId, viewer, c.target))) return refuse("cases.permNoCase");
    const named = c.payload[c.type === "case.merged" ? "into" : "to"];
    const other = await known(named);
    if (other && c.target) {
      // Both cases as one log says they stand: the merge or link of one is known to the other, so a second link, a case that
      // absorbed repeats and a merged case are seen whichever of the two the event names.
      const both = await deps.reducedCases(c, [c.target, other.id]);
      for (const fresh of both.length === 2 ? both : [other]) {
        const at = c.state.cases.findIndex((x) => x.id === fresh.id);
        if (at >= 0) c.state.cases[at] = fresh;
        else c.state.cases.push(fresh);
      }
    }
    // A case the log happened to carry but the person may not open is no case to them either.
    if (!other && typeof named === "string") {
      const at = c.state.cases.findIndex((x) => x.id === named && x.id !== c.target);
      if (at >= 0) c.state.cases.splice(at, 1);
    }
    const payload = { ...c.payload };
    if (c.type === "case.merged" && typeof payload.note === "string") {
      const note = payload.note.trim().slice(0, MERGE_NOTE_MAX);
      if (note) payload.note = note;
      else delete payload.note;
    }
    return { ok: true, payload };
  }

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
