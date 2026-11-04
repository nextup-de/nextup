// Scores one answer of the assistant against one catalog question (AIT-D1, decision D8). Pure.
import { canUse, type Level } from "../../../src/features/assist/classify";

export type Persona = "lena" | "ben" | "fiona" | "linus";
export type Question = {
  id: string;
  persona: Persona;
  channel: "m365" | "api" | "both";
  lang: "de" | "en";
  question: string;
  shouldFind: string[];
  mustNotFind: string[];
  answerShouldContain: string[];
  needsCeiling: "internal" | "confidential" | null;
  note: string;
};
export type DoneSource = { tag: string; kind?: string; label: string; level: string; url?: string };
export type Done = { text: string; sources: DoneSource[]; unsourced: boolean; blocked: boolean };
export type Score = { found: string[]; leaked: string[]; contains: boolean; pass: boolean };

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase();
const stripExt = (s: string) => s.replace(/\.[A-Za-z0-9]{1,5}$/, "");

/** A source hits a pack path when its label is that path, its file name, or its title (the name without extension). */
function matches(source: DoneSource, path: string): boolean {
  const p = norm(path);
  const name = p.split("/").pop() ?? p;
  for (const raw of [source.label, source.tag]) {
    const l = norm(raw ?? "");
    if (!l) continue;
    if (l === p || l === name || l === stripExt(name) || stripExt(l) === stripExt(name)) return true;
    if (l.length > name.length && l.includes(p)) return true;
    if (p.endsWith("/" + l) || p.endsWith("/" + stripExt(l))) return true;
  }
  return false;
}

/** Reads the SSE body the assist route sends: the `done` event carries the checked answer. */
export function parseAssistStream(text: string): Done {
  let done: Record<string, unknown> | null = null;
  let error: string | null = null;
  for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.join("\n"));
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    if (event === "done") done = parsed as Record<string, unknown>;
    else if (event === "error") error = String((parsed as { message?: unknown }).message ?? "error");
  }
  if (!done) throw new Error(error ? `assistant error: ${error}` : "no done event in the stream");
  const sources = Array.isArray(done.sources) ? (done.sources as DoneSource[]) : [];
  return { text: typeof done.text === "string" ? done.text : "", sources, unsourced: done.unsourced === true, blocked: done.blocked === true };
}

export function score(q: Question, done: Done, ceiling: Level = "internal"): Score {
  const found = q.shouldFind.filter((path) => done.sources.some((s) => matches(s, path)));
  const leaked = done.sources
    .filter((s) => q.mustNotFind.some((path) => matches(s, path)) || !canUse(s.level, ceiling))
    .map((s) => s.label);
  const text = done.text.toLowerCase();
  const contains = q.answerShouldContain.every((w) => text.includes(w.toLowerCase()));
  const hit = q.shouldFind.length === 0 ? done.sources.length === 0 : found.length > 0;
  return { found, leaked, contains, pass: hit && leaked.length === 0 && contains };
}
