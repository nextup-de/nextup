// The demo script (docs/IDEAS.md, "The demo page"): the conversation we show people on the static demo
// (app/demo - no company, no login, nothing leaves the browser). One prepared idea - the "reporting screen"
// sample - and one prepared answer for each of the three topics the coach works through, with the coach's
// prepared reply to each: the same story every time, with no model in the loop. The presenter drives it
// from the demo controls (components/shell/DemoControls.tsx): fill the idea, fill the first two answers
// one by one, then the rest of the conversation in one go. The replies carry no numbers: the scores stay
// on the side (the analysis), computed by the benchmark as for any idea. Pure.
import { stripTags } from "@/features/assist/check";
import { splitUpdate, type Dial, type DialKey, type Move, type Topic } from "./raise";

type Turn = { role: "user" | "assistant"; text: string };
export type ScriptStep = { label: string; say: string; reply: string };

// How long the coach thinks before a prepared reply, so it reads like one being written.
export const SCRIPT_THINK_MS = 2500;

// The idea as the start page is filled with it: the headline, what more there is to say under it, who
// it affects and two placeholder attachments. The Feed has its own cover for it (features/cases/thumbs.ts).
export const DEMO_IDEA = {
  text: "A reporting screen at each assembly station",
  ctx: "We should put a simple reporting screen at each assembly station so operators can flag recurring problems as they happen, like missing parts, awkward tools, or unclear instructions. The reports would go directly to the team responsible, and operators could see what is being done about them.\n" +
    "Right now operators tell their shift lead or write problems on the whiteboard at the end of the line. A lot of it gets lost at shift change, and the same issues keep coming back week after week. Nobody on the line knows if anyone picked a problem up. The screen would only need a few taps: choose the station, the type of problem (parts, tooling, instructions, other), add a short note or photo, and send. Each report would then show its status, like received, being looked at, or fixed, so operators know it was not ignored.\n" +
    "Impact: Make recurring problems on the car assembly line visible and easier to follow up across shifts\n" +
    "Who’s blocked: Assembly operators who raise issues but cannot see who is handling them or what happens next\n" +
    "Trial: Start at one assembly station before rolling it out across the line",
  aff: ["Production", "Quality", "Engineering"],
  files: ["assembly-station-issues.xlsx", "reporting-screen-sketch.pdf"],
};

// The three topics on the rail, in the order the coach asks them. Answer n clears topic n.
export const DEMO_TOPICS: readonly { id: string; label: string; ask: string }[] = [
  { id: "process", label: "Current process", ask: "Where does reporting get stuck today?" },
  { id: "scale", label: "Scale and impact", ask: "How much disruption do these recurring issues cause?" },
  { id: "owner", label: "Ownership", ask: "Who would take responsibility for following up each report?" },
];

export const DEMO_SCRIPT: readonly ScriptStep[] = [
  {
    label: "Sample idea",
    say: DEMO_IDEA.text,
    reply: "I can see the value here. The demo company already has reports of people flagging a problem and then being handed the fix. " +
      "A screen could make follow-up more visible, but it would still need a clear owner. Starting at one station seems sensible.\n\n" +
      "What still needs work is the current process, scale and impact, and ownership.",
  },
  {
    label: "First answer",
    say: "Mostly at shift change. Operators tell the shift lead or write it on the whiteboard at the end of the line, and the lead passes it on from memory. " +
      "The board gets wiped every Friday, so anything nobody picked up by then is gone. Last week a missing bracket at station 4 was reported on two shifts, " +
      "and neither knew the other had already flagged it.",
    reply: "So the report exists - it just loses its owner when the shift ends. That is the handoff to fix, not the reporting itself.\n\n" +
      "Next, how big is it? How much disruption do these recurring issues cause - roughly how often, and what does one cost in time?",
  },
  {
    label: "Second answer",
    say: "On line 3 we see about 15 recurring issues a week across the three shifts. Each one costs 10 to 20 minutes - a missing part, hunting for the right tool, " +
      "or finding someone to explain an instruction. That is roughly 4 hours of line time a week, and the same few problems come back because nobody closes them.",
    reply: "Four hours a week on one line is a clear baseline, and it gives a trial something to beat. It also shows the cost is in the repeats, not the first report.\n\n" +
      "Who would take responsibility for following up each report?",
  },
  {
    label: "Third answer",
    say: "Each problem type gets a fixed owner: parts go to logistics, tooling to maintenance, instructions to the line engineer. " +
      "Thomas Vogel checks the open list every morning and reassigns anything older than two days. Whoever reports it is not the owner - they just get the updates.",
    reply: "That answers the biggest worry. Reporting stays separate from fixing, and an owner per type means nothing lands on nobody - " +
      "which is also what people in this company keep asking for.\n\n" +
      "Everything on the right is answered. Publish it, and NextUp sends it to the person who can decide, with this analysis attached.",
  },
];

// What each answer moves, for the chat's AI analysis card under the coach's reply: two changes after the first
// answer, three after the second, one after the third. Indexed like DEMO_SCRIPT (the idea itself, step 0, shows
// all the dials, SCRIPT_READS[0]).
export const SCRIPT_MOVES: readonly Partial<Record<DialKey, Move>>[] = [
  {},
  { value: "up", feas: "up" }, // the handoff at shift change is the problem
  { value: "up", cost: "up", feas: "up" }, // 4 h a week gives a baseline
  { risk: "up" }, // an owner per problem type
];

