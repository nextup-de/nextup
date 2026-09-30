// The call to the brain (services/brain, docs: services/brain/README.md). Inside the company's
// stack only: BRAIN_URL is a service name, never a public address, and the key is the stack's own.
// Unset, unreachable, slow or wrong - every failure is null, and the keyword proposal stands.
// Not a "use server" module: the action in server/actions/brain.ts calls it.
import { z } from "zod";
import { isAboveCeiling, redact } from "@/features/assist/redact";
import type { Level } from "@/features/assist/classify";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { brainRequest, fromBrain, type BrainItem, type BrainProposal } from "@/features/routing/brain";
import { findTenant } from "@/features/tenant";
import { hasDatabase } from "@/lib/db/client";
import { loadLogForSlug } from "@/lib/db/events";

// On a CPU-only server the model takes tens of seconds; past this the person should not wait.
const DEFAULT_TIMEOUT_MS = 30_000;

const Answer = z.object({
  route_id: z.string().max(40).nullable(), confidence: z.number().min(0).max(100), reason: z.string().max(1000),
  same_as: z.string().max(40).nullable(), related: z.string().max(40).nullable(),
  model: z.string().max(200), version: z.string().max(80),
});

export function brainConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BRAIN_URL && !!env.BRAIN_API_KEY;
}

// The same rule as every other model call (docs/IDEAS.md, Privacy): only redacted text goes out -
// names become roles, secrets and personal data become masks, the company's own patterns apply -
// and text marked above the company's ceiling does not go out at all.
export type BrainPolicy = { patterns: readonly string[]; ceiling: Level };

export async function askBrain(slug: string, idea: { title: string; body: string }, policy: BrainPolicy): Promise<BrainProposal | null> {
  const url = process.env.BRAIN_URL, key = process.env.BRAIN_API_KEY;
  if (!url || !key) return null;
  const tenant = await findTenant(slug);
  if (!tenant) return null;
  const seed = await seedFor(slug);
  const log = (hasDatabase() ? await loadLogForSlug(slug) : null) ?? emptyLog();
  // Newest cases first, then the known problems: what "raised before?" can point at.
  const cases = [...reduce(seed, log).cases].sort((a, b) => b.raisedDay - a.raisedDay);
  const known: BrainItem[] = [
    ...cases.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    ...seed.problems.map((p) => ({ id: p.id, title: p.title + " - " + p.sub, status: "known problem" })),
  ];
  const people = [...seed.people.map((p) => ({ name: p.name, role: p.role })), ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" }))];
  const clean = (text: string) => redact(text, { people, patterns: policy.patterns });
  const title = clean(idea.title), body = clean(idea.body);
  if (isAboveCeiling(title, policy.ceiling) || isAboveCeiling(body, policy.ceiling)) return null;
  const req = brainRequest(tenant.name, { title: title.text, body: body.text }, seed.routes, seed.depts,
    known.map((k) => ({ ...k, title: clean(k.title).text })));
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(req),
      cache: "no-store",
      signal: AbortSignal.timeout(Number(process.env.BRAIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[brain]", slug, "status", res.status);
      return null;
    }
    const answer = Answer.safeParse(await res.json());
    if (!answer.success) {
      console.error("[brain]", slug, "unexpected answer");
      return null;
    }
    return fromBrain(answer.data, req);
  } catch (err) {
    console.error("[brain]", slug, err instanceof Error ? err.name : "failed");
    return null;
  }
}
