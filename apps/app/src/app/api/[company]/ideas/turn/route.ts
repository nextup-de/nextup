// POST /api/[company]/ideas/turn - one message in the idea studio (docs/IDEAS.md).
//
// The message is added to the idea, the model reads the idea (the five dials, what it found, what is
// still open) and the coach answers from that reading. With no model, or when it fails, the keyword
// benchmark and the offline coach answer instead, and the page says so. Same rules as the assistant
// route next door: the company comes from the URL and must match the viewer; nothing from the body
// names a company or a person.
//
//   server mode   a session and a database: `draftId` names the viewer's own draft; both turns
//                 and the score are stored. The model (Bedrock) coaches when the assistant gate
//                 allows it; otherwise the offline coach does.
//   local demo    no database: the browser keeps the draft and sends its turns along; nothing
//                 is stored here and only the offline coach answers.
//   the brain     where the stack runs it (BRAIN_URL), it reads the idea and coaches on every message,
//                 in either mode, unless the company switched the assistant off. The data-processing
//                 gate (purpose coach) applies like everywhere else. No answer in time, or any
//                 error, and the coach above answers instead. BRAIN_TIMEOUT_MS is per call, so a
//                 turn with the brain can take twice that before the coach above takes over.
//
// Whatever fails, and when the author has left, the message and a reply are stored; `error` only says
// the turn could not be stored.
//
// The comparison with earlier cases only uses the ones the viewer may open, and the model writes in
// the language of the page.
//
// Events:  status {step}                                        the brain is working: "reading", then "coaching"
//          scores {overall, parts, sameAs, threshold, delta,    the reading (null: none) and the benchmark
//                  replies, reading}                            after this message, and suggested answers
//          replies {replies}                                    the suggested answers again, with the
//                                                               brain's own guess first (brain only)
//          stage  {by: brain | model | offline}                 which coach is answering now - the wait the
//                                                               raise page's orb shows and times (features/ideas/progress)
//          text   {text}                                        the coach so far (replace)
//          done   {text, overall}
//          error  {message}
import { z } from "zod";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { getViewerFor } from "@/features/auth/session";
import { getLocale } from "@/i18n/server";
import { assist } from "@/features/assist";
import { aiGate } from "@/features/ai/gate";
import { aiSettings } from "@/features/ai/settings";
import { stripTags } from "@/features/assist/check";
import { companyBrief, hasKnowledge, rowsFromSeed, type Knowledge } from "@/features/knowledge";
import { DEFAULT_PUBLISH_THRESHOLD, deltas } from "@/features/ideas/benchmarks";
import { coachText, withCoachSuggestion } from "@/features/ideas/brain-coach";
import { coachBrief, coachMock, ideaFromTurns, IDEA_PROMPT_VERSION } from "@/features/ideas/coach";
import { withoutSkipped } from "@/features/ideas/raise";
import { MAX_TURN, MAX_TURNS, scoreDraft } from "@/features/ideas/drafts";
import { newestReading, overallDelta, readingBrief, readingReply, type Reading } from "@/features/ideas/reading";
import { suggestReplies } from "@/features/ideas/replies";
import { hasDatabase } from "@/lib/db/client";
import { loadAssistSettings } from "@/lib/db/assist";
import { loadAiSettings } from "@/lib/db/ai";
import { addTurns, getDraft, loadPublishThreshold } from "@/lib/db/ideas";
import { loadKnowledge, loadProfile } from "@/lib/db/knowledge";
import { searchDocumentsFor } from "@/server/assist-search";
import { serverIdeaContext } from "@/server/ideas";
import { clientKey, throttle } from "@/server/throttle";
import { streamingFor } from "@/server/ai";
import { DEFAULT_CEILING } from "@/features/assist/classify";
import { policyFor } from "@/features/admin/stages";
import { askBrainCoach, askBrainRead, brainConfigured } from "@/server/brain";

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
  // The questions the author answered "not sure" to (the raise page's rail): the coach does not ask them again.
  skip: z.array(z.string().min(1).max(300)).max(20).default([]),
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
  const slow = (await throttle("ideaTurn", tenant.slug + ":" + who)) ?? (await throttle("ideaTurnAll", tenant.slug));
  if (slow) return json({ error: slow }, 429);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Write a few words about the idea." }, 400);
  const body = parsed.data;

  // The idea as it stands before this message, from the database in server mode.
  let before: Turn[], affected: string[], attachments: number, threshold: number, previous: Reading | null = null;
  if (viewer) {
    if (!body.draftId) return json({ error: "No draft." }, 400);
    const d = await getDraft(viewer.companyId, viewer.userId, body.draftId);
    if (!d || d.status !== "draft") return json({ error: "This draft is no longer open." }, 404);
    if (d.turns.length + 2 > MAX_TURNS) return json({ error: "This draft is long enough - publish it or start a new one." }, 400);
    before = d.turns.map(({ role, text }) => ({ role, text }));
    affected = d.affected;
    attachments = d.attachments;
    threshold = await loadPublishThreshold(viewer.companyId);
    previous = newestReading(d.turns);
  } else {
    before = body.history;
    affected = body.affected;
    attachments = body.attachments;
    threshold = DEFAULT_PUBLISH_THRESHOLD;
  }

  const locale = await getLocale();
  const ctx = await serverIdeaContext(tenant.slug, viewer);
  const after: Turn[] = [...before, { role: "user", text: body.text }];
  const prev = before.some((t) => t.role === "user") ? scoreDraft({ turns: before, affected, attachments }, ctx, locale) : null;
  const now = scoreDraft({ turns: after, affected, attachments }, ctx, locale);
  // The coach asks from the benchmark without the skipped questions; the scores sent are the full ones.
  const askNow = withoutSkipped(now, body.skip);
  const brief = coachBrief(askNow, threshold);
  const replies = suggestReplies({ text: ideaFromTurns(after).text, affected, attachments }, now, ctx, locale);

  // A model only where the assistant is allowed to answer for this company, with its audit trail.
  const settings = viewer ? await loadAssistSettings(viewer.companyId) : null;
  const stage = tenant.stage ?? "demo";
  const ai = viewer ? await loadAiSettings(viewer.companyId, stage) : { settings: aiSettings(null, process.env, stage), key: null };
  const gate = aiGate({ stage, hasDatabase: viewer !== null, settings: ai.settings, dpaSignedAt: settings?.dpaSignedAt ?? null, purpose: "coach", assistantOn: settings?.enabled ?? false, aiRouting: false });
  const useModel = viewer !== null && settings !== null && settings.enabled && gate.on && gate.settings.choice !== "mock" && gate.settings.choice !== "off";
  // The company's switch in /admin/knowledge turns the brain off. Real people (a real stage) need a
  // database and the switch on, like the assistant's gate.
  const useBrain = gate.on && brainConfigured() &&
    (policyFor(tenant.stage ?? "demo").demoData || (viewer !== null && (settings?.enabled ?? false)));

  const encoder = new TextEncoder();
  const left = new AbortController(); // the author is gone: no more model calls and nothing more to send
  const signal = AbortSignal.any([request.signal, left.signal]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!signal.aborted) controller.enqueue(encoder.encode(sse(event, data))); };
      try {
        const policy = { patterns: settings?.patterns ?? [], ceiling: settings?.ceiling ?? DEFAULT_CEILING };
        const idea = ideaFromTurns(after);
        // Nothing else reaches the page until the model has read the idea: tens of seconds on a CPU server.
        if (useBrain) send("status", { step: "reading" });
        const reading = useBrain
          ? await askBrainRead(gate, tenant.slug, { idea, affected: affected.length, attachments, skip: body.skip, previous, audience: viewer, locale }, policy, signal, { key: ai.key })
          : null;
        const overall = reading?.overall ?? now.overall;
        const benchDelta = deltas(prev, now);
        const delta = prev ? { ...benchDelta, overall: overallDelta(benchDelta.overall, reading, previous) } : null;
        send("scores", { overall, parts: now.parts, sameAs: now.sameAs, threshold, delta, replies, reading });

        // prev as it was: after a "not sure" the coach asks the next question fresh, not "I still need this".
        let reply = reading ? readingReply(reading) : coachMock(prev, askNow, threshold, body.text, 0); // the raise page shows no suggested answers, so the coach does not point to them
        let model = "mock", promptVersion = IDEA_PROMPT_VERSION;
        const ask = reading !== null && !signal.aborted;
        if (ask) send("status", { step: "coaching" });
        send("stage", { by: ask ? "brain" : useModel ? "model" : "offline" });
        const coached = ask
          ? await askBrainCoach(gate, tenant.slug, { idea, turns: after, reading, audience: viewer, locale }, policy, signal, { key: ai.key })
          : null;
        const coachedText = coached ? coachText(coached) : "";
        if (coached && coachedText) {
          reply = coachedText;
          model = coached.model;
          promptVersion = coached.version;
          const offered = withCoachSuggestion(coached, { text: idea.text, affected, attachments }, now, ctx, replies);
          if (offered[0] !== replies[0]) send("replies", { replies: offered });
        } else if (useModel && !signal.aborted) {
          if (ask) send("stage", { by: "model" }); // the brain had no answer in time: the model takes over
          try {
            const seed = await seedFor(tenant.slug);
            let knowledge: Knowledge = await loadKnowledge(viewer.companyId);
            if (!hasKnowledge(knowledge)) {
              let n = 0;
              knowledge = rowsFromSeed(seed, seed.goals, () => "k" + ++n);
            }
            const profile = await loadProfile(viewer.companyId);
            const people = [...seed.people.map((p) => ({ name: p.name, role: p.role })), ...tenant.users.map((u) => ({ name: u.name, role: "a colleague" }))];
            const out = await assist({
              question: body.text,
              history: before,
              ctx: { knowledge, profile, ceiling: settings.ceiling, searchDocuments: searchDocumentsFor(viewer, settings.ceiling) },
              prompt: { companyName: tenant.name, brief: companyBrief(knowledge, profile), rules: settings.rules, coach: reading ? readingBrief(reading, threshold) : brief },
              redaction: { people, patterns: settings.patterns },
              provider: streamingFor(ai.settings, ai.key),
              onChecked: (c) => send("text", { text: c.text }),
              signal,
            });
            // Blocked (above the classification ceiling): the offline coach still answers - it sends nothing anywhere.
            if (!out.blocked) { reply = out.answer.text; model = out.model; }
          } catch (err) {
            // The offline reply above stands; the text event below replaces whatever had streamed.
            console.error("[ideas]", tenant.slug, "model failed", err instanceof Error ? err.name : "failed");
          }
        }
        send("text", { text: reply });

        if (viewer && body.draftId) {
          const saved = await addTurns(viewer.companyId, viewer.userId, body.draftId, [
            { role: "user", text: body.text },
            { role: "assistant", text: stripTags(reply), overall, model, promptVersion, reading },
          ], { title: idea.title, overall, scores: now.parts });
          // Closed while the model worked (discarded or published in another tab).
          if (!saved) { send("error", { message: "This draft is no longer open." }); return; }
        }
        send("done", { text: reply, overall });
      } catch (err) {
        console.error("[ideas]", tenant.slug, err instanceof Error ? err.message : err);
        send("error", { message: "The coach could not answer just now. Your idea is still here." });
      } finally {
        if (!left.signal.aborted) controller.close();
      }
    },
    cancel() { left.abort(); },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
