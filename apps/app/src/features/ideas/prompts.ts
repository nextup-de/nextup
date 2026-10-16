// The idea's labelled lines - Impact, Who's blocked, ... or a custom label - as the Idea view edits them
// (components/ideas/IdeaCard.tsx). In the idea's text they are "*Label* text" lines (or "Impact: text"
// for the presets): the format splitIdea (features/ideas/raise.ts) and the brief read back.

export type Prompt = { label: string; text: string; custom?: boolean };

export const PRESETS = ["Impact", "Who’s blocked", "Already tried", "Trial", "Deadline"];

// A "*Label* text" line - or "Impact: text" for the presets - as a row; null for any other line.
function rowOf(line: string): Prompt | null {
  const l = line.trim();
  const m = /^\*(.+?)\*\s*(.*)$/.exec(l) ?? /^(.+?):\s*(.*)$/.exec(l);
  if (!m || !(l.startsWith("*") || PRESETS.includes(m[1]))) return null;
  return { label: m[1], text: m[2], ...(PRESETS.includes(m[1]) ? {} : { custom: true }) };
}

// The free text, then one "*Label* text" line per row that has both a label and text.
export function promptContext(free: string, rows: Prompt[]): string {
  return [free.trim(), ...rows.filter((p) => p.label.trim() && p.text.trim()).map((p) => "*" + p.label.trim() + "* " + p.text.trim())].filter(Boolean).join("\n");
}

// The other way: the row lines become rows, the rest the free text.
export function splitPrompts(ctx: string): { free: string; rows: Prompt[] } {
  const rows: Prompt[] = [], free: string[] = [];
  for (const l of ctx.split("\n")) {
    const r = rowOf(l);
    if (r) rows.push(r); else free.push(l);
  }
  return { free: free.join("\n").trim(), rows };
}
