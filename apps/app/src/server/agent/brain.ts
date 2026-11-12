// The project agent's calls to the brain (plan AGT, D3, D20, D21): the daily run (/v1/agent), the planning run (/v1/plan with templates) and the
// reason hint (/v1/hint). Same rules as every brain call (server/brain.ts): only redacted text and roles go out, text above the company's ceiling
// means no call, the gate decides, and every failure is null - the callers' fallbacks answer. Three things are the agent's own:
//   - the app waits as long as the call's limit says (AGENT_TIMEOUT_MS, longer than the brain's own);
//   - usage is reserved before the call and settled after it (./ledger.ts): the answered call is one AiCall with its purpose, a failed or invalid
//     answer that carries counts is settled with them, and a timeout or disconnect keeps the estimate and says so in the log;
//   - the parsing is the contract's (features/agent/contract.ts).
// Never logs a text. `opts.fetch` injects the recorded brain in tests; `opts.company` and `opts.ledger` replace the company loader and the ledger.
// Not a "use server" module.
import type { z } from "zod";
import type { AiGate } from "@/features/ai/gate";
import {
  AgentReply, HintReply, PlanV2Reply, type AgentRequest, type HintRequest, type PlanV2Request,
} from "@/features/agent/contract";
import { AGENT_TIMEOUT_MS, HINT_TIMEOUT_MS, PLAN_TIMEOUT_MS } from "@/features/agent/limits";
import { getDb } from "@/lib/db/client";
import { brainConfigured, companyFor, llmFor, withLlm, type BrainOptions, type BrainPolicy, type Counted } from "@/server/brain";
import { dbLedger, type Estimate, type Ledger, type Unknown } from "./ledger";

/** What the agent needs of the company: its name, the redaction, and for a planning run the case and the goals. */
export type AgentCompany = {
  name: string;
  /** The texts redacted in the same order, or null when any is above the company's ceiling. */
  cleanAll: (texts: readonly string[]) => string[] | null;
  caseOf?: (caseId: string) => { title: string; body: string } | null;
  goals?: readonly { goal: string }[];
};
export type AgentBrainOptions = BrainOptions & {
  company?: AgentCompany;
  ledger?: Ledger;
  /** The company's id, when the caller has it (the ledger writes by id); else looked up by slug. */
  companyId?: string;
};

export const AGENT_PURPOSE = "agent";
export const PLAN_PURPOSE = "agent-plan";
export const HINT_PURPOSE = "hint";
/** The most a reply may use, in tokens: the estimate a call reserves. A call is reserved at its request's size plus this. */
export const MAX_OUT_TOKENS = { [AGENT_PURPOSE]: 2000, [PLAN_PURPOSE]: 3000, [HINT_PURPOSE]: 300 } as const;
/** A model without a name of its own (the brain's stack model) is booked under this name until the answer says which one it was. */
export const STACK_MODEL = "brain-stack";

const clip = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max));

export async function companyOf(slug: string, policy: BrainPolicy): Promise<AgentCompany | null> {
  const co = await companyFor(slug, policy);
  if (!co) return null;
  return {
    name: co.tenant.name, cleanAll: co.cleanAll, goals: co.goals,
    caseOf: (id) => { const c = co.state.cases.find((x) => x.id === id); return c ? { title: c.title, body: c.body } : null; },
  };
}

type Visit = (text: string, max: number) => string;

/** Every free text of the request goes through `f`, in a fixed order; a role or a number or an id does not. */
function mapAgentTexts(req: AgentRequest, f: Visit): AgentRequest {
  const p = req.project;
  return {
    ...req,
    company: f(req.company, 120),
    project: {
      ...p,
      title: f(p.title, 300),
      goal: p.goal === null ? null : f(p.goal, 400),
      done_when: p.done_when === null ? null : f(p.done_when, 400),
      steps: p.steps.map((s) => ({
        ...s,
        title: f(s.title, 200),
        role: s.role === null ? null : f(s.role, 80),
        owner: s.owner === "no owner" ? s.owner : f(s.owner, 80),
        blocked_why: s.blocked_why === null ? null : f(s.blocked_why, 400),
      })),
    },
  };
}

/** The request with its texts redacted, or null when any text is marked above the company's ceiling. */
export function redactAgentRequest(req: AgentRequest, company: Pick<AgentCompany, "cleanAll">): AgentRequest | null {
  const texts: string[] = [];
  mapAgentTexts(req, (s) => { texts.push(s); return s; });
  const clean = company.cleanAll(texts);
  if (!clean) return null;
  let i = 0;
  return mapAgentTexts(req, (_s, max) => clip(clean[i++] ?? "", max));
}

/** What a failed or invalid answer may still tell: the usage the provider reported. */
function countsOf(raw: unknown): { model: string; tokensIn: number; tokensOut: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const tokensIn = n(r.tokens_in);
  const tokensOut = n(r.tokens_out);
  if (tokensIn === null || tokensOut === null) return null;
  return { model: typeof r.model === "string" ? r.model.slice(0, 200) : "", tokensIn, tokensOut };
}

