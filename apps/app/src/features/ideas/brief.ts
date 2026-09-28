// The AI brief shown beside an inbox item: five scores with their reasoning, what the AI found, who
// it affects, the decisions on offer, and the numbered sources behind every claim. An idea gets
// briefFor(), a case briefForCase(). Pure: facts in, a plain object out - the inbox renders it,
// nothing here knows about React.
//
// Demo honesty: the briefs are written content (brief-demo.ts), matched to the seed ideas they
// were designed for. An idea without one gets a short brief built from its own seed fields, so
// every sentence on the page still traces back to something in the seed. A model can replace
// either later without changing this shape.
import { profileOf } from "@/features/demo/profiles";
import type { Dept, Idea, OrgPerson } from "@/features/demo/types";
import type { ReducedCase } from "@/features/cases/reducer";
import { scoreCase } from "@/features/scoring";
import { BRIEFS } from "./brief-demo";

// ── what a written brief contains ──

export type SourceKind = "PDF" | "XLSX" | "CSV" | "DOCX" | "PPTX" | "PNG" | "DATA" | "IDEA" | "WEB";
export type Source = { name: string; where: string; ext: SourceKind };

// Reasoning blocks. `c` lists source keys; they become numbered citations in numberBlocks().
export type Block =
  | { t: "text"; h: string; p: string; c: string[] }
  | { t: "facts"; items: { k: string; v: string; c: string[] }[] }
  | { t: "steps"; items: { label: string; owner: string; dur: string }[]; c: string[] }
  | { t: "compare"; title: string; rows: { label: string; value: number; display: string; us?: boolean }[]; c: string[] }
  | { t: "quote"; h: string; q: string; who: string; role: string; c: string[] }
  | { t: "split"; ups: { t: string; c: string[] }[]; downs: { t: string; c: string[] }[] };

export const SCORE_LABELS = ["Value", "Feasibility", "Cost", "Fit", "Risk"] as const;
export type ScoreLabel = (typeof SCORE_LABELS)[number];

// One button in the decision card. An idea offers DECISIONS; a case offers its own four, all live.
export type Action = { key: string; label: string; live: boolean; danger?: boolean };
// The five decisions on an idea. Only approve and info have events today (idea.approved,
// idea.asked); the other three wait on new event types.
export type DecisionKey = "approve" | "pilot" | "info" | "route" | "decline";
export const DECISIONS: (Action & { key: DecisionKey })[] = [
  { key: "approve", label: "Approve", live: true },
  { key: "pilot", label: "Start as pilot", live: false },
  { key: "info", label: "More info", live: true },
  { key: "route", label: "Route to expert", live: false },
  { key: "decline", label: "Decline", live: false, danger: true },
];

export type BriefCiteField = "summary" | "lead" | "bars" | "after" | "rec" | "pattern" | "similar";

export type WrittenBrief = {
  description: string;
  context?: string;
  prompts: { label: string; text: string }[];
  files: { name: string; size: string }[];
  categories: string[];
  affects: { depts: string[]; people: string[]; ai: string[]; why: Record<string, string> };
  scores: { value: number; note: string; blocks: Block[] }[]; // one per SCORE_LABELS entry, value 0-100
  summary: string;
  lead: string;
  bars?: { title: string; rows: { label: string; value: number; display: string }[]; note: string };
  after: string;
  rec: DecisionKey;
  recText: string;
  next: string;
  by: string;
  timeline?: { title: string; steps: { when: string; what: string; now?: boolean }[] };
  questions: string[];
  pattern: string;
  similar: { title: string; where: string; status: string; match: number | null; note?: string }[];
  routing: { name: string; role: string; why: string }[];
  cites: Partial<Record<BriefCiteField, string[]>>;
  sources: Record<string, Source>;
  feed: { supporters: number; sentiment: string; comments: { name: string; role: string; text: string; daysAgo: number }[] };
};

// ── what the inbox renders ──

export type Numbered = { n: number } & Source;
export type NumberedBlock =
  | { t: "text"; h: string; p: string; cites: number[] }
  | { t: "facts"; items: { k: string; v: string; cites: number[] }[] }
  | { t: "steps"; items: { label: string; owner: string; dur: string; cites: number[] }[] }
  | { t: "compare"; title: string; rows: { label: string; display: string; pct: number; us: boolean }[]; cites: number[] }
  | { t: "quote"; h: string; q: string; who: string; role: string; cites: number[] }
  | { t: "split"; ups: { t: string; cites: number[] }[]; downs: { t: string; cites: number[] }[] };

