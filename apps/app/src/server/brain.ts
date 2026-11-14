// The calls to the brain (services/brain, docs: services/brain/README.md). Inside the company's
// stack only: BRAIN_URL is a service name, never a public address, and the key is the stack's own.
// Unset, unreachable, slow or wrong - every failure is null, and the app answers as it did
// without it: the keyword proposal at publish, the offline coach in the studio.
// Not a "use server" module: server/actions/brain.ts and the idea turn route call it.
import { z } from "zod";
import type { AiGate } from "@/features/ai/gate";
import { DEFAULT_ANTHROPIC_MODEL, type AiSettings } from "@/features/ai/settings";
import { isAboveCeiling, redact } from "@/features/assist/redact";
import { maskAddressed } from "@/features/ai/names";
import type { Level } from "@/features/assist/classify";
import type { Turn } from "@/features/assist/draft";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import type { Locale } from "@/i18n";
import { coachRequest, type CoachAnswer } from "@/features/ideas/brain-coach";
import { BrainReading, maskedReading, readRequest, readingFrom, type Reading } from "@/features/ideas/reading";
import { checkinRequest, planRequest, roundSaid, type CheckinProposal, type PlanProposal } from "@/features/projects/brain";
import { brainRequest, fromBrain, type BrainItem, type BrainProposal } from "@/features/routing/brain";
import { findTenant } from "@/features/tenant";
import { getDb, hasDatabase } from "@/lib/db/client";
import { dbLedger, type Estimate, type Ledger, type Unknown } from "@/server/agent/ledger";
import { brainTarget } from "@/server/brain-health";
import { loadLogForSlug } from "@/lib/db/events";
import { casesFor, type Audience } from "@/server/ideas";

// On a CPU-only server the model takes tens of seconds; past this the person should not wait.
const DEFAULT_TIMEOUT_MS = 30_000;

// An old brain image sends no counts: they read as 0.
const TOKENS = z.number().int().min(0).default(0);

const RouteAnswer = z.object({
  route_id: z.string().max(40).nullable(), confidence: z.number().min(0).max(100), reason: z.string().max(1000),
  same_as: z.string().max(40).nullable(), related: z.string().max(40).nullable(),
  model: z.string().max(200), version: z.string().max(80), tokens_in: TOKENS, tokens_out: TOKENS,
});
const PlanReply = z.object({
  steps: z.array(z.string().max(200)).max(5),
  metric: z.object({ name: z.string().max(100), unit: z.string().max(30), better: z.enum(["up", "down"]) }).nullable(),
  model: z.string().max(200), version: z.string().max(80), tokens_in: TOKENS, tokens_out: TOKENS,
});
const CheckinReply = z.object({
  next: z.enum(["round", "decide"]), open: z.array(z.string().max(200)).max(6), note: z.string().max(600),
  model: z.string().max(200), version: z.string().max(80), tokens_in: TOKENS, tokens_out: TOKENS,
});
const ReadReply = BrainReading.extend({ tokens_in: TOKENS, tokens_out: TOKENS });
const CoachReply = z.object({
  open_point: z.string().max(40), earlier_id: z.string().max(40).nullable(),
  answer: z.string().max(2000).default(""), note: z.string().max(2000), question: z.string().max(1000), why: z.string().max(1000), recommended: z.string().max(2000),
  model: z.string().max(200), version: z.string().max(80), tokens_in: TOKENS, tokens_out: TOKENS,
});

export function brainConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return brainTarget(env) !== null;
}

// The same rule as every other model call (docs/IDEAS.md, Privacy): only redacted text goes out -
// names become roles, secrets and personal data become masks, the company's own patterns apply -
// and text marked above the company's ceiling does not go out at all.
export type BrainPolicy = { patterns: readonly string[]; ceiling: Level };

// Every failure is null, this one too: without the company there is no request to make.
export async function companyFor(slug: string, policy: BrainPolicy, audience?: Audience) {
  try {
    return await loadCompany(slug, policy, audience);
  } catch (err) {
    console.error("[brain]", slug, "company not loaded", err instanceof Error ? err.name : "failed");
    return null;
  }
}