async function companyIdOf(slug: string, opts: AgentBrainOptions): Promise<string | null> {
  if (opts.companyId) return opts.companyId;
  return (await getDb().company.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
}

type CallSpec<T extends Counted> = {
  gate: AiGate; slug: string; purpose: keyof typeof MAX_OUT_TOKENS; path: string; body: object; schema: z.ZodType<T>; timeoutMs: number; opts: AgentBrainOptions;
};

/** One reserved, counted call. Null for anything that is not a usable answer. */
async function call<T extends Counted>(a: CallSpec<T>): Promise<T | null> {
  const url = process.env.BRAIN_URL;
  const apiKey = process.env.BRAIN_API_KEY;
  if (!url || !apiKey) return null;
  const companyId = await companyIdOf(a.slug, a.opts);
  if (!companyId) return null;
  const llm = a.gate.on ? llmFor(a.gate.settings, a.opts.key) : null;
  const estimate: Estimate = {
    model: llm !== null && llm !== "none" && "model" in llm ? llm.model : STACK_MODEL,
    tokensIn: Math.ceil(JSON.stringify(a.body).length / 3),
    tokensOut: MAX_OUT_TOKENS[a.purpose],
  };
  const reservation = await (a.opts.ledger ?? dbLedger).reserve(companyId, a.purpose, estimate);
  if (!reservation) {
    console.error("[agent]", a.slug, a.path, "no budget left for this call");
    return null;
  }
  const started = Date.now();
  const spent = () => Date.now() - started;
  const keep = (why: Unknown) => reservation.keep(spent(), why).catch(() => undefined);
  let res: Response;
  try {
    res = await (a.opts.fetch ?? fetch)(url.replace(/\/$/, "") + a.path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(a.body),
      cache: "no-store",
      signal: AbortSignal.timeout(a.timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("[agent]", a.slug, a.path, timedOut ? "timeout" : "no answer");
    await keep(timedOut ? "timeout" : "disconnect");
    return null;
  }
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }
  if (!res.ok) {
    console.error("[agent]", a.slug, a.path, "status", res.status);
    // A refusal before any model ran (a request the brain does not take) bills nothing; a failure on its side may have.
    const counts = countsOf(raw);
    if (counts) await reservation.settle({ ...counts, latencyMs: spent() }).catch(() => undefined);
    else if (res.status >= 400 && res.status < 500) await reservation.release().catch(() => undefined);
    else await keep("server-error");
    return null;
  }
  const answer = a.schema.safeParse(raw);
  if (!answer.success) {
    console.error("[agent]", a.slug, a.path, "unexpected answer");
    const counts = countsOf(raw);
    if (counts) await reservation.settle({ ...counts, latencyMs: spent() }).catch(() => undefined);
    else await keep("unreadable");
    return null;
  }
  await reservation.settle({ model: answer.data.model, tokensIn: answer.data.tokens_in, tokensOut: answer.data.tokens_out, latencyMs: spent() }).catch((err: unknown) => {
    console.error("[agent]", a.slug, a.path, "usage not settled", err instanceof Error ? err.name : "failed");
  });
  return answer.data;
}

/** The daily run: the brain's suggestions for one project. The request's texts are redacted here; the caller sends the reduced project as it is. */
export async function askBrainAgent(gate: AiGate, slug: string, request: AgentRequest, policy: BrainPolicy, opts: AgentBrainOptions = {}): Promise<AgentReply | null> {
  if (!gate.on || !brainConfigured()) return null;
  const company = opts.company ?? (await companyOf(slug, policy));
  if (!company) return null;
  const clean = redactAgentRequest({ ...request, company: company.name }, company);
  const body = clean && withLlm(gate, opts, clean);
  if (!body) return null;
  return call({ gate, slug, purpose: AGENT_PURPOSE, path: "/v1/agent", body, schema: AgentReply, timeoutMs: AGENT_TIMEOUT_MS, opts });
}

/** The planning run on an accepted idea: the plan object (v2). `templates`: what the library offers, as the brain's request has it. */
export async function askBrainPlanV2(
  gate: AiGate, slug: string, caseId: string, templates: PlanV2Request["templates"], policy: BrainPolicy, opts: AgentBrainOptions = {},
): Promise<PlanV2Reply | null> {
  if (!gate.on || !brainConfigured()) return null;
  const company = opts.company ?? (await companyOf(slug, policy));
  const idea = company?.caseOf?.(caseId) ?? null;
  if (!company || !idea) return null;
  const goals = company.goals ?? [];
  const clean = company.cleanAll([company.name, idea.title, idea.body, ...goals.map((g) => g.goal)]);
  if (!clean) return null;
  const request: PlanV2Request = {
    company: clip(clean[0], 120) || "-",
    idea: { title: clip(clean[1].trim(), 300), body: clip(clean[2].trim(), 5000) },
    goals: goals.slice(0, 20).map((_g, i) => ({ name: clip(clean[3 + i], 200), kpi: "" })),
    templates,
  };
  const body = withLlm(gate, opts, request);
  if (!body) return null;
  return call({ gate, slug, purpose: PLAN_PURPOSE, path: "/v1/plan", body, schema: PlanV2Reply, timeoutMs: PLAN_TIMEOUT_MS, opts });
}

/** The reason hint: is the reason clear, and if not, one thing to add. The category and the reason are the person's words: redacted like the rest. */
export async function askBrainHint(
  gate: AiGate, slug: string, input: Omit<HintRequest, "company" | "llm">, policy: BrainPolicy, opts: AgentBrainOptions = {},
): Promise<HintReply | null> {
  if (!gate.on || !brainConfigured()) return null;
  const company = opts.company ?? (await companyOf(slug, policy));
  const clean = company?.cleanAll([company.name, input.idea, input.category, input.reason]);
  if (!company || !clean) return null;
  const request: HintRequest = {
    company: clip(clean[0], 120) || "-", idea: clip(clean[1], 5000), category: clip(clean[2], 80), reason: clip(clean[3], 2000), locale: input.locale,
  };
  const body = withLlm(gate, opts, request);
  if (!body) return null;
  return call({ gate, slug, purpose: HINT_PURPOSE, path: "/v1/hint", body, schema: HintReply, timeoutMs: HINT_TIMEOUT_MS, opts });
}
