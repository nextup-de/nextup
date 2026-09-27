// "Raise it anyway": the conversation becomes the raise form - the first question as the one-line
// title, the rest as context the owner reads. Pure.
import { SITE } from "@/config/site";
import { stripTags } from "./check";

export type Turn = { role: "user" | "assistant"; text: string };

const TITLE_MAX = 140;
const CONTEXT_MAX = 1200;

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

export function draftRaise(turns: readonly Turn[]): { title: string; context: string } {
  const asked = turns.filter((t) => t.role === "user").map((t) => t.text.trim()).filter(Boolean);
  const answered = turns.filter((t) => t.role === "assistant").map((t) => stripTags(t.text)).filter(Boolean);
  const title = clip(asked[0] ?? "", TITLE_MAX);
  const lines = [
    ...asked.slice(1).map((a) => "Also asked: " + a),
    answered.length ? `${SITE.name} assistant said: ${answered[answered.length - 1]}` : "",
    answered.length ? "Raised because that did not solve it." : "",
  ].filter(Boolean);
  return { title, context: clip(lines.join("\n"), CONTEXT_MAX) };
}
