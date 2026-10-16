// The finalized idea: the whole raise conversation worked into one document - summary, the problem and the
// idea, what the AI made of it (five dials), what was checked across the company, what is still open,
// similar ideas, who receives it, the conversation itself and the sources. One to three pages when
// printed. The author finalizes it before sending (components/ideas/RaiseFinal.tsx); the demo script
// offers that only after its third text. Pure.
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import type { Dept, OrgPerson } from "@/features/demo/types";
import type { Source, WrittenBrief } from "./brief";
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

export type DocCase = {
  files: readonly { name: string; size: string }[]; // everything the author attached, not just the images
  affected: readonly string[]; // as the raise page names them: departments or people
  categories: readonly string[];
  receiverRole: string;
  depts: readonly Dept[];
  people: readonly OrgPerson[];
};

/** The finalized document as the brief the raised case carries: what the raise page knew, nothing added. */
export function briefOfDoc(d: IdeaDoc, x: DocCase): WrittenBrief {
  const sources: Record<string, Source> = { doc: { name: docFileName(d) + ".pdf", where: "Idea document · " + d.author + ", " + d.date, ext: "PDF" } };
  const keyOf = (name: string) => {
    const k = Object.keys(sources).find((y) => sources[y].name === name);
    if (k) return k;
    const n = "s" + Object.keys(sources).length;
    sources[n] = { name, where: "Checked across the company", ext: "DATA" };
    return n;
  };
  d.sources.forEach((s) => keyOf(s.name));
  const deptOf = (name: string) => x.depts.find((y) => y.name === name || y.id === name)?.id;
  const facts = d.details.map((l) => /^([^:]{1,40}):\s*(.+)$/.exec(l)).filter((m): m is RegExpExecArray => !!m);
  return {
    description: d.description,
    context: d.details.filter((l) => !/^([^:]{1,40}):\s*(.+)$/.test(l)).join("\n") || undefined,
    prompts: [
      ...facts.map((m) => ({ label: m[1].trim(), text: m[2].trim() })),
      { label: "Team", text: d.team || "Not stated" }, // who receives it is the routing, shown with who raised it
      ...(d.overall != null ? [{ label: "Overall", text: d.overall + " / 100" }] : []),
    ],
    files: [{ name: docFileName(d) + ".pdf", size: "Idea document" }, ...x.files],
    categories: [...x.categories],
    affects: {
      depts: x.affected.map(deptOf).filter((y): y is string => !!y),
      people: x.affected.filter((a) => !deptOf(a) && x.people.some((p) => p.name === a)),
      ai: [], why: {},
    },
    scores: d.dials.map((g) => ({
      value: Number(g.score) || 0, note: g.level + ". " + g.note,
      blocks: [
        { t: "text" as const, h: "Assessment", p: g.note, c: ["doc"] },
        ...(g.facts.length ? [{ t: "facts" as const, items: g.facts.map((f) => ({ k: f.source, v: f.text, c: [keyOf(f.source)] })) }] : []),
      ],
    })),
    summary: d.summary,
    lead: "",
    after: "Advice when it was raised: " + d.advice.name + ". " + d.advice.why,
    rec: d.advice.name === "Approve" ? "approve" : d.advice.name === "Pilot" ? "pilot" : "info",
    recText: d.advice.why,
    next: "", by: "",
    questions: [...d.open],
    pattern: d.pattern,
    similar: d.similar.map((s) => ({ title: s.title, where: s.by ? "Raised by " + s.by : "", status: s.status, match: null })),
    routing: [{ name: d.receiver, role: x.receiverRole, why: d.author + " chose them when publishing the idea." }],
    cites: { summary: ["doc"], after: ["doc"], pattern: ["doc"] },
    sources,
    feed: { supporters: 0, sentiment: "No comments yet.", comments: [] },
  };
}
