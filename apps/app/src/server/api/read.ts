// API v1 reading (API-A1, D8): the company's state from its log, mapped to the canonical model. A v1 token acts for
// the company system, so private cases never leave (D3). Each function returns null for "no such company or id".
import type { ApiV1Case, ApiV1CaseList, ApiV1DecisionList, ApiV1ListQuery, ApiV1Org, ApiV1Project, ApiV1ProjectList } from "@nextup/contracts/public";
import { reduce, type State } from "@/features/cases/reducer";
import { caseRefOf, decidedAtMs, decisionOf, isPrivate, orgOf, pageOf, projectRefOf, raisedAtMs, type MapCtx } from "@/features/api/map";
import { seedFor } from "@/features/demo";
import { loadLogForSlug } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";
import { companyBaseUrl } from "@/server/case-notice";

type Query = Pick<ApiV1ListQuery, "cursor" | "limit">;
type Snap = { state: State; ctx: MapCtx };

const DAY_MS = 86_400_000;

async function snapshot(slug: string, companyId: string): Promise<Snap | null> {
  const log = await loadLogForSlug(slug);
  if (!log) return null;
  const state = reduce(await seedFor(slug), log);
  const ctx: MapCtx = { companyId, baseUrl: companyBaseUrl(slug), nowMs: Date.now(), day: state.day, seats: state.seats, projects: state.projects };
  return { state, ctx };
}

export async function listCases(slug: string, companyId: string, query: Query): Promise<ApiV1CaseList | null> {
  const snap = await snapshot(slug, companyId);
  if (!snap) return null;
  const entries = snap.state.cases.filter((c) => !isPrivate(c)).map((c) => ({ id: c.id, at: raisedAtMs(c, snap.ctx), data: caseRefOf(c, snap.ctx) }));
  const page = pageOf(entries, query);
  return { data: page.items.map((e) => e.data), page: { nextCursor: page.nextCursor } };
}

export async function getCase(slug: string, companyId: string, id: string): Promise<ApiV1Case | null> {
  const snap = await snapshot(slug, companyId);
  const kase = snap?.state.cases.find((c) => c.id === id);
  if (!snap || !kase || isPrivate(kase)) return null;
  return { data: caseRefOf(kase, snap.ctx) };
}

export async function listDecisions(slug: string, companyId: string, query: Query): Promise<ApiV1DecisionList | null> {
  const snap = await snapshot(slug, companyId);
  if (!snap) return null;
  const entries = snap.state.cases.flatMap((c) => {
    const d = isPrivate(c) ? null : decisionOf(c, snap.ctx);
    const at = decidedAtMs(c, snap.ctx);
    return d && at !== null ? [{ id: d.id, at, data: d }] : [];
  });
  const page = pageOf(entries, query);
  return { data: page.items.map((e) => e.data), page: { nextCursor: page.nextCursor } };
}

/** A project is hidden when the case it came from is private. */
function projectVisible(snap: Snap, sources: readonly string[]): boolean {
  const first = sources[0];
  const kase = first ? snap.state.cases.find((c) => c.id === first) : undefined;
  return !(kase && isPrivate(kase));
}

export async function listProjects(slug: string, companyId: string, query: Query): Promise<ApiV1ProjectList | null> {
  const snap = await snapshot(slug, companyId);
  if (!snap) return null;
  const entries = snap.state.projects
    .filter((p) => projectVisible(snap, p.sources))
    .map((p) => ({ id: p.id, at: snap.ctx.nowMs + (p.openedDay - snap.ctx.day) * DAY_MS, data: projectRefOf(p, snap.ctx) }));
  const page = pageOf(entries, query);
  return { data: page.items.map((e) => e.data), page: { nextCursor: page.nextCursor } };
}

export async function getProject(slug: string, companyId: string, id: string): Promise<ApiV1Project | null> {
  const snap = await snapshot(slug, companyId);
  const p = snap?.state.projects.find((x) => x.id === id);
  if (!snap || !p || !projectVisible(snap, p.sources)) return null;
  return { data: projectRefOf(p, snap.ctx) };
}

/** The org chart; the caller's token already proved the company exists. */
export async function getOrg(companyId: string): Promise<ApiV1Org> {
  return orgOf(await loadKnowledge(companyId), companyId);
}
