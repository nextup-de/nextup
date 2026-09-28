// The idea coach: after each message the idea is re-read and benchmarked, and the coach answers
// with what got better and ONE challenging question aimed at the weakest bar - the
// feedback ⇄ develop loop from the whiteboard. Pure.
//
// coachMock() is the reply when no model is configured (demo, e2e, local); coachBrief() is what
// a model is told in coach mode (features/assist/prompt.ts), so both answer the same question.
import { SITE } from "@/config/site";
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import { deltas, weakest, type Benchmark } from "./benchmarks";

export const IDEA_PROMPT_VERSION = "idea-coach-v1";

const TITLE_MAX = 140;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

// The idea as it stands: the first message is the title, everything the author wrote after it is
// the body. The coach's own words are never part of the idea - only the author's.
export function ideaFromTurns(turns: readonly Turn[]): { title: string; body: string; text: string } {
  const mine = turns.filter((t) => t.role === "user").map((t) => stripTags(t.text).trim()).filter(Boolean);
  const title = clip(mine[0] ?? "", TITLE_MAX);
  const body = mine.slice(1).join("\n");
  return { title, body, text: mine.join("\n") };
}

// "12 points to publish" / "Ready to publish".
export function toGo(overall: number, threshold: number): string {
  const n = threshold - overall;
  return n <= 0 ? "Ready to publish" : n + (n === 1 ? " point" : " points") + " to publish";
}

export function coachMock(prev: Benchmark | null, now: Benchmark, threshold: number): string {
  const lines: string[] = [];
  const d = deltas(prev, now);
  if (!prev) lines.push(`First read: ${now.overall} of 100. ${now.overall >= threshold ? "That is enough to publish." : `It needs ${threshold} to publish.`}`);
  else if (d.overall > 0) {
    const best = now.parts.reduce((b, p) => (d[p.id] > d[b.id] ? p : b), now.parts[0]);
    lines.push(`Up ${d.overall} to ${now.overall} - ${best.label.toLowerCase()} got stronger.`);
  } else lines.push(`Still at ${now.overall}. That did not add anything the benchmarks can see yet.`);

  if (now.sameAs) lines.push(`Something close is already raised: “${now.sameAs.title}”. You can co-sign it instead, or say what is different about yours.`);
  const w = weakest(now);
  if (w) lines.push(w.missing[0]);
  else if (now.overall >= threshold) lines.push(`Ready when you are - publish it and ${SITE.name} routes it to the person who can decide.`);
  return lines.join(" ");
}

// What a model is told in coach mode: the numbers it may not change and the one gap to ask about.
export function coachBrief(now: Benchmark, threshold: number): string {
  const w = weakest(now);
  const bars = now.parts.map((p) => `- ${p.label}: ${p.value}/100${p.missing.length ? " (missing: " + p.missing.join("; ") + ")" : ""}`).join("\n");
  return [
    `The idea scores ${now.overall}/100; it can be published at ${threshold}. The scores are computed, not yours to change - never state a different number.`,
    bars,
    now.sameAs ? `A close match is already raised: "${now.sameAs.title}". Mention it and suggest co-signing.` : "",
    w ? `Ask exactly one short, challenging question that would raise "${w.label}". Do not answer it yourself.` : "Tell them it is ready to publish.",
  ].filter(Boolean).join("\n");
}
