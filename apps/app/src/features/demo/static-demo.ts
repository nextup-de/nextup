// The static demo's company (app/demo, docs/IDEAS.md "The demo page"): the built-in seed with clear German
// names, plus what an interviewer should see without anyone typing - three more of the employee's own
// ideas, each in a state the seed does not show, a conversation on the changeover sheet (all seed history,
// so "Reset demo" and a reload keep them), and his earlier chats with the coach in the raise page's list.
// Only the static demo uses this; acme's seed, its names and the database stacks are untouched. Titles
// share at most one word with the demo script's idea, so the benchmark never calls the script "already
// raised" (tests/unit/static-demo.test.ts).
import { GOALS } from "@/features/evaluate";
import { BRIEFS } from "@/features/ideas/brief-demo";
import { ideaContext, scoreDraft, type DraftTurn, type DraftView } from "@/features/ideas/drafts";
import { SEED } from "./seed";
import type { Seed, SeedCase } from "./types";

// The seed's "T. Vogel" style and anonymous handles read oddly in a demo: full names instead, the same
// initials (avatars stay), mostly men's first names, and ones that fit the written texts ("he" for Neumann,
// "her" for Adler).
export const DEMO_NAMES: readonly (readonly [string, string])[] = [
  ["Anonymous #4471", "Jonas Schmidt"], ["J. Schmidt", "Jonas Schmidt"],
  ["Anonymous #2210", "Lukas Becker"], ["Anonymous #0931", "Max Wagner"],
  ["T. Vogel", "Thomas Vogel"], ["M. Roth", "Markus Roth"], ["H. Sander", "Hans Sander"], ["B. Hartmann", "Bernd Hartmann"],
  ["L. Brandt", "Lars Brandt"], ["E. Lindqvist", "Erik Lindner"], ["N. Kaya", "Nils Kaiser"], ["D. Ferraro", "Daniel Fischer"],
  ["C. Ilg", "Christian Ilg"], ["J. Klein", "Jan Klein"], ["S. Dahl", "Stefan Dahl"], ["R. Nowak", "Ralf Neumann"],
  ["P. Mayer", "Paul Mayer"], ["K. Adler", "Katrin Adler"], ["B. Ehlers", "Birgit Ehlers"], ["A. Weber", "Anna Weber"],
];
// Every string in `x`, with the names swapped. Plain data in, plain data out.
const renamed = <T,>(x: T): T => JSON.parse(DEMO_NAMES.reduce((s, [from, to]) => s.split(from).join(to), JSON.stringify(x)));

const ME = "Jonas Schmidt"; // Production, Line 3 - the employee persona
const LINE3 = "Production, Line 3";

const IDEAS: SeedCase[] = [
  // Your move: the team lead asked a question; the clock waits for the answer.
  { id: "d1", kind: "idea", title: "Move the shift handover notes onto a board by the line", from: ME, fromDept: LINE3,
    routeId: "r6", assignee: "Thomas Vogel", raisedDay: -2, reason: "is it important", upside: "≈ 10 min per handover",
    body: "Handover notes live in a binder in the break room, so the next shift reads them after the first problem instead of before it. A board at the line, filled in during the last ten minutes of the shift, gets read on the way in.",
    seedEvents: [
      { type: "case.read", day: -2, actor: "Thomas Vogel" },
      { type: "case.asked", day: -1, actor: "Thomas Vogel", payload: { text: "Good one. Which board do you mean - the one at the line entrance or the team board by the coffee machine? And who writes the notes at 22:00, when the shift lead is already at the press?" } },
    ] },
  // Replied: asked and answered; the decision is next.
  { id: "d2", kind: "idea", title: "Ear defenders in two sizes at the press", from: ME, fromDept: LINE3,
    routeId: "r1", assignee: "Thomas Vogel", raisedDay: -4, reason: "no time", upside: "10 people protected at the press",
    body: "We only stock one size. On smaller heads it slips, so people take it off at the loud press - exactly where they need it most.",
    seedEvents: [
      { type: "case.read", day: -4, actor: "Thomas Vogel" },
      { type: "case.asked", day: -3, actor: "Thomas Vogel", payload: { text: "How many people would need the small size, and roughly what does a pair cost?" } },
      { type: "case.answered", day: -2, actor: ME, payload: { text: "Four on our shift and six on nights. A pair in size S is about €25, so €250 covers everyone - well under the team's spending limit." } },
    ] },
  // Past the five-day promise without an answer: it moved to the deputy on its own.
  { id: "d3", kind: "idea", title: "Daylight lamps above the inspection table", from: ME, fromDept: LINE3,
    routeId: "r7", assignee: "Thomas Vogel", raisedDay: -8, reason: "no time", upside: "fewer scratches found by the customer",
    body: "The inspection table at the end of line 3 has one yellow ceiling light. Fine scratches only show in daylight, so the customer finds them instead of us.",
    seedEvents: [{ type: "case.read", day: -7, actor: "Thomas Vogel" }] },
];

// The employee's problem on the changeover sheet, with a conversation: handed to Quality, a question, an answer.
const SHEET: NonNullable<SeedCase["seedEvents"]> = [
  { type: "case.read", day: -3, actor: "Thomas Vogel" },
  { type: "case.handed", day: -2, actor: "Thomas Vogel", payload: { to: "Hans Sander", why: "The MES form is Quality's. Hans can decide whether the paper sheet can go." } },
  { type: "case.asked", day: -1, actor: "Hans Sander", payload: { text: "Which of the six values does the press already send to the MES on its own?" } },
  { type: "case.answered", day: -1, actor: ME, payload: { text: "Start time and clamp pressure. The other four we type in by hand: tool number, die height, first-part OK and operator ID." } },
];

