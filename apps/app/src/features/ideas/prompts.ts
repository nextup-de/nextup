// The start composer's blocks (components/ideas/RaisePrompts.tsx): labelled lines - Impact, Who's
// blocked, ... or a custom label - set into the free text where the caret was. On send they go, in
// order, as the context after the headline, "*Label* text" per block: the format splitIdea
// (features/ideas/raise.ts) reads back.

export type Prompt = { label: string; text: string; custom?: boolean };

export const PRESETS = ["Impact", "Who’s blocked", "Already tried", "Trial", "Deadline"];

// A "*Label* text" line - or "Impact: text" for the presets - as a row; null for any other line.
function rowOf(line: string): Prompt | null {
  const l = line.trim();
  const m = /^\*(.+?)\*\s*(.*)$/.exec(l) ?? /^(.+?):\s*(.*)$/.exec(l);
  if (!m || !(l.startsWith("*") || PRESETS.includes(m[1]))) return null;
  return { label: m[1], text: m[2], ...(PRESETS.includes(m[1]) ? {} : { custom: true }) };
}

// The free line, then one "*Label* text" line per row that has both a label and text.
export function promptContext(free: string, rows: Prompt[]): string {
  return [free.trim(), ...rows.filter((p) => p.label.trim() && p.text.trim()).map((p) => "*" + p.label.trim() + "* " + p.text.trim())].filter(Boolean).join("\n");
}

// The other way: the row lines become rows, the rest the free line.
export function splitPrompts(ctx: string): { free: string; rows: Prompt[] } {
  const rows: Prompt[] = [], free: string[] = [];
  for (const l of ctx.split("\n")) {
    const r = rowOf(l);
    if (r) rows.push(r); else free.push(l);
  }
  return { free: free.join("\n").trim(), rows };
}

// ── The start composer's body, in order ──────────────────────────────────────────────────────────
// Free text and blocks take turns, always text first and last, so every block has a place for the
// caret before and after it (an empty one stays folded away). A block has a label ("" while a custom
// one is unnamed) and an id for React; free text has neither.
export type Seg = { text: string; label?: string; custom?: boolean; id?: string };
export const isBlock = (x: Seg): x is Seg & Prompt => x.label !== undefined;
export const EMPTY_BODY: Seg[] = [{ text: "" }];
const blockId = () => Math.random().toString(36).slice(2, 9);

// Where the caret was last: a piece of the body and the offset in it; seg -1 is the headline above.
export type Caret = { seg: number; pos: number };

export function segsContext(segs: Seg[]): string {
  return segs.map((x) => (isBlock(x) ? (x.label.trim() && x.text.trim() ? "*" + x.label.trim() + "* " + x.text.trim() : "") : x.text.trim())).filter(Boolean).join("\n");
}

// The row lines become blocks where they stand, the lines between them free text.
export function splitSegs(ctx: string): Seg[] {
  const out: Seg[] = [{ text: "" }];
  for (const l of ctx.split("\n")) {
    const r = rowOf(l);
    if (r) { out.push({ ...r, id: blockId() }, { text: "" }); continue; }
    const t = out[out.length - 1];
    t.text = t.text ? t.text + "\n" + l : l;
  }
  return out.map((x) => (isBlock(x) ? x : { text: x.text.trim() }));
}

// A new block at the caret: in free text it splits the text there; on a block it follows it; in the
// headline it comes first; with no caret yet, last. Returns the body and the block's index.
export function insertBlock(segs: Seg[], caret: Caret | null, b: Prompt): { segs: Seg[]; at: number } {
  const c = caret && caret.seg < segs.length ? caret : null;
  const k = !c ? segs.length - 1 : c.seg < 0 ? 0 : isBlock(segs[c.seg]) ? c.seg + 1 : c.seg;
  const t = segs[k].text;
  const pos = !c ? t.length : c.seg < 0 || isBlock(segs[c.seg]) ? 0 : Math.min(c.pos, t.length);
  const before = t.slice(0, pos).replace(/\n$/, ""), after = t.slice(pos).replace(/^\n/, "");
  return { segs: [...segs.slice(0, k), { text: before }, { ...b, id: blockId() }, { text: after }, ...segs.slice(k + 1)], at: k + 1 };
}

// The block at k out, the text on either side joined. Returns the body and where the caret goes.
export function removeBlock(segs: Seg[], k: number): { segs: Seg[]; caret: Caret } {
  const a = segs[k - 1].text, b = segs[k + 1].text;
  return { segs: [...segs.slice(0, k - 1), { text: a && b ? a + "\n" + b : a + b }, ...segs.slice(k + 2)], caret: { seg: k - 1, pos: a.length } };
}
