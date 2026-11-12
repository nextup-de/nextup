// A case as the agent's server actions see it (plan AGT-U2, D15): the signed-in viewer, the company, the reduced case, the agent's state and the flag,
// read fresh from the database, for a case the viewer may open. Whatever is not there - no database, a demo stage, no viewer, a case that is not this
// company's or that the viewer may not open, a flag that is off - is null, and the caller shows nothing (D4, D8). Every action reads this again when it
// returns generated text, so a right the viewer lost is lost for what they get back. Not a "use server" module.
import { meFor, type Me, type SeatRow } from "@/features/auth/identity";
import { agentStateOf } from "@/features/agent/reduce";
import type { AgentViewer } from "@/features/agent/permissions";
import type { AgentState } from "@/features/agent/types";
import { getViewerFor } from "@/features/auth/session";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { isEnabled } from "@/features/flags";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLogAround } from "@/lib/db/events";
import { mayOpen } from "@/lib/db/viewer-log";

export type CaseContext = {
  companyId: string;
  slug: string;
  viewer: AgentViewer & { me: Me };
  userName: string;
  kase: ReducedCase;
  seats: readonly SeatRow[];
  agent: AgentState;
};

/** The case for this viewer, or null. */
export async function caseContext(slug: string, caseId: string): Promise<CaseContext | null> {
  if (!hasDatabase() || typeof slug !== "string" || typeof caseId !== "string" || caseId.length === 0 || caseId.length > 100) return null;
  const v = await getViewerFor(slug);
  if (!v) return null;
  const company = await getDb().company.findUnique({ where: { id: v.companyId }, select: { id: true, slug: true, stage: true, seedJson: true } });
  if (!company || company.stage === "demo" || company.slug !== slug) return null;
  if (!(await isEnabled(slug, "agent"))) return null;
  if ((await mayOpen(company.id, { userId: v.userId, role: v.role }, caseId)) === false) return null;
  const seed = await companySeed(company);
  const log = await loadLogAround(company.id, seed, [caseId]);
  const state = reduce(seed, log);
  const kase = state.cases.find((c) => c.id === caseId);
  if (!kase) return null;
  return {
    companyId: company.id, slug, userName: v.name, kase, seats: state.seats, agent: agentStateOf(log, state),
    viewer: { userId: v.userId, role: v.role, me: meFor(v.userId, state.seats) },
  };
}