const seed = renamed(SEED);
export const STATIC_DEMO_SEED: Seed = {
  ...seed,
  // He posts under his name here: no handle, so his name and profile show like everyone else's.
  personas: seed.personas.map((r) => (r.who.name === ME ? { ...r, who: { ...r.who, handle: null } } : r)),
  cases: [...seed.cases.map((c) => (c.id === "c3" ? { ...c, seedEvents: [...(c.seedEvents ?? []), ...SHEET] } : c)), ...IDEAS],
  briefs: renamed(BRIEFS),
};

// ── Earlier chats with the coach (the raise page's "Chats & drafts") ──────────────────────────────
// Each person's own, like the database's drafts. The employee's: three became the ideas above
// (published, linked to their cases), one is still a draft. The team lead and the manager have one
// draft each. The coach's words carry no scores, like the demo script's; the scores are the
// benchmark's own, worked out here.
const LEAD = "Thomas Vogel", BOSS = "Bernd Hartmann";
const CHATS: { owner: string; id: string; caseId: string | null; daysAgo: number; says: string[]; coach: string[] }[] = [
  { owner: ME, id: "dd1", caseId: "d1", daysAgo: 2,
    says: ["Move the shift handover notes onto a board by the line\n\nHandover notes live in a binder in the break room, so the next shift reads them after the first problem instead of before it.",
      "About ten minutes per handover - people ask around instead of reading the binder. A board at the line, filled in during the last ten minutes of the shift, gets read on the way in."],
    coach: ["It belongs to the shift plan, so your team lead can decide it. What I can't see yet is what it saves: how long does the next shift lose today before they know what happened?",
      "That makes it concrete: ten minutes at every handover, and a first step anyone can picture. It is ready to publish."] },
  { owner: ME, id: "dd2", caseId: "d2", daysAgo: 4,
    says: ["Ear defenders in two sizes at the press\n\nWe only stock one size. On smaller heads it slips, so people take it off at the loud press.",
      "Ten people across both shifts. A pair in size S is about €25."],
    coach: ["A safety point with a small spend - your team lead can say yes without anyone else. Who would need the other size, and roughly what would it cost?",
      "Clear, cheap and well inside the team's spending limit. It is ready to publish."] },
  { owner: ME, id: "dd3", caseId: "d3", daysAgo: 8,
    says: ["Daylight lamps above the inspection table\n\nThe table at the end of line 3 has one yellow ceiling light. Fine scratches only show in daylight, so the customer finds them instead of us.",
      "Two or three complaints a month, all from the final check. Two daylight lamps over the table would do it."],
    coach: ["This goes to whoever owns the line layout. What does it cost us today - how often do scratches come back from the customer?",
      "That is the number the person who decides needs. It is ready to publish."] },
  { owner: ME, id: "dd4", caseId: null, daysAgo: 1,
    says: ["A short safety walk with the night shift once a week\n\nThe night shift never sees the safety officer, so near misses at night are reported days later, if at all."],
    coach: ["Good point - the night shift is easy to forget. Who would walk with them, and what would they look at first? Name one round you could try next week."] },
  { owner: LEAD, id: "dl1", caseId: null, daysAgo: 1,
    says: ["Cross-train two setters per shift between line 3 and line 4\n\nWhen a setter is ill, line 3 waits for the one person who knows its fixtures. Two people per shift who can set up both lines would end that."],
    coach: ["This sits in the shift plan, so it goes to your head of production. What does a missing setter cost today - how often does the line wait, and for how long?"] },
  { owner: BOSS, id: "dm1", caseId: null, daysAgo: 3,
    says: ["Show the monthly scrap figures at every line\n\nScrap is reported to management, but the people at the lines never see the number they are measured on."],
    coach: ["A small change with a clear owner. Which number would you show first, and who updates the board each month?"] },
];

/** Everyone's chats as drafts in this browser, per person, dated from `now`. */
export function staticDemoDrafts(now: Date): Record<string, DraftView[]> {
  const ctx = ideaContext(STATIC_DEMO_SEED.routes, GOALS, []); // no cases: a published chat is not "already raised" by its own case
  const at = (daysAgo: number, minutes: number) => new Date(now.getTime() - daysAgo * 86_400_000 + minutes * 60_000).toISOString();
  const out: Record<string, DraftView[]> = {};
  for (const c of CHATS) {
    const turns: DraftTurn[] = [];
    c.says.forEach((text, i) => {
      turns.push({ id: c.id + "u" + i, role: "user", text, overall: null, at: at(c.daysAgo, i * 4) });
      const score = scoreDraft({ turns, affected: [], attachments: 0 }, ctx);
      turns.push({ id: c.id + "a" + i, role: "assistant", text: c.coach[i], overall: score.overall, at: at(c.daysAgo, i * 4 + 1) });
    });
    const score = scoreDraft({ turns, affected: [], attachments: 0 }, ctx);
    (out[c.owner] ??= []).push({
      id: c.id, title: c.says[0].split("\n")[0], status: c.caseId ? "published" : "draft", overall: score.overall,
      updatedAt: at(c.daysAgo, c.says.length * 4), caseId: c.caseId, scores: score.parts, affected: [], attachments: 0, turns,
    });
  }
  return out;
}