export type Person = { name: string; role: string; dept: string; location: string; email: string; anonymous?: boolean }; // anonymous: raised under a handle - no name, no details
export type AffectedDept = { id: string; name: string; ai: boolean; why: string | null; members: Person[] };
export type AffectedPerson = Person & { ai: boolean; why: string | null };

export type IdeaBrief = {
  written: boolean; // false: built from the seed fields only
  author: Person;
  description: string;
  context: string | null;
  prompts: { label: string; text: string }[];
  files: { name: string; short: string; size: string; ext: string }[];
  categories: string[];
  depts: AffectedDept[];
  people: AffectedPerson[];
  scores: { label: string; value: number; note: string; blocks: NumberedBlock[]; sources: Numbered[] }[];
  summary: string;
  lead: string | null;
  bars: { title: string; rows: { label: string; display: string; pct: number }[]; note: string } | null;
  after: string | null;
  actions: Action[]; // the decision card's buttons, in order
  rec: string; // the key of the action the AI suggests ("" for none)
  recText: string;
  next: string | null;
  by: string | null;
  timeline: WrittenBrief["timeline"] | null;
  questions: string[];
  pattern: string;
  similar: WrittenBrief["similar"];
  routing: WrittenBrief["routing"];
  cites: Record<BriefCiteField, number[]>;
  sources: Numbered[];
  feed: WrittenBrief["feed"];
};

export type BriefContext = { people: readonly OrgPerson[]; depts: readonly Dept[]; ideas: readonly Idea[] };

// ── small pure helpers the page also uses ──

export const extOf = (file: string) => (file.split(".").pop() ?? "").toUpperCase();

// Long attachment names are cut in the middle so the extension stays visible (first 13 + … + last 9).
export const shortFileName = (name: string) => (name.length > 24 ? name.slice(0, 13) + "…" + name.slice(-9) : name);

// The file-type tag's colour family.
export type TagTone = "red" | "green" | "violet" | "blue" | "grey";
export function tagTone(ext: string): TagTone {
  if (ext === "PDF") return "red";
  if (/XLS|CSV/.test(ext)) return "green";
  if (/PNG|JPE?G/.test(ext)) return "violet";
  if (/DOC|PPT/.test(ext)) return "blue";
  return "grey";
}

// The inbox badge: red only once an item is more than a week late; a few days late reads grey.
export type BadgeTone = "late" | "overdue" | "left" | "paused";
export const badgeTone = (due: number, paused = false): BadgeTone => (paused ? "paused" : due < -7 ? "late" : due < 0 ? "overdue" : "left");

// Turns source keys into numbers in first-cited order, and returns the numbered list.
export function numberBlocks(blocks: readonly Block[], pool: Readonly<Record<string, Source>>): { blocks: NumberedBlock[]; sources: Numbered[] } {
  const order: string[] = [];
  const cite = (keys: readonly string[]) =>
    keys.filter((k) => pool[k]).map((k) => { if (!order.includes(k)) order.push(k); return order.indexOf(k) + 1; });
  const out = blocks.map((b): NumberedBlock => {
    switch (b.t) {
      case "text": return { t: "text", h: b.h, p: b.p, cites: cite(b.c) };
      case "facts": return { t: "facts", items: b.items.map((x) => ({ k: x.k, v: x.v, cites: cite(x.c) })) };
      case "steps": { // the citation sits on the last step
        const cs = cite(b.c);
        return { t: "steps", items: b.items.map((x, i) => ({ ...x, cites: i === b.items.length - 1 ? cs : [] })) };
      }
      case "compare": {
        const max = Math.max(...b.rows.map((r) => r.value), 0) || 1;
        const cites = cite(b.c);
        return { t: "compare", title: b.title, cites, rows: b.rows.map((r) => ({ label: r.label, display: r.display, pct: Math.max(4, (r.value / max) * 100), us: !!r.us })) };
      }
      case "quote": return { t: "quote", h: b.h, q: b.q, who: b.who, role: b.role, cites: cite(b.c) };
      case "split": return { t: "split", ups: b.ups.map((x) => ({ t: x.t, cites: cite(x.c) })), downs: b.downs.map((x) => ({ t: x.t, cites: cite(x.c) })) };
    }
  });
  return { blocks: out, sources: order.map((k, i) => ({ n: i + 1, ...pool[k] })) };
}

