// The raise-page assistant: one question in, one checked answer out. docs/ASSISTANT.md.
//
// Pure orchestration - the model sits behind `Provider` (src/server/assist/provider.ts has the
// Bedrock one; mock.ts here needs no network), the documents behind ToolContext.searchDocuments.
// The order is the compliance story, so it is spelled out once, here:
//   1. redact the question (and the earlier turns) - names become roles, secrets become [secret];
//   2. refuse outright if the question is marked above the company's classification ceiling;
//   3. let the model answer with the read-only tools; tool output is redacted too;
//   4. check the answer: mask again, keep only real citations under the ceiling.
// Only redacted text ever reaches the provider or the audit table.
import { type Level, LEVEL_LABEL } from "./classify";
import { checkAnswer, stripTags, type Checked } from "./check";
import { buildSystem, type PromptInput } from "./prompt";
import { isAboveCeiling, redact, type Hits, type RedactOptions } from "./redact";
import { runTool, Sources, TOOLS, type ToolContext, type ToolDef } from "./tools";

export { ASSIST_PROMPT_VERSION } from "./prompt";
export type { Source } from "./tools";

export type ChatMessage = { role: "user" | "assistant"; text: string };

export type ProviderRun = {
  system: string;
  history: readonly ChatMessage[];
  question: string;
  tools: readonly ToolDef[];
  runTool: (name: string, input: unknown) => Promise<string>;
  /** Raw text as it streams. The caller re-checks it before anyone sees it. */
  onText: (delta: string) => void;
  signal?: AbortSignal;
};
export type ProviderResult = { text: string; model: string; tokensIn: number; tokensOut: number };
export type Provider = { id: "bedrock" | "mock"; run: (r: ProviderRun) => Promise<ProviderResult> };

export const MAX_QUESTION = 2000;
export const MAX_HISTORY = 6;

export type AssistArgs = {
  question: string;
  history: readonly ChatMessage[];
  ctx: ToolContext;
  prompt: Omit<PromptInput, "ceiling">;
  redaction: RedactOptions;
  provider: Provider;
  /** The answer so far, already checked - safe to show. Called with the whole text each time. */
  onChecked?: (c: Checked) => void;
  signal?: AbortSignal;
};

export type AssistOutcome =
  | { blocked: true; question: string; hits: Hits; reason: string }
  | { blocked: false; question: string; hits: Hits; answer: Checked; model: string; tokensIn: number; tokensOut: number };

export function blockedReason(marker: Level, ceiling: Level): string {
  return `This reads as ${LEVEL_LABEL[marker].toLowerCase()}, and the assistant may only use information up to ${LEVEL_LABEL[ceiling].toLowerCase()}. Nothing was sent. Raise it without the sensitive part, or talk to the owner directly.`;
}

export async function assist(a: AssistArgs): Promise<AssistOutcome> {
  const ceiling = a.ctx.ceiling;
  const q = redact(a.question.slice(0, MAX_QUESTION), a.redaction);
  if (isAboveCeiling(q, ceiling)) {
    return { blocked: true, question: q.text, hits: q.hits, reason: blockedReason(q.marker!, ceiling) };
  }

  const history = a.history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, text: redact(stripTags(m.text).slice(0, MAX_QUESTION), a.redaction).text }));
  const sources = new Sources();
  let raw = "";
  let shown = "";
  const emit = () => {
    if (!a.onChecked) return;
    // Only up to the last finished sentence: a half-streamed name or number is never shown.
    const cut = Math.max(raw.lastIndexOf(". "), raw.lastIndexOf("\n"), raw.lastIndexOf("! "), raw.lastIndexOf("? "));
    if (cut <= 0) return;
    const c = checkAnswer(raw.slice(0, cut + 1), sources, ceiling, a.redaction);
    if (c.text !== shown) { shown = c.text; a.onChecked(c); }
  };

  const result = await a.provider.run({
    system: buildSystem({ ...a.prompt, ceiling }),
    history,
    question: q.text,
    tools: TOOLS,
    runTool: async (name, input) => redact(await runTool(name, input, a.ctx, sources), a.redaction).text,
    onText: (d) => { raw += d; emit(); },
    signal: a.signal,
  });

  const answer = checkAnswer(result.text || raw, sources, ceiling, a.redaction);
  a.onChecked?.(answer);
  return { blocked: false, question: q.text, hits: q.hits, answer, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
}
