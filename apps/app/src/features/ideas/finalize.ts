// The finalized idea: the whole raise conversation worked into one document - summary, the problem and the
// idea, what the AI made of it (five dials), what was checked across the company, what is still open,
// similar ideas, who receives it, the conversation itself and the sources. One to three pages when
// printed. The author finalizes it before sending (components/ideas/RaiseFinal.tsx); the demo script
// offers that only after its third text. Pure.
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import type { CompanyFact } from "./company-read";
import { type Advice, type Dial, type DialKey, levelOf, splitUpdate } from "./raise";

export type DocDial = { label: string; score: string; level: string; note: string; facts: CompanyFact[] };
export type DocSource = { name: string; where: string };
export type DocSimilar = { title: string; status: string; by: string };
export type DocLine = { who: "coach" | "author"; text: string };

export type IdeaDoc = {
  title: string; date: string; author: string; team: string; receiver: string;
  advice: Advice; overall: number | null;
  summary: string; description: string; details: string[];
  dials: DocDial[]; pattern: string; open: string[];
  similar: DocSimilar[]; sources: DocSource[]; conversation: DocLine[];
};

export type DocInput = {
  title: string; date: string; author: string; team: string; receiver: string;
  advice: Advice; overall: number | null; description: string; context: string;
  dials: readonly Dial[]; company: Record<DialKey, CompanyFact[]>;
  pattern: string; openTopics: readonly string[];
  similar: readonly DocSimilar[]; sources: readonly DocSource[]; turns: readonly Turn[];
};

const clip = (x: string, n: number) => (x.length > n ? x.slice(0, n).replace(/\s+\S*$/, "") + "…" : x);
const oneLine = (x: string) => x.replace(/\s+/g, " ").trim();

/** Everything the finalized document says, in the order it says it. */
export function ideaDoc(x: DocInput): IdeaDoc {
  const description = x.description.trim();
  const details = x.context.split("\n").map((l) => l.trim()).filter(Boolean);
  const conversation = x.turns.flatMap((t, i): DocLine[] => {
    if (i === 0) return []; // the first message is the idea itself
    const text = t.role === "user" ? splitUpdate(t.text).said : stripTags(t.text);
    return text.trim() ? [{ who: t.role === "user" ? "author" : "coach", text: text.trim() }] : [];
  });
  return {
    title: x.title.trim() || clip(oneLine(description), 80) || "Untitled idea",
    date: x.date, author: x.author, team: x.team, receiver: x.receiver,
    advice: x.advice, overall: x.overall,
    summary: clip(oneLine([description, ...details].map((l) => (/[.!?…]$/.test(l.trim()) ? l : l + ".")).join(" ")), 420) || "Nothing to summarise yet.",
    description, details,
    dials: x.dials.map((d) => ({ label: d.label, score: d.scored ? String(d.value) : "–", level: levelOf(d), note: d.note, facts: x.company[d.key] ?? [] })),
    pattern: x.pattern, open: [...x.openTopics],
    similar: [...x.similar], sources: [...x.sources], conversation,
  };
}

/** The same document as plain text, for "Copy text" and for sending on in a message. */
export function docText(d: IdeaDoc): string {
  const out: string[] = [d.title, `${d.author} · ${d.team} · ${d.date}`, `Goes to: ${d.receiver}`, "", "SUMMARY", d.summary, "", "THE IDEA", d.description];
  if (d.details.length) out.push("", "DETAILS", ...d.details.map((l) => "- " + l));
  out.push("", "ASSESSMENT (AI)", ...d.dials.map((x) => `- ${x.label}: ${x.level} (${x.score}/100). ${x.note}`));
  out.push(`Advice: ${d.advice.name}. ${d.advice.why}`, d.pattern);
  const facts = d.dials.flatMap((x) => x.facts.map((f) => `- [${f.source}] ${f.text}`));
  if (facts.length) out.push("", "CHECKED ACROSS THE COMPANY", ...facts);
  if (d.open.length) out.push("", "STILL OPEN", ...d.open.map((o) => "- " + o));
  out.push("", "SIMILAR IDEAS", ...(d.similar.length ? d.similar.map((s) => `- ${s.title} (${s.status}${s.by ? ", " + s.by : ""})`) : ["- None found"]));
  if (d.conversation.length) out.push("", "HOW WE GOT HERE", ...d.conversation.map((l) => `${l.who === "coach" ? "NextUp" : d.author}: ${l.text}`));
  out.push("", "SOURCES", ...d.sources.map((s, i) => `${i + 1}. ${s.name} - ${s.where}`), "", "AI suggestions only. You make the decision.");
  return out.join("\n");
}

/** A name for the downloaded PDF: the title, safe for a file system. */
export const docFileName = (d: IdeaDoc) => d.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "idea";
