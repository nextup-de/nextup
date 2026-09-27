// The two read-only admin pages for the software team: what each company's knowledge looks like
// (and what a model would be told), and how the router's proposals fared. Every function checks
// the admin cookie itself - they are also reached from a route handler, not only from a page.
import { isAdmin } from "@/server/actions/admin";
import { SEED } from "@/features/demo/seed";
import { GOALS } from "@/features/evaluate";
import { companyBrief, NO_KNOWLEDGE, rowsFromSeed, type Knowledge, type Profile } from "@/features/knowledge";
import { toDecision, type DecisionRow } from "@/features/admin/decisions";
import type { Route } from "@/features/demo/types";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { decisionInputs } from "@/lib/db/decisions";
import { loadKnowledge, loadProfile } from "@/lib/db/knowledge";
import { assistStats, listDocuments, loadAssistSettings, type AssistSettings, type AssistStats } from "@/lib/db/assist";
import { providerConfig, type ProviderConfig } from "@/server/assist/provider";

export type KnowledgeView = { knowledge: Knowledge; profile: Profile | null; brief: string; source: "tables" | "demo" | "none" };

/** One company's knowledge. Without a database it is the built-in demo company's, labelled so. */
export async function knowledgeView(companyId: string | null): Promise<KnowledgeView> {
  if (!(await isAdmin())) return { knowledge: NO_KNOWLEDGE, profile: null, brief: "", source: "none" };
  if (!hasDatabase() || !companyId) {
    let n = 0;
    const knowledge = rowsFromSeed(SEED, GOALS, () => "demo" + ++n);
    return { knowledge, profile: null, brief: companyBrief(knowledge, null), source: "demo" };
  }
  const [knowledge, profile] = await Promise.all([loadKnowledge(companyId), loadProfile(companyId)]);
  const source = knowledge.units.length ? "tables" : "none";
  return { knowledge, profile, brief: source === "tables" ? companyBrief(knowledge, profile) : "", source };
}

type CompanyRef = { id: string; slug: string };

/** company slug -> its routing table, read the way the pages read it (tables over seedJson). */
async function companyRoutes(companies: readonly CompanyRef[]): Promise<Record<string, Route[]>> {
  if (companies.length === 0) return {};
  const rows = await getDb().company.findMany({ where: { id: { in: companies.map((c) => c.id) } }, select: { id: true, slug: true, seedJson: true } });
  const entries = await Promise.all(
    rows.map(async (c) => {
      try {
        return [c.slug, (await companySeed(c)).routes] as const;
      } catch {
        return [c.slug, [] as Route[]] as const; // a broken blob shows bare ids rather than breaking the page
      }
    }),
  );
  return Object.fromEntries(entries);
}

export type DecisionData = { rows: DecisionRow[]; routeNames: Record<string, Record<string, string>> };

/** The newest raises across the companies given, as decision rows, plus route names to show them with. */
export async function decisionData(companies: readonly CompanyRef[], limit = 200): Promise<DecisionData> {
  if (!(await isAdmin()) || !hasDatabase()) return { rows: [], routeNames: {} };
  const [inputs, routes] = await Promise.all([decisionInputs(companies, limit), companyRoutes(companies)]);
  const rows = inputs.map((d) => {
    const route = routes[d.company]?.find((r) => r.id === (d.payload.proposal?.routeId ?? d.payload.routeId));
    const desks = [d.payload.assignee, route?.owner.name, route?.deputy].filter((x): x is string => Boolean(x));
    return toDecision({ ...d, desks });
  });
  const routeNames = Object.fromEntries(Object.entries(routes).map(([slug, rs]) => [slug, Object.fromEntries(rs.map((r) => [r.id, r.type]))]));
  return { rows, routeNames };
}

export type AssistantView = {
  settings: AssistSettings;
  provider: ProviderConfig;
  stats: AssistStats;
  documents: Awaited<ReturnType<typeof listDocuments>>;
} | null;

/** The raise-page assistant for one company: its switches, 30 days of counts, the documents it may search. */
export async function assistantView(companyId: string | null): Promise<AssistantView> {
  if (!(await isAdmin()) || !hasDatabase() || !companyId) return null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [settings, stats, documents] = await Promise.all([loadAssistSettings(companyId), assistStats(companyId, since), listDocuments(companyId)]);
  return { settings, provider: providerConfig(), stats, documents };
}
