// The last filter between the model and the employee. Pure.
//   - personal data and secrets that slipped into the answer are masked again (redact.ts);
//   - citations are kept only if the tools handed that tag out AND its level is under the ceiling;
//   - an answer that cites nothing is flagged "unsourced", so the page can say so and /admin can count it.
import { canUse, type Level } from "./classify";
import { redact, type Hits, type RedactOptions } from "./redact";
import type { Source, Sources } from "./tools";

export type Checked = { text: string; cited: Source[]; unsourced: boolean; hits: Hits };

const TAG = /\[(S\d{1,3})\]/g;

export function checkAnswer(raw: string, sources: Sources, ceiling: Level, opts: RedactOptions): Checked {
  const cited: Source[] = [];
  const text = raw.replace(TAG, (_m, tag: string) => {
    const s = sources.get(tag);
    if (!s || !canUse(s.level, ceiling)) return ""; // made up, or above the ceiling: gone
    if (!cited.includes(s)) cited.push(s);
    return `[${s.tag}]`;
  });
  const r = redact(text, opts);
  return { text: r.text.replace(/[ \t]+([.,;:!?])/g, "$1").trim(), cited, unsourced: cited.length === 0, hits: r.hits };
}

/** The answer without its tags - what is stored and what goes into a raise draft. */
export function stripTags(text: string): string {
  return text.replace(TAG, "").replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