// "C. Ilg, Ops" -> "C. Ilg"
export const proposerOf = (idea: Pick<Idea, "proposedBy">) => idea.proposedBy.split(", ")[0];

function personOf(name: string, ctx: BriefContext, fallbackRole = ""): Person {
  const p = ctx.people.find((x) => x.name === name);
  const dept = p ? ctx.depts.find((d) => d.id === p.dept)?.name ?? p.dept : "";
  return { name, role: p?.role ?? fallbackRole, dept, ...profileOf(name) };
}

// Someone on the org chart, as a profile card shows them; null for anyone who is not (a handle, "You").
export const personFor = (name: string, ctx: BriefContext): Person | null => (ctx.people.some((p) => p.name === name) ? personOf(name, ctx) : null);

// The brief for one idea: the written one if there is one, otherwise one built from the seed.
export function briefFor(idea: Idea, ctx: BriefContext): IdeaBrief {
  const w = BRIEFS[idea.id] ?? derivedBrief(idea, ctx);
  const [, deptHint = ""] = idea.proposedBy.split(", ");
  const author = personOf(proposerOf(idea), ctx, deptHint);
  const aiWhy = (key: string) => (w.affects.ai.includes(key) ? w.affects.why[key] ?? "Suggested by the AI from the idea description." : null);

  const depts = w.affects.depts.map((id): AffectedDept => ({
    id, name: ctx.depts.find((d) => d.id === id)?.name ?? id, ai: w.affects.ai.includes(id), why: aiWhy(id),
    members: ctx.people.filter((p) => p.dept === id).map((p) => personOf(p.name, ctx)),
  }));
  const people = w.affects.people.map((n): AffectedPerson => ({ ...personOf(n, ctx), ai: w.affects.ai.includes(n), why: aiWhy(n) }));

  const scores = w.scores.map((s, i) => ({ label: SCORE_LABELS[i], value: s.value, note: s.note, ...numberBlocks(s.blocks, w.sources) }));

  // The brief's own source list: what the brief cites first, then the attachments, then whatever
  // the score reasoning used - each once, numbered in that order.
  const sources: Numbered[] = [];
  const add = (s: Source) => { if (!sources.some((x) => x.name === s.name)) sources.push({ n: sources.length + 1, ...s }); };
  const citedKeys = [...new Set(Object.values(w.cites).flat())].filter((k) => w.sources[k]);
  citedKeys.forEach((k) => add(w.sources[k]));
  w.files.forEach((f) => add({ name: f.name, where: "Attached by " + author.name, ext: toKind(extOf(f.name)) }));
  scores.forEach((s) => s.sources.forEach(({ name, where, ext }) => add({ name, where, ext })));
  const numOf = (k: string) => sources.find((s) => s.name === w.sources[k]?.name)?.n ?? null;
  const cites = Object.fromEntries(
    (["summary", "lead", "bars", "after", "rec", "pattern", "similar"] as const).map((f) => [f, (w.cites[f] ?? []).map(numOf).filter((n): n is number => n !== null)]),
  ) as Record<BriefCiteField, number[]>;

  const barMax = w.bars ? Math.max(...w.bars.rows.map((r) => r.value), 0) || 1 : 1;
  return {
    written: !!BRIEFS[idea.id],
    author,
    description: w.description,
    context: w.context ?? null,
    prompts: w.prompts,
    files: w.files.map((f) => ({ ...f, short: shortFileName(f.name), ext: extOf(f.name) })),
    categories: w.categories,
    depts, people, scores,
    summary: w.summary,
    lead: w.lead || null,
    bars: w.bars ? { title: w.bars.title, note: w.bars.note, rows: w.bars.rows.map((r) => ({ label: r.label, display: r.display, pct: Math.max(3, (r.value / barMax) * 100) })) } : null,
    after: w.after || null,
    actions: DECISIONS, rec: w.rec, recText: w.recText,
    next: w.next || null, by: w.by || null,
    timeline: w.timeline ?? null,
    questions: w.questions,
    pattern: w.pattern,
    similar: w.similar,
    routing: w.routing,
    cites, sources,
    feed: w.feed,
  };
}

