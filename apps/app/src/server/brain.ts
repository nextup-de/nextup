// The calls to the brain (services/brain, docs: services/brain/README.md). Inside the company's
// stack only: BRAIN_URL is a service name, never a public address, and the key is the stack's own.
// Unset, unreachable, slow or wrong - every failure is null, and the app answers as it did
// without it: the keyword proposal at publish, the offline coach in the studio.
// Not a "use server" module: server/actions/brain.ts and the idea turn route call it.
import { z } from "zod";
import { isAboveCeiling, redact } from "@/features/assist/redact";
import type { Level } from "@/features/assist/classify";
import type { Turn } from "@/features/assist/draft";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { coachRequest, type CoachAnswer } from "@/features/ideas/brain-coach";
import { brainRequest, fromBrain, type BrainItem, type BrainProposal } from "@/features/routing/brain";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { loadLogForSlug } from "@/lib/db/events";

// On a CPU-only server the model takes tens of seconds; past this the person should not wait.
const DEFAULT_TIMEOUT_MS = 30_000;

const RouteAnswer = z.object({
  route_id: z.string().max(40).nullable(), confidence: z.number().min(0).max(100), reason: z.string().max(1000),
  same_as: z.string().max(40).nullable(), related: z.string().max(40).nullable(),
  model: z.string().max(200), version: z.string().max(80),
});
const CoachReply = z.object({
  open_point: z.string().max(40), earlier_id: z.string().max(40).nullable(),
  note: z.string().max(2000), question: z.string().max(1000), why: z.string().max(1000), recommended: z.string().max(2000),
  model: z.string().max(200), version: z.string().max(80),
});

export function brainConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BRAIN_URL && !!env.BRAIN_API_KEY;
}

// The same rule as every other model call (docs/IDEAS.md, Privacy): only redacted text goes out -
// names become roles, secrets and personal data become masks, the company's own patterns apply -
// and text marked above the company's ceiling does not go out at all.
export type BrainPolicy = { patterns: readonly string[]; ceiling: Level };

// What every call sends along: the company's name, its routing map, and what was raised before -
// newest cases first, then the known problems - with the redaction for that company.
async function companyFor(slug: string, policy: BrainPolicy) {
  const tenant = await findTenant(slug);
  if (!tenant) return null;
  const seed = await seedFor(slug);
  const log = (hasDatabase() ? await loadLogForSlug(slug) : null) ?? emptyLog();
  const cases = [...reduce(seed, log).cases].sort((a, b) => b.raisedDay - a.raisedDay);
  const people = [...seed.people.map((p) => ({ name: p.name, role: p.role })), ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" }))];
  const clean = (text: string) => redact(text, { people, patterns: policy.patterns });
  const known: BrainItem[] = [
    ...cases.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    ...seed.problems.map((p) => ({ id: p.id, title: p.title + " - " + p.sub, status: "known problem" })),
  ].map((k) => ({ ...k, title: clean(k.title).text }));
  // Redacts, or null when anything is marked above the company's ceiling - then nothing is sent.
  const cleanAll = (texts: readonly string[]): string[] | null => {
    const r = texts.map(clean);
    return r.some((x) => isAboveCeiling(x, policy.ceiling)) ? null : r.map((x) => x.text);
  };
  return { tenant, seed, known, cleanAll };
}

async function post<T>(slug: string, path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T | null> {
  const url = process.env.BRAIN_URL, key = process.env.BRAIN_API_KEY;
  if (!url || !key) return null;
  const timeout = AbortSignal.timeout(Number(process.env.BRAIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url.replace(/\/$/, "") + path, {
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
    return answer.data;
  } catch (err) {
    console.error("[brain]", slug, path, err instanceof Error ? err.name : "failed");
    return null;
  }
}

// At publish: the routing row that owns the idea and whether it was raised before.
export async function askBrain(slug: string, idea: { title: string; body: string }, policy: BrainPolicy): Promise<BrainProposal | null> {
  if (!brainConfigured()) return null;
  const co = await companyFor(slug, policy);
  const text = co?.cleanAll([idea.title, idea.body]);
  if (!co || !text) return null;
  const req = brainRequest(co.tenant.name, { title: text[0], body: text[1] }, co.seed.routes, co.seed.depts, co.known);
  const answer = await post(slug, "/v1/route", req, RouteAnswer);
  return answer ? fromBrain(answer, req) : null;
}

// In the studio: one coach turn (the grilling). `brief` is coachBrief() - the scores and gaps the
// app computed; the coach may not change them.
export async function askBrainCoach(
  slug: string, input: { idea: { title: string; body: string }; turns: readonly Turn[]; brief: string },
  policy: BrainPolicy, signal?: AbortSignal,
): Promise<CoachAnswer | null> {
  if (!brainConfigured()) return null;
  const co = await companyFor(slug, policy);
  const text = co?.cleanAll([input.idea.title, input.idea.body, ...input.turns.map((t) => t.text)]);
  if (!co || !text) return null;
  const turns = input.turns.map((t, i) => ({ role: t.role, text: text[i + 2] }));
  const req = coachRequest(co.tenant.name, { title: text[0], body: text[1] }, turns, input.brief, co.known);
  return post(slug, "/v1/coach", req, CoachReply, signal);
}