// What every call sends along: the company's name, its routing map, its goals and what was raised
// before - newest cases first, then the known problems - with the redaction for that company. A goal
// or an earlier item marked above the ceiling stays home. With an audience (the studio, where the
// answer goes straight back to the author) only the cases they may open go out; without one (routing
// at publish, a project's plan and check-in) the whole company's.
async function loadCompany(slug: string, policy: BrainPolicy, audience?: Audience) {
  const tenant = await findTenant(slug);
  if (!tenant) return null;
  const seed = await seedFor(slug);
  const log = (hasDatabase() ? await loadLogForSlug(slug) : null) ?? emptyLog();
  const state = reduce(seed, log);
  const cases = [...(audience === undefined ? state.cases : await casesFor(state, audience))].sort((a, b) => b.raisedDay - a.raisedDay);
  const people = [...seed.people.map((p) => ({ name: p.name, role: p.role })), ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" }))];
  // Directory names first ("Herr Thomas Becker" -> "Herr [role]"), then any surname after a form of address.
  const clean = (text: string) => {
    const r = redact(text, { people, patterns: policy.patterns });
    return { ...r, text: maskAddressed(r.text) };
  };
  const allowed = (text: string): string | null => {
    const r = clean(text);
    return isAboveCeiling(r, policy.ceiling) ? null : r.text;
  };
  const known: BrainItem[] = [
    ...cases.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    ...seed.problems.map((p) => ({ id: p.id, title: p.title + " - " + p.sub, status: "known problem" })),
  ].flatMap((k) => {
    const title = allowed(k.title);
    return title === null ? [] : [{ ...k, title }];
  });
  const goals = seed.goals.flatMap((g) => {
    const goal = allowed(g.goal);
    return goal === null ? [] : [{ ...g, goal }];
  });
  // Redacts, or null when anything is marked above the company's ceiling - then nothing is sent.
  const cleanAll = (texts: readonly string[]): string[] | null => {
    const r = texts.map(clean);
    return r.some((x) => isAboveCeiling(x, policy.ceiling)) ? null : r.map((x) => x.text);
  };
  return { tenant, seed, known, goals, cleanAll, clean, state, log };
}

// What a call needs besides the gate: the company's API key (azure-openai, openai-compatible, anthropic) and,
// in tests, a fetch to inject.
export type BrainOptions = { key?: string | null; fetch?: typeof fetch };
export type BrainLlm =
  | { provider: "bedrock"; region: string; model: string }
  | { provider: "anthropic"; model: string; api_key: string }
  | { provider: "azure-openai"; base_url: string; model: string; api_key: string }
  | { base_url: string; model: string; api_key: string };

/**
 * The company's own provider for one request (docs/plans AIP D8, AIB D8). Bedrock with a brainModel,
 * azure-openai, openai-compatible and anthropic (Claude through Anthropic's API) carry one; everything else uses the brain's stack model. `local` (the model
 * on this stack, Q8.4) never carries one, whatever else is saved: that is the point of the choice.
 * Null when the settings or the key are incomplete - then nothing is sent.
 */
export function llmFor(settings: AiSettings, key: string | null | undefined): BrainLlm | null | "none" {
  if (settings.choice === "local") return "none";
  if (settings.choice === "bedrock") {
    return settings.brainModel ? { provider: "bedrock", region: settings.region, model: settings.brainModel } : "none";
  }
  if (settings.choice !== "azure-openai" && settings.choice !== "openai-compatible" && settings.choice !== "anthropic") return "none";
  if (!key) return null;
  if (settings.choice === "anthropic") return { provider: "anthropic", model: settings.brainModel || settings.model || DEFAULT_ANTHROPIC_MODEL, api_key: key };
  if (settings.choice === "azure-openai") {
    const host = settings.endpoint?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const model = settings.brainModel || settings.deployment;
    if (!host || !settings.deployment || !model) return null;
    return { provider: "azure-openai", base_url: `https://${host}/openai/v1`, model, api_key: key };
  }
  if (!settings.endpoint || !settings.model) return null;
  return { base_url: settings.endpoint.replace(/\/+$/, ""), model: settings.brainModel || settings.model, api_key: key };
}

// Closed gate, or an incomplete endpoint: null, no request. Otherwise the body gets `llm` when the company has its own.
export function withLlm(gate: AiGate, opts: BrainOptions, body: object): object | null {
  if (!gate.on) return null;
  const llm = llmFor(gate.settings, opts.key);
  if (llm === null) return null;
  return llm === "none" ? body : { ...body, llm };
}

export type Counted = { model: string; tokens_in: number; tokens_out: number };

/** What a call needs of the company: the loaded name, routes, redaction and reduced state (the agent reads `clean` and `cleanAll`). */
export type BrainCompany = NonNullable<Awaited<ReturnType<typeof companyFor>>>;

/** The brain's own model, when the request names none (a `local` choice, a mock or a demo company): what the estimate is priced as. The agent's calls use the same word. */
const STACK_MODEL = "brain-stack";

/** The most a purpose's answer can run to, in tokens, for the estimate that is reserved before the call (plan REM): generous, since the cap is a ceiling on what is reserved. */
const MAX_OUT_TOKENS: Record<string, number> = { routing: 600, read: 1500, coach: 2500, plan: 1200, checkin: 1200 };
const DEFAULT_MAX_OUT_TOKENS = 2000;

/** The usage a failed or invalid answer may still carry: the counts the brain reported before it failed. */
function countsOf(raw: unknown): { model: string; tokensIn: number; tokensOut: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const tokensIn = n(r.tokens_in);
  const tokensOut = n(r.tokens_out);
  return tokensIn === null || tokensOut === null ? null : { model: typeof r.model === "string" ? r.model.slice(0, 200) : "", tokensIn, tokensOut };
}

/** What a call may cost at most: the model the request names (the company's own) or the brain's, the request's size in tokens and the purpose's longest answer. */
function estimateOf(purpose: string, body: unknown): Estimate {
  const llm = typeof body === "object" && body !== null ? (body as { llm?: { model?: unknown } }).llm : undefined;
  return {
    model: typeof llm?.model === "string" && llm.model !== "" ? llm.model : STACK_MODEL,
    tokensIn: Math.ceil(JSON.stringify(body).length / 3),
    tokensOut: MAX_OUT_TOKENS[purpose] ?? DEFAULT_MAX_OUT_TOKENS,
  };
}

/**
 * `timeoutMs`: how long this call waits; left out, BRAIN_TIMEOUT_MS or the default (AGT's longer calls pass their own).
 *
 * No call without a reserved budget (plan REM, AGT D21): on a database the estimate is reserved first under the company's lock, and a call that would use the
 * month's cap up is refused (null, nothing is sent). Afterwards the reservation is settled with what the brain reported, released when the brain refused
 * before any model ran (a 4xx without counts), or kept as the month's cost when the usage is unknown (a timeout, a 5xx, an unreadable answer). Without a
 * database nothing is counted anywhere, so nothing is reserved. `ledger`: for tests.
 */
export async function post<T extends Counted>(slug: string, purpose: string, path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal, doFetch: typeof fetch = fetch, timeoutMs?: number, ledger: Ledger = dbLedger): Promise<T | null> {
  const url = process.env.BRAIN_URL, key = process.env.BRAIN_API_KEY;
  if (!url || !key) return null;
  let reservation: Awaited<ReturnType<Ledger["reserve"]>> = null;
  if (hasDatabase()) {
    const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } }).catch(() => null);
    if (!company) return null; // without the company there is nothing to count the call against
    reservation = await ledger.reserve(company.id, purpose, estimateOf(purpose, body));
    if (!reservation) {
      console.error("[brain]", slug, path, "no budget left for this call");
      return null;
    }
  }
  const started = Date.now();
  const spent = () => Date.now() - started;
  const keep = (why: Unknown) => reservation?.keep(spent(), why).catch(() => undefined);
  const timeout = AbortSignal.timeout(timeoutMs ?? (Number(process.env.BRAIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  let res: Response;
  try {
    res = await doFetch(url.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("[brain]", slug, path, err instanceof Error ? err.name : "failed");
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
    console.error("[brain]", slug, path, "status", res.status);
    const counts = countsOf(raw);
    if (counts) await reservation?.settle({ ...counts, latencyMs: spent() }).catch(() => undefined);
    else if (res.status >= 400 && res.status < 500) await reservation?.release().catch(() => undefined);
    else await keep("server-error");
    return null;
  }
  const answer = schema.safeParse(raw);
  if (!answer.success) {
    console.error("[brain]", slug, path, "unexpected answer");
    const counts = countsOf(raw);
    if (counts) await reservation?.settle({ ...counts, latencyMs: spent() }).catch(() => undefined);
    else await keep("unreadable");
    return null;
  }
  await reservation?.settle({ model: answer.data.model, tokensIn: answer.data.tokens_in, tokensOut: answer.data.tokens_out, latencyMs: spent() }).catch((err: unknown) => {
    console.error("[brain]", slug, path, "usage not settled", err instanceof Error ? err.name : "failed");
  });
  return answer.data;
}

// At publish: the routing row that owns the idea and whether it was raised before.
export async function askBrain(gate: AiGate, slug: string, idea: { title: string; body: string }, policy: BrainPolicy, opts: BrainOptions = {}): Promise<BrainProposal | null> {
  if (!gate.on || !brainConfigured()) return null;
  const co = await companyFor(slug, policy);
  const text = co?.cleanAll([idea.title, idea.body]);
  if (!co || !text) return null;
  const req = brainRequest(co.tenant.name, { title: text[0], body: text[1] }, co.seed.routes, co.seed.depts, co.known);
  const body = withLlm(gate, opts, req);
  if (!body) return null;
  const answer = await post(slug, "routing", "/v1/route", body, RouteAnswer, undefined, opts.fetch);
  return answer ? fromBrain(answer, req) : null;
}

// In the studio, on every message: the model's reading of the idea - what the raise page shows.
export async function askBrainRead(
  gate: AiGate, slug: string,
  input: { idea: { title: string; body: string }; affected: number; attachments: number; skip: readonly string[]; previous: Reading | null; audience: Audience; locale: Locale },
  policy: BrainPolicy, signal?: AbortSignal, opts: BrainOptions = {},
): Promise<Reading | null> {
  if (!gate.on || !brainConfigured()) return null;
  const co = await companyFor(slug, policy, input.audience);
  const text = co?.cleanAll([input.idea.title, input.idea.body, ...input.skip]);
  if (!co || !text) return null;
  const req = readRequest(co.tenant.name, { title: text[0], body: text[1] }, co.seed.routes, co.seed.depts, co.known, {
    goals: co.goals, affected: input.affected, attachments: input.attachments, spendLimitEur: co.seed.spend?.limitEur ?? null,
    skip: text.slice(2), previous: input.previous ? maskedReading(input.previous, co.cleanAll) : null, // above the ceiling: read without it
    locale: input.locale,
  });
  const body = withLlm(gate, opts, req);
  if (!body) return null;
  const answer = await post(slug, "read", "/v1/read", body, ReadReply, signal, opts.fetch);
  if (!answer) return null;
  const { tokens_in: _in, tokens_out: _out, ...reading } = answer;
  return readingFrom(reading, req);
}

// In the studio: one coach turn, working from the reading the page shows.
export async function askBrainCoach(
  gate: AiGate, slug: string, input: { idea: { title: string; body: string }; turns: readonly Turn[]; reading: Reading; audience: Audience; locale: Locale },
  policy: BrainPolicy, signal?: AbortSignal, opts: BrainOptions = {},
): Promise<CoachAnswer | null> {
  if (!gate.on || !brainConfigured()) return null;
  const co = await companyFor(slug, policy, input.audience);
  const text = co?.cleanAll([input.idea.title, input.idea.body, ...input.turns.map((t) => t.text)]);
  const reading = co ? maskedReading(input.reading, co.cleanAll) : null;
  if (!co || !text || !reading) return null;
  const turns = input.turns.map((t, i) => ({ role: t.role, text: text[i + 2] }));
  const req = coachRequest(co.tenant.name, { title: text[0], body: text[1] }, turns, reading, co.known, co.seed.routes, co.seed.depts, co.goals, input.locale);
  const body = withLlm(gate, opts, req);
  if (!body) return null;
  return post(slug, "coach", "/v1/coach", body, CoachReply, signal, opts.fetch);
}

// After a yes: the first steps and the metric for the project (docs/plans/2026-10-15_idea-to-project.md).
export async function askBrainPlan(gate: AiGate, slug: string, caseId: string, policy: BrainPolicy, opts: BrainOptions = {}): Promise<PlanProposal | null> {
  if (!gate.on || !brainConfigured()) return null;
  const co = await companyFor(slug, policy);
  const c = co?.state.cases.find((x) => x.id === caseId);
  const text = c ? co?.cleanAll([c.title, c.body]) : null;
  if (!co || !text) return null;
  const body = withLlm(gate, opts, planRequest(co.tenant.name, { title: text[0], body: text[1] }, co.goals));
  if (!body) return null;
  const answer = await post(slug, "plan", "/v1/plan", body, PlanReply, undefined, opts.fetch);
  return answer ? { steps: answer.steps, metric: answer.metric, version: answer.version } : null;
}

// In a discussion: the draft of the check-in that ends the round under way. `weak`: the dials the
// app's analysis still finds weak, by name.
export async function askBrainCheckin(gate: AiGate, slug: string, caseId: string, weak: readonly string[], policy: BrainPolicy, opts: BrainOptions = {}): Promise<CheckinProposal | null> {
  if (!gate.on || !brainConfigured()) return null;
  const co = await companyFor(slug, policy);
  const c = co?.state.cases.find((x) => x.id === caseId);
  if (!co || !c?.discussion) return null;
  const roleOf = (name: string) => co.seed.people.find((p) => p.name === name)?.role ?? null;
  const said = roundSaid(c, co.log, roleOf);
  const text = co.cleanAll([c.title, c.body, c.discussion.missing, ...said.map((s) => s.text)]);
  if (!text) return null;
  const clean = { ...c, title: text[0], body: text[1], discussion: { ...c.discussion, missing: text[2] } };
  const req = checkinRequest(co.tenant.name, clean, said.map((s, i) => ({ who: s.who, text: text[i + 3] })), weak);
  const body = withLlm(gate, opts, req);
  if (!body) return null;
  const answer = await post(slug, "checkin", "/v1/checkin", body, CheckinReply, undefined, opts.fetch);
  return answer ? { next: answer.next, open: answer.open, note: answer.note, version: answer.version } : null;
}