// The five checks as the demo shows them after the idea (very low: nothing is known yet) and after each answer,
// so what moves is the script's, not whatever the benchmark makes of the text. Entry k is the reading after k
// answers; a dial an answer does not move keeps its value and words.
type Reading = Record<DialKey, { value: number; note: string }>;
const R0: Reading = {
  value: { value: 25, note: "Upside is a claim so far: nothing says how often it happens or what it costs." },
  feas: { value: 20, note: "Unclear how a report would reach an owner, or who would fix it." },
  cost: { value: 30, note: "No cost named yet: the screen, the setup and the time are all open." },
  fit: { value: 12, note: "Nothing found yet that ties it to a company goal." },
  risk: { value: 30, note: "Higher risk: no owner, no fallback and no safety check named." },
};
const R1: Reading = {
  ...R0,
  value: { value: 55, note: "The problem is clearer: a report loses its owner at shift change. How big it is is still open." },
  feas: { value: 50, note: "A handoff fix is small to try at one station, but who owns it is still open." },
};
const R2: Reading = {
  ...R1,
  value: { value: 78, note: "About 15 issues a week and 4 hours of line time: a baseline a trial can beat." },
  feas: { value: 72, note: "Doable at one station: the cost is in the repeats, not in the first report." },
  cost: { value: 62, note: "The cost of doing nothing is known (about 4 hours a week); the pilot's own cost is still open." },
};
const R3: Reading = {
  ...R2,
  risk: { value: 74, note: "Low risk: a fixed owner for each problem type, so nothing lands on nobody." },
};
export const SCRIPT_READS: readonly Reading[] = [R0, R1, R2, R3];

/** The overall score the script reads after `answers` answers: the mean of its five checks, for the advice. */
export function scriptOverall(answers: number): number {
  const r = SCRIPT_READS[Math.min(answers, SCRIPT_READS.length - 1)];
  const v = Object.values(r).map((x) => x.value);
  return v.reduce((n, x) => n + x, 0) / v.length;
}

/** The dials as the script reads them after `answers` answers; the benchmark's own where the script ends. */
export function scriptDials(answers: number, dials: readonly Dial[]): Dial[] {
  const r = SCRIPT_READS[Math.min(answers, SCRIPT_READS.length - 1)];
  return dials.map((d) => ({ ...d, scored: true, value: r[d.key].value, note: r[d.key].note }));
}

// The answers the demo controls fill one by one; the rest of the conversation comes in one go after them.
export const FILLED_ANSWERS = 2;

// The case the script publishes: what the conversation found, as the main points - the case view shows
// the first paragraph as the idea, the second as its context, and every "*Label*" line as a fact
// (features/ideas/brief.ts splitBody). `upside` is what the case says it is worth.
export const DEMO_CASE = {
  upside: "≈ 4 h of line time a week",
  body: "A tablet at each assembly station: an operator reports a recurring problem in three taps, it goes to a fixed owner for that kind of problem, " +
    "and the status shows on the screen so nobody wonders whether it was picked up.\n\n" +
    "Today problems go to the shift lead or onto the whiteboard and get lost at shift change. On line 3 about 15 issues a week keep coming back.\n\n" +
    "*Cost today* About 15 recurring issues a week, roughly 4 hours of line time\n" +
    "*Owners* Logistics for parts, maintenance for tooling, the line engineer for instructions; the team lead checks the open list every morning\n" +
    "*First step* A four-week pilot at station 4 on line 3\n" +
    "*Cost* About €600 for a rugged tablet; the forms tool is already licensed; two days of IT setup\n" +
    "*Then* The rest of line 3, then lines 1 and 2, if 80 % get a status within two days and repeats halve",
};

// What the desk did with the script's case on its own, a few seconds after it was published. The demo
// no longer does it (the player, components/demo/LoopPlayer.tsx, plays the desk's side step by step; it
// made the inbox show the idea as already read), but the loop test still uses the text.
export const DESK_REPLY = {
  afterMs: 8000,
  text: "Good catch - I have watched that walk to the crib myself. Which tools go on the cart first? Send me the list and I will ask maintenance for the spares today.",
};

// One message as the script compares it: what the author said (not idea edits travelling along), and
// for the idea itself only its first paragraph - the context and choices added under it may vary.
const norm = (text: string, first: boolean) => {
  const said = stripTags(splitUpdate(text).said).trim();
  return (first ? said.split(/\n\s*\n/)[0] : said).replace(/\s+/g, " ").trim().toLowerCase();
};

/**
 * Where a conversation stands in the script: the index of the step the author says next (0 before the
 * idea, DEMO_SCRIPT.length once all of it is said), or -1 once they wrote something of their own.
 */
export function scriptStep(turns: readonly Turn[]): number {
  const said = turns.filter((t) => t.role === "user");
  if (said.length > DEMO_SCRIPT.length) return -1;
  return said.every((t, i) => norm(t.text, i === 0) === norm(DEMO_SCRIPT[i].say, i === 0)) ? said.length : -1;
}

/** The prepared reply when `text` is the script's next step after `before`; null when it is not. */
export function scriptReply(before: readonly Turn[], text: string): string | null {
  const i = scriptStep(before);
  if (i < 0 || i >= DEMO_SCRIPT.length) return null;
  return norm(text, i === 0) === norm(DEMO_SCRIPT[i].say, i === 0) ? DEMO_SCRIPT[i].reply : null;
}

/** The rail while the conversation follows the script: the topics answered so far are clear, the next one is asked. */
export function scriptRail(at: number): Topic[] {
  const answered = Math.max(0, at - 1);
  return DEMO_TOPICS.map((t, i) => ({ ...t, status: i < answered ? "clear" : i === answered ? "active" : "open" }));
}
