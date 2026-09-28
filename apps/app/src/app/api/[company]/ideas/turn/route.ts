// POST /api/[company]/ideas/turn - one message in the idea studio (docs/IDEAS.md).
//
// The message is added to the idea, the idea is benchmarked on the server (features/ideas), and
// the coach answers with one question aimed at the weakest bar. The numbers are always computed
// here, never by a model. Same rules as the assistant route next door: the company comes from the
// URL and must match the viewer; nothing from the body names a company or a person.
//
//   server mode   a session and a database: `draftId` names the viewer's own draft; both turns
//                 and the score are stored. The model (Bedrock) coaches when the assistant gate
//                 allows it; otherwise the offline coach does.
//   local demo    no database: the browser keeps the draft and sends its turns along; nothing
//                 is stored here and only the offline coach answers.
//
// Events:  scores {overall, parts, sameAs, threshold, delta}   the benchmark after this message
//          text   {text}                                        the coach so far (replace)
//          done   {text, overall}
//          error  {message}
import { z } from "zod";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { GOALS } from "@/features/evaluate";
import { getViewerFor } from "@/features/auth/session";
import { assist } from "@/features/assist";
import { assistGate } from "@/features/assist/gate";
import { stripTags } from "@/features/assist/check";
import { companyBrief, hasKnowledge, rowsFromSeed, type Knowledge } from "@/features/knowledge";
import { DEFAULT_PUBLISH_THRESHOLD, deltas } from "@/features/ideas/benchmarks";
import { coachBrief, coachMock, ideaFromTurns, IDEA_PROMPT_VERSION } from "@/features/ideas/coach";
import { MAX_TURN, MAX_TURNS, scoreDraft } from "@/features/ideas/drafts";
import { hasDatabase } from "@/lib/db/client";
import { loadAssistSettings, searchDocuments } from "@/lib/db/assist";
import { addTurns, getDraft, loadPublishThreshold } from "@/lib/db/ideas";
import { loadKnowledge, loadProfile } from "@/lib/db/knowledge";
import { serverIdeaContext } from "@/server/ideas";
import { clientKey, throttle } from "@/server/throttle";
import { providerConfig, providerFor } from "@/server/assist/provider";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string }> };
type Turn = { role: "user" | "assistant"; text: string };

const Body = z.object({
  text: z.string().trim().min(3).max(MAX_TURN),
  draftId: z.string().min(1).max(64).optional(),
  // Local demo only - in server mode the stored draft is the truth and these are ignored.
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_TURN * 2) })).max(MAX_TURNS).default([]),
  affected: z.array(z.string().min(1).max(120)).max(50).default([]),
  attachments: z.number().int().min(0).max(4).default(0),
});

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function POST(request: Request, { params }: Ctx) {
  const { company } = await params;
  const tenant = await findTenant(company);
  if (!tenant) return json({ error: "Unknown company." }, 404);

  const viewer = hasDatabase() ? await getViewerFor(tenant.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) return json({ error: "Sign in first." }, 401);

  const who = viewer?.userId ?? (await clientKey());
  const slow = throttle("ideaTurn", tenant.slug + ":" + who) ?? throttle("ideaTurnAll", tenant.slug);
  if (slow) return json({ error: slow }, 429);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Write a few words about the idea." }, 400);
  const body = parsed.data;

  // The idea as it stands before this message, from the database in server mode.
  let before: Turn[], affected: string[], attachments: number, threshold: number;
  if (viewer) {
    if (!body.draftId) return json({ error: "No draft." }, 400);
    const d = await getDraft(viewer.companyId, viewer.userId, body.draftId);
    if (!d || d.status !== "draft") return json({ error: "This draft is no longer open." }, 404);
    if (d.turns.length + 2 > MAX_TURNS) return json({ error: "This draft is long enough - publish it or start a new one." }, 400);
    before = d.turns.map(({ role, text }) => ({ role, text }));
    affected = d.affected;
    attachments = d.attachments;
    threshold = await loadPublishThreshold(viewer.companyId);
  } else {
    before = body.history;
    affected = body.affected;
    attachments = body.attachments;
    threshold = DEFAULT_PUBLISH_THRESHOLD;
  }

  const ctx = await serverIdeaContext(tenant.slug);
  const after: Turn[] = [...before, { role: "user", text: body.text }];
  const prev = before.some((t) => t.role === "user") ? scoreDraft({ turns: before, affected, attachments }, ctx) : null;
  const now = scoreDraft({ turns: after, affected, attachments }, ctx);
  const brief = coachBrief(now, threshold);

  // A model only where the assistant is allowed to answer for this company, with its audit trail.
  const settings = viewer ? await loadAssistSettings(viewer.companyId) : null;
  const cfg = providerConfig();
  const gate = assistGate({ stage: tenant.stage ?? "demo", hasDatabase: viewer !== null, configured: cfg.id, enabled: settings?.enabled ?? false, dpaSignedAt: settings?.dpaSignedAt ?? null });
  const useModel = viewer !== null && settings !== null && gate.on && gate.provider === "bedrock";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        send("scores", { overall: now.overall, parts: now.parts, sameAs: now.sameAs, threshold, delta: deltas(prev, now) });

        let reply = coachMock(prev, now, threshold);
        let model = "mock";
        if (useModel) {
          const seed = await seedFor(tenant.slug);
          let knowledge: Knowledge = await loadKnowledge(viewer.companyId);
          if (!hasKnowledge(knowledge)) {
            let n = 0;
            knowledge = rowsFromSeed(seed, GOALS, () => "k" + ++n);
          }
          const profile = await loadProfile(viewer.companyId);
          const people = [...seed.people.map((p) => ({ name: p.name, role: p.role })), ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" }))];
          const out = await assist({
            question: body.text,
            history: before,
            ctx: { knowledge, profile, ceiling: settings.ceiling, searchDocuments: (q, k) => searchDocuments(viewer.companyId, settings.ceiling, q, k) },
            prompt: { companyName: tenant.name, brief: companyBrief(knowledge, profile), rules: settings.rules, coach: brief },
            redaction: { people, patterns: settings.patterns },
            provider: providerFor(cfg),
            onChecked: (c) => send("text", { text: c.text }),
            signal: request.signal,
          });
          // Blocked (above the classification ceiling): the offline coach still answers - it sends nothing anywhere.
          if (!out.blocked) { reply = out.answer.text; model = out.model; }
        }
        send("text", { text: reply });

        if (viewer && body.draftId) {
          await addTurns(viewer.companyId, viewer.userId, body.draftId, [
            { role: "user", text: body.text },
            { role: "assistant", text: stripTags(reply), overall: now.overall, model, promptVersion: IDEA_PROMPT_VERSION },
          ], { title: ideaFromTurns(after).title, overall: now.overall, scores: now.parts });
        }
        send("done", { text: reply, overall: now.overall });
      } catch (err) {
        console.error("[ideas]", tenant.slug, err instanceof Error ? err.message : err);
        send("error", { message: "The coach could not answer just now. Your idea is still here." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
