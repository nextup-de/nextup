// POST /api/[company]/assist - the raise-page assistant. docs/ASSISTANT.md.
//
// A route handler, not a server action, because the answer streams (server-sent events). Same
// rules as an action: the company comes from the URL segment and must match the signed-in
// viewer; nothing from the body names a company or a person. The pipeline itself - redact, gate
// on classification, tools, check - is features/assist; this file only wires the request to it.
//
// Events:  text  {text, sources}             the checked answer so far (replace, don't append)
//          done  {turnId, text, sources, unsourced, blocked, reason}
//          error {message}
import { z } from "zod";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { GOALS } from "@/features/evaluate";
import { companyBrief, hasKnowledge, rowsFromSeed, type Knowledge, type Profile } from "@/features/knowledge";
import { getViewerFor } from "@/features/auth/session";
import { assist, ASSIST_PROMPT_VERSION, MAX_HISTORY, MAX_QUESTION, type Source } from "@/features/assist";
import { DEFAULT_CEILING } from "@/features/assist/classify";
import { assistGate } from "@/features/assist/gate";
import { stripTags } from "@/features/assist/check";
import { hasDatabase } from "@/lib/db/client";
import { loadKnowledge, loadProfile } from "@/lib/db/knowledge";
import { loadAssistSettings, purgeAssistTurns, recordTurns, searchDocuments, type AssistSettings } from "@/lib/db/assist";
import { clientKey, throttle } from "@/server/throttle";
import { providerConfig, providerFor } from "@/server/assist/provider";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string }> };

const Body = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_QUESTION * 2) })).max(MAX_HISTORY * 2).default([]),
});

const LOCAL: AssistSettings = { enabled: false, ceiling: DEFAULT_CEILING, retentionDays: 90, dpaSignedAt: null, patterns: [], rules: "" };

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });

// Retention runs here, at most hourly per company: no scheduler to forget, and a company that
// never asks anything has nothing to delete.
const PURGE_EVERY_MS = 60 * 60_000;
const lastPurge = ((globalThis as unknown as { __nextupAssistPurge?: Map<string, number> }).__nextupAssistPurge ??= new Map());
function purgeSoon(companyId: string, retentionDays: number) {
  const now = Date.now();
  if (now - (lastPurge.get(companyId) ?? 0) < PURGE_EVERY_MS) return;
  lastPurge.set(companyId, now);
  purgeAssistTurns(companyId, retentionDays).catch((e) => console.error("[assist] purge", e instanceof Error ? e.message : e));
}
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const shown = (s: Source[]) => s.map(({ tag, kind, label, level }) => ({ tag, kind, label, level }));

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  const tenant = await findTenant(company);
  if (!tenant) return json({ error: "Unknown company." }, 404);

  // Server mode (and so an audit trail) only with a database AND a session for this company -
  // the same line the app layout draws. Signed out with auth configured is a 401.
  const viewer = hasDatabase() ? await getViewerFor(tenant.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) return json({ error: "Sign in first." }, 401);
  const audited = viewer !== null;

  const who = viewer?.userId ?? (await clientKey());
  const slow = throttle("assistAsk", tenant.slug + ":" + who) ?? throttle("assistAskAll", tenant.slug);
  if (slow) return json({ error: slow }, 429);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ask a question of a few words." }, 400);
  const { question, sessionId, history } = parsed.data;

  const settings = audited ? await loadAssistSettings(viewer.companyId) : LOCAL;
  const cfg = providerConfig();
  const gate = assistGate({ stage: tenant.stage ?? "demo", hasDatabase: audited, configured: cfg.id, enabled: settings.enabled, dpaSignedAt: settings.dpaSignedAt });
  if (!gate.on) return json({ error: gate.why, off: true }, 403);

  const seed = await seedFor(tenant.slug);
  let knowledge: Knowledge | null = audited ? await loadKnowledge(viewer.companyId) : null;
  if (!knowledge || !hasKnowledge(knowledge)) {
    let n = 0;
    knowledge = rowsFromSeed(seed, GOALS, () => "k" + ++n);
  }
  const profile: Profile | null = audited ? await loadProfile(viewer.companyId) : null;
  const people = [
    ...seed.people.map((p) => ({ name: p.name, role: p.role })),
    ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" })),
  ];
  const redaction = { people, patterns: settings.patterns };
  const provider = providerFor(gate.provider === "bedrock" ? cfg : { ...cfg, id: "mock", model: "mock" });

  const started = Date.now();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        const out = await assist({
          question,
          history,
          ctx: {
            knowledge: knowledge!,
            profile,
            ceiling: settings.ceiling,
            searchDocuments: audited ? (q, k) => searchDocuments(viewer.companyId, settings.ceiling, q, k) : async () => [],
          },
          prompt: { companyName: tenant.name, brief: companyBrief(knowledge!, profile), rules: settings.rules },
          redaction,
          provider,
          onChecked: (c) => send("text", { text: c.text, sources: shown(c.cited) }),
          signal: request.signal,
        });

        let turnId: string | null = null;
        const retentionDays = audited ? settings.retentionDays : 0;
        if (audited) {
          purgeSoon(viewer.companyId, settings.retentionDays);
          turnId = await recordTurns(viewer.companyId, out.blocked
            ? [{ userId: viewer.userId, sessionId, role: "user", text: out.question, redactions: out.hits, blocked: true, promptVersion: ASSIST_PROMPT_VERSION }]
            : [
                { userId: viewer.userId, sessionId, role: "user", text: out.question, redactions: out.hits, promptVersion: ASSIST_PROMPT_VERSION },
                {
                  userId: viewer.userId, sessionId, role: "assistant", text: stripTags(out.answer.text), sources: out.answer.cited,
                  redactions: out.answer.hits, unsourced: out.answer.unsourced, model: out.model, promptVersion: ASSIST_PROMPT_VERSION,
                  latencyMs: Date.now() - started, tokensIn: out.tokensIn, tokensOut: out.tokensOut,
                },
              ]);
        }
        send("done", out.blocked
          ? { turnId, blocked: true, reason: out.reason, text: "", sources: [], unsourced: true, retentionDays }
          : { turnId, blocked: false, text: out.answer.text, sources: shown(out.answer.cited), unsourced: out.answer.unsourced, retentionDays });
      } catch (err) {
        console.error("[assist]", tenant.slug, err instanceof Error ? err.message : err);
        send("error", { message: "The assistant could not answer just now. You can still raise it." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