const KINDS: readonly SourceKind[] = ["PDF", "XLSX", "CSV", "DOCX", "PPTX", "PNG", "DATA", "IDEA", "WEB"];
const toKind = (ext: string): SourceKind => (KINDS as readonly string[]).includes(ext) ? (ext as SourceKind) : ext === "XLS" ? "XLSX" : ext === "DOC" ? "DOCX" : "DATA";

// An idea nobody wrote a brief for: only what the seed says, nothing invented.
function derivedBrief(idea: Idea, ctx: BriefContext): WrittenBrief {
  const author = proposerOf(idea);
  const dept = ctx.people.find((p) => p.name === author)?.dept;
  const c = idea.criteria;
  const score = (v: number) => Math.max(10, Math.min(95, v));
  const scores: WrittenBrief["scores"] = [
    { value: score(idea.upside.startsWith("€") ? 75 : 50), note: "Expected upside: " + idea.upside + ".", blocks: [{ t: "facts", items: [{ k: "Expected", v: idea.expected, c: ["seed"] }, { k: "Upside", v: idea.upside, c: ["seed"] }] }] },
    { value: score(idea.blocker ? 55 : 75), note: idea.blocker ?? "No blocker named.", blocks: [{ t: "text", h: "What it would take", p: idea.teamNote, c: ["seed"] }] },
    { value: score(70), note: "Effort: " + idea.effort + ".", blocks: [{ t: "facts", items: [{ k: "Effort", v: idea.effort, c: ["seed"] }] }] },
    { value: score(c.fit ? 80 : 50), note: c.fit ? "Fits the strategy." : "No clear strategic fit.", blocks: [{ t: "facts", items: [{ k: "Strategic fit", v: c.fit ? "Yes" : "No", c: ["seed"] }, { k: "KPI it moves", v: c.kpi ?? "None named", c: ["seed"] }] }] },
    { value: score(c.urgent ? 60 : 70), note: c.urgent ? "Urgent: waiting costs more." : "Not urgent.", blocks: [{ t: "text", h: "What could go wrong", p: idea.blocker ?? "Nothing named in the idea.", c: ["seed"] }] },
  ];
  return {
    description: idea.rationale,
    prompts: [{ label: "Expected", text: idea.expected }, { label: "Effort", text: idea.effort }],
    files: [],
    categories: [c.kpi ?? "No KPI", c.fit ? "Strategic fit" : "Outside strategy"],
    affects: { depts: dept ? [dept] : [], people: idea.team.filter((n) => ctx.people.some((p) => p.name === n) && n !== author), ai: [], why: {} },
    scores,
    summary: idea.rationale,
    lead: "", after: "",
    rec: "info",
    recText: "There is no written brief for this idea yet. Ask " + author + " for a cost and effort estimate first.",
    next: "", by: "",
    questions: [],
    pattern: "No clear pattern with other ideas yet.",
    similar: [],
    routing: [],
    cites: { summary: ["seed"] },
    sources: { seed: { name: idea.title, where: "Fresh ideas · this idea", ext: "IDEA" } },
    feed: { supporters: 0, sentiment: "Not enough comments to judge.", comments: [] },
  };
}

// ── a case in a team leader's inbox ──

// What the inbox knows about a case beyond the reduced row: who is looking, who stands behind it,
// what was attached, where it could be passed, and its hand-over history as one line.
export type CaseFacts = {
  promiseDays: number;
  me: string;
  affected: string[]; // named when raised, plus everyone who said "this affects me too"
  attachments: number;
  updates: number; // new information posted since (each one a re-evaluation)
  passTo: string; // who "Pass to" hands it to: the owner on the map, or my deputy
  history: string; // "From M. Roth, 3 Sept - ..." or "" - built by the page, it knows the calendar
};

const round5 = (n: number) => Math.max(10, Math.min(95, Math.round(n / 5) * 5));
const isHandle = (name: string) => name.startsWith("Anonymous");

