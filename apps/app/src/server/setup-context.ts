// What setup shows about the company context draft: can it run, is it running, what did it find. Read on every
// load, never stored apart from the run's own row. Not a "use server" module: loaders the pages and the
// overview call, and the run's check that it may still go on. docs/COMPANY_KNOWLEDGE.md, "The context draft".
import type { KnowledgeSource } from "@nextup/contracts/public";
import { aiGate, type AiGate } from "@/features/ai/gate";
import { contextStatusOf, type ContextDraft, type ContextError, type ContextStatus } from "@/features/settings/context-draft";
import { companyPrefix } from "@/features/tenant/urls";
import { loadAiSettings } from "@/lib/db/ai";
import { loadAiRouting, loadAssistSettings, type AssistSettings } from "@/lib/db/assist";
import { getDb, hasDatabase } from "@/lib/db/client";
import { connectionStatus } from "@/lib/db/connections";
import { loadContextRun } from "@/lib/db/context-run";
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";

export type ContextFacts = { gate: AiGate; key: string | null; assist: AssistSettings; sources: KnowledgeSource[] };

/** The same gate as the brain's other calls: a model only with the AI on and its agreement signed. */
export async function contextFacts(companyId: string): Promise<ContextFacts | null> {
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  if (!company) return null;
  const [ai, assist, aiRouting, sources] = await Promise.all([
    loadAiSettings(companyId, company.stage), loadAssistSettings(companyId), loadAiRouting(companyId), knowledgeSourcesFor(companyId),
  ]);
  const gate = aiGate({
    stage: company.stage, hasDatabase: true, settings: ai.settings, dpaSignedAt: assist.dpaSignedAt,
    purpose: "brain", assistantOn: assist.enabled, aiRouting,
  });
  return { gate, key: ai.key, assist, sources };
}

/** Can a run go at all? A source to search and a model allowed to read it. */
export const contextUsable = (f: Pick<ContextFacts, "gate" | "sources"> | null): boolean => Boolean(f && f.gate.on && f.sources.length > 0);

/** The status the setup overview shows for phase 4. Never throws: a page must not fail on it. */
export async function loadContextStatus(companyId: string): Promise<ContextStatus> {
  if (!hasDatabase()) return "notUsed";
  try {
    const [facts, run] = await Promise.all([contextFacts(companyId), loadContextRun(companyId)]);
    return contextStatusOf({ usable: contextUsable(facts), run });
  } catch (err) {
    console.warn("[context-run] status not read:", err instanceof Error ? err.name : "error");
    return "notUsed";
  }
}

/** Everything the panel on the Company step needs: plain values, no secret and no provider text. */
export type ContextPanelData = {
  status: ContextStatus;
  /** Microsoft 365 search is on for the company. */
  sourceOn: boolean;
  /** The AI is on with its agreement. */
  aiOn: boolean;
  /** The viewer's own Microsoft account: the run searches as whoever starts it. */
  account: "connected" | "renew" | "none";
  /** Where the viewer connects their account. */
  profileHref: string;
  startedBy: string | null;
  /** yyyy-mm-dd */
  finishedOn: string | null;
  error: ContextError | null;
  draft: ContextDraft | null;
  reviewed: boolean;
};

/** No database: nothing can run, and setup still finishes. */
export const CONTEXT_NOT_USED: ContextPanelData = {
  status: "notUsed", sourceOn: false, aiOn: false, account: "none", profileHref: "", startedBy: null, finishedOn: null, error: null, draft: null, reviewed: false,
};

export async function loadContextPanel(companyId: string, slug: string, viewerId: string): Promise<ContextPanelData> {
  const [facts, run, connection] = await Promise.all([contextFacts(companyId), loadContextRun(companyId), connectionStatus(companyId, viewerId)]);
  const starter = run
    ? await getDb().user.findFirst({ where: { id: run.startedById, companyId }, select: { name: true } })
    : null;
  return {
    status: contextStatusOf({ usable: contextUsable(facts), run }),
    sourceOn: (facts?.sources.length ?? 0) > 0,
    aiOn: Boolean(facts?.gate.on),
    account: !connection ? "none" : connection.lastError ? "renew" : "connected",
    profileHref: `${companyPrefix(slug)}/profile`,
    startedBy: starter?.name ?? null,
    finishedOn: run?.finishedAt ? run.finishedAt.toISOString().slice(0, 10) : null,
    error: (run?.error as ContextError | null | undefined) ?? null,
    draft: run?.draft ?? null,
    reviewed: Boolean(run?.reviewedAt),
  };
}
