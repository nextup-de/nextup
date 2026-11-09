// The calls to the brain (services/brain, docs: services/brain/README.md). Inside the company's
// stack only: BRAIN_URL is a service name, never a public address, and the key is the stack's own.
// Unset, unreachable, slow or wrong - every failure is null, and the app answers as it did
// without it: the keyword proposal at publish, the offline coach in the studio.
// Not a "use server" module: server/actions/brain.ts and the idea turn route call it.
import { z } from "zod";
import type { AiGate } from "@/features/ai/gate";
import type { AiSettings } from "@/features/ai/settings";
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
import { recordAiCall } from "@/lib/db/ai-usage";
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
  return !!env.BRAIN_URL && !!env.BRAIN_API_KEY;
}

// The same rule as every other model call (docs/IDEAS.md, Privacy): only redacted text goes out -
// names become roles, secrets and personal data become masks, the company's own patterns apply -
// and text marked above the company's ceiling does not go out at all.
export type BrainPolicy = { patterns: readonly string[]; ceiling: Level };

// Every failure is null, this one too: without the company there is no request to make.
async function companyFor(slug: string, policy: BrainPolicy, audience?: Audience) {
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

// What a call needs besides the gate: the company's API key (azure-openai, openai-compatible) and,
// in tests, a fetch to inject.
export type BrainOptions = { key?: string | null; fetch?: typeof fetch };
export type BrainLlm =
  | { provider: "bedrock"; region: string; model: string }
  | { provider: "azure-openai"; base_url: string; model: string; api_key: string }
  | { base_url: string; model: string; api_key: string };

/**
 * The company's own provider for one request (docs/plans AIP D8, AIB D8). Bedrock with a brainModel,
 * azure-openai and openai-compatible carry one; everything else uses the brain's stack model.
 * Null when the settings or the key are incomplete - then nothing is sent.
 */
export function llmFor(settings: AiSettings, key: string | null | undefined): BrainLlm | null | "none" {
  if (settings.choice === "bedrock") {
    return settings.brainModel ? { provider: "bedrock", region: settings.region, model: settings.brainModel } : "none";
  }
  if (settings.choice !== "azure-openai" && settings.choice !== "openai-compatible") return "none";
  if (!key) return null;
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
function withLlm(gate: AiGate, opts: BrainOptions, body: object): object | null {
  if (!gate.on) return null;
  const llm = llmFor(gate.settings, opts.key);
  if (llm === null) return null;
  return llm === "none" ? body : { ...body, llm };
}

type Counted = { model: string; tokens_in: number; tokens_out: number };

// What a successful call used goes to AiCall. No database or no company: nothing is recorded; a
// failure is logged and changes nothing for the caller.
function record(slug: string, purpose: string, answer: Counted, latencyMs: number): void {
  if (!hasDatabase()) return;
  void getDb().company.findUnique({ where: { slug }, select: { id: true } })
    .then((c) => { if (c) recordAiCall(c.id, { purpose, model: answer.model, tokensIn: answer.tokens_in, tokensOut: answer.tokens_out, latencyMs }); })
    .catch((err: unknown) => console.error("[brain]", slug, "usage not recorded", err instanceof Error ? err.name : "failed"));
}

async function post<T extends Counted>(slug: string, purpose: string, path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal, doFetch: typeof fetch = fetch): Promise<T | null> {
  const url = process.env.BRAIN_URL, key = process.env.BRAIN_API_KEY;
  if (!url || !key) return null;
  const started = Date.now();
  const timeout = AbortSignal.timeout(Number(process.env.BRAIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const res = await doFetch(url.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (!res.ok) {
      console.error("[brain]", slug, path, "status", res.status);
      return null;
    }
    const answer = schema.safeParse(await res.json());
    if (!answer.success) {
      console.error("[brain]", slug, path, "unexpected answer");
      return null;
    }
    record(slug, purpose, answer.data, Date.now() - started);
    return answer.data;
  } catch (err) {
    console.error("[brain]", slug, path, err instanceof Error ? err.name : "failed");
    return null;
  }
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