// The same view an idea gets, built only from the case's own facts: the score parts features/scoring
// uses, the routing map and the promise clock. Nothing is invented; every row cites the case, the
// map or the promise.
export function briefForCase(c: ReducedCase, ctx: BriefContext, f: CaseFacts): IdeaBrief {
  const P = f.promiseDays, due = P - c.clock, route = c.route;
  const words = c.body.trim() ? c.body.trim().split(/\s+/).length : 0;
  const n = f.affected.length;
  const author: Person = isHandle(c.from)
    ? { name: c.from, role: c.fromDept, dept: c.fromDept, location: "", email: "", anonymous: true }
    : personFor(c.from, ctx) ?? { name: c.from, role: c.fromDept, dept: c.fromDept, ...profileOf(c.from) };
  const pool: Record<string, Source> = {
    case: { name: c.title, where: "This case · raised by " + c.from, ext: "IDEA" },
    map: { name: "Routing map", where: "Settings · Routing", ext: "DATA" },
    promise: { name: "The " + P + "-day promise", where: "Company rules", ext: "DATA" },
  };
  const raw: { label: string; value: number; note: string; blocks: Block[] }[] = [
    { label: "Value", value: c.upside ? 80 : 40, note: c.upside ? "Worth " + c.upside + ", in the raiser's words." : "Nobody has said what it is worth yet.",
      blocks: [{ t: "facts", items: [{ k: "Worth", v: c.upside || "Not stated", c: ["case"] }, ...(c.reason ? [{ k: "Flagged as", v: c.reason, c: ["case"] }] : [])] }] },
    { label: "Fit", value: route ? 85 : 35, note: route ? "Fits “" + route.type + "” on the routing map." : "No decision type on the map fits it.",
      blocks: route
        ? [{ t: "facts", items: [{ k: "Decision type", v: route.type, c: ["map"] }, { k: "Owner", v: route.owner.name + " · " + route.owner.role, c: ["map"] }, { k: "Deputy", v: route.deputy, c: ["map"] }, { k: "Usual wait", v: route.wait, c: ["map"] }] }]
        : [{ t: "text", h: "No match on the map", p: "No decision type on the routing map fits this case, so it lands on the triage desk and whoever holds it decides where it goes.", c: ["map"] }] },
    { label: "Detail", value: round5(35 + words * 1.2 + (f.attachments ? 15 : 0) + f.updates * 5), note: words + " words" + (f.attachments ? ", " + f.attachments + " attached" : ", no evidence attached") + ".",
      blocks: [{ t: "facts", items: [{ k: "Description", v: words + " words", c: ["case"] }, { k: "Evidence", v: f.attachments ? f.attachments + " attached" : "None attached", c: ["case"] }, { k: "New information", v: f.updates ? f.updates + (f.updates === 1 ? " update" : " updates") + " since" : "None since it was raised", c: ["case"] }] }] },
    { label: "Urgency", value: round5(30 + (c.clock / Math.max(1, P)) * 50), note: c.clock + " days open against the " + P + "-day promise.",
      blocks: [{ t: "facts", items: [{ k: "Open for", v: c.clock + " days" + (c.status === "asked" ? " (clock paused)" : ""), c: ["case"] }, { k: "Promise", v: P + " days", c: ["promise"] }, { k: "Now", v: due >= 0 ? due + " days left" : -due + " days past the promise", c: ["promise"] }] }] },
    { label: "Support", value: round5(35 + n * 15), note: n ? n + (n === 1 ? " person says" : " people say") + " it affects them too." : "Nobody else has added their name yet.",
      blocks: [{ t: "facts", items: [{ k: "Stand behind it", v: n ? f.affected.slice(0, 4).join(", ") + (n > 4 ? " +" + (n - 4) : "") : "Nobody yet", c: ["case"] }] }] },
  ];
  const scores = raw.map((s) => ({ label: s.label, value: s.value, note: s.note, ...numberBlocks(s.blocks, pool) }));
  const sources: Numbered[] = [];
  scores.forEach((s) => s.sources.forEach(({ name, where, ext }) => { if (!sources.some((x) => x.name === name)) sources.push({ n: sources.length + 1, name, where, ext }); }));
  const num = (k: string) => sources.find((s) => s.name === pool[k].name)?.n ?? null;
  const cite = (...ks: string[]) => ks.map(num).filter((x): x is number => x !== null);

  const overall = scoreCase({ ...c, affected: n, evidence: f.attachments, updates: f.updates }, P);
  const ownerIsMe = !!route && route.owner.name === f.me;
  const rec = !c.open ? "" : route && !ownerIsMe ? "hand" : c.upside ? "yes" : "ask";
  const actions: Action[] = c.open
    ? [{ key: "yes", label: "Yes, do it", live: true }, { key: "no", label: "No, and why", live: true }, { key: "hand", label: "Pass to " + f.passTo, live: true }, { key: "ask", label: "Ask a question", live: true }]
    : [];
  const recText = rec === "hand" && route ? route.owner.name + " owns “" + route.type + "” on the routing map, so the decision is theirs. Passing it keeps the clock running for them, not for you."
    : rec === "yes" ? "It is on your desk, the upside is stated, and it is described well enough to act on."
    : rec === "ask" ? "The case does not say what it is worth yet. One question gets that before you decide, and pauses the clock while " + c.from + " answers."
    : c.status === "asked" ? "Waiting for the answer to your question." : "Nothing left to decide on this case.";
  const linked = c.linkedIdea ? ctx.ideas.find((i) => i.id === c.linkedIdea) : null;
  const deputy = route ? personFor(route.deputy, ctx) : null;
  return {
    written: false, author,
    description: c.body || c.title, context: null,
    prompts: [
      { label: "Worth", text: c.upside || "Not estimated yet" },
      ...(c.reason ? [{ label: "Flagged as", text: c.reason }] : []),
      { label: "Owner on the map", text: route ? (ownerIsMe ? "You" : route.owner.name) + " · " + route.type : "Nobody yet - you triage it" },
      { label: "Open for", text: c.clock + " days" + (c.status === "asked" ? " · clock paused" : "") },
      ...(f.history ? [{ label: "History", text: f.history }] : []),
    ],
    files: [],
    categories: [c.kind === "idea" ? "Idea" : "Problem", c.fromDept, ...(route ? [route.type] : [])],
    depts: route ? [{ id: route.owner.dept, name: ctx.depts.find((d) => d.id === route.owner.dept)?.name ?? route.owner.dept, ai: false, why: null, members: ctx.people.filter((p) => p.dept === route.owner.dept).map((p) => personOf(p.name, ctx)) }] : [],
    people: f.affected.map((x) => personFor(x, ctx)).filter((p): p is Person => p !== null).map((p) => ({ ...p, ai: false, why: null })),
    scores,
    summary: (c.kind === "idea" ? "An idea" : "A problem") + " from " + c.fromDept + (c.reason ? ", flagged “" + c.reason + "”" : "") + ". The case score is " + overall.value + " / 100" + (overall.parts.length ? ": " + overall.parts.map((p) => p.label.toLowerCase()).join(", ") + "." : "."),
    lead: null, bars: null, after: null,
    actions, rec, recText,
    next: rec === "hand" ? "Pass it to " + f.passTo + "." : rec === "yes" ? "Say yes; " + c.from + " hears it today." : rec === "ask" ? "Ask " + c.from + " what it is worth." : null,
    by: !c.open ? null : due >= 0 ? "Within " + due + (due === 1 ? " day" : " days") + ", to keep the " + P + "-day promise" : "Now: " + -due + " days past the " + P + "-day promise",
    timeline: null,
    questions: c.upside ? [] : ["What would it be worth if it were fixed?"],
    pattern: linked ? "Linked to the idea “" + linked.title + "”." : "No clear pattern with other cases yet.",
    similar: [],
    routing: route ? [
      { name: route.owner.name, role: route.owner.role, why: "Owns “" + route.type + "” on the routing map." },
      { name: route.deputy, role: deputy?.role ?? "Deputy", why: "Deputy on the map: the case moves to them if the promise is missed." },
    ] : [],
    cites: { summary: cite("case"), lead: [], bars: [], after: [], rec: rec === "hand" ? cite("map") : cite("case"), pattern: [], similar: [] },
    sources,
    feed: { supporters: n, sentiment: n ? n + (n === 1 ? " person stands" : " people stand") + " behind it." : "Nobody else has added their name yet.", comments: [] },
  };
}
