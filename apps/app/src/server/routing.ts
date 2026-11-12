// The routing proposal at raise, made on the server (docs/plans AIP D9). The browser used to ask
// the brain and send the answer inside case.raised; now whatever it sent is replaced here.
// The brain's proposal when the gate (purpose routing) holds and it answers in time, else the
// keyword proposal - the core loop works with the AI off (D3). payload.routeId is the person's
// choice and is never touched. Not a "use server" module: server/actions/events.ts calls it.
import { aiGate } from "@/features/ai/gate";
import type { EventPayload, RouteProposal } from "@/features/cases/events";
import { seedFor } from "@/features/demo";
import { propose, ROUTER_VERSION } from "@/features/routing";
import { loadAiSettings } from "@/lib/db/ai";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { loadAiRouting, loadAssistSettings } from "@/lib/db/assist";
import { getDb, hasDatabase } from "@/lib/db/client";
import { askBrain, brainConfigured } from "@/server/brain";

const DEFAULT_RAISE_TIMEOUT_MS = 8000;

export type ProposeOptions = { ask?: typeof askBrain; timeoutMs?: number };

function raiseTimeout(): number {
  return Number(process.env.BRAIN_RAISE_TIMEOUT_MS) || DEFAULT_RAISE_TIMEOUT_MS;
}

/** The keyword proposal from the company's seed routes: the same text the raise page matched. */
async function keywordProposal(slug: string, payload: EventPayload): Promise<RouteProposal> {
  const seed = await seedFor(slug);
  const text = [payload.title, payload.body].filter(Boolean).join(" ");
  const found = propose(text, seed.routes);
  return { routeId: found?.route?.id ?? null, confidence: found?.confidence ?? 0, source: "keywords", version: ROUTER_VERSION };
}

/** The brain's answer, or null: gate closed, brain unset, incomplete endpoint, failed. */
async function brainProposal(slug: string, companyId: string, payload: EventPayload, ask: typeof askBrain): Promise<RouteProposal | null> {
  if (!hasDatabase()) return null;
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  if (!company) return null;
  const [ai, assist, aiRouting, budget] = await Promise.all([loadAiSettings(companyId, company.stage), loadAssistSettings(companyId), loadAiRouting(companyId), loadAiBudget(companyId)]);
  const gate = aiGate({
    stage: company.stage, hasDatabase: true, settings: ai.settings,
    dpaSignedAt: assist.dpaSignedAt, purpose: "routing", assistantOn: assist.enabled, aiRouting, budget, stackBrain: brainConfigured(),
  });
  if (!gate.on) return null;
  const answer = await ask(
    gate, slug, { title: payload.title ?? "", body: payload.body ?? "" },
    { patterns: assist.patterns, ceiling: assist.ceiling }, { key: ai.key },
  );
  return answer?.proposal ?? null;
}

/**
 * What is stored as payload.proposal of a case.raised. Never throws and never waits longer than
 * the timeout: any failure is the keyword proposal.
 */
export async function proposeOnRaise(slug: string, companyId: string, payload: EventPayload, opts: ProposeOptions = {}): Promise<RouteProposal> {
  const ask = opts.ask ?? askBrain;
  const timeoutMs = opts.timeoutMs ?? raiseTimeout();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const slow = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
    const brain = await Promise.race([brainProposal(slug, companyId, payload, ask).catch(() => null), slow]);
    if (brain) return brain;
  } finally {
    clearTimeout(timer);
  }
  return keywordProposal(slug, payload);
}
