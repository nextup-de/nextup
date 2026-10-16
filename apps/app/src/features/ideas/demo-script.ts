// The demo script (docs/IDEAS.md, "The demo page"): the conversation we show people on the static demo
// (app/demo - no company, no login, nothing leaves the browser). One prepared idea - the "reporting screen"
// sample - and one prepared answer for each of the eight topics the coach works through, with the coach's
// prepared reply to each: the same story every time, with no model in the loop. The presenter drives it
// from the demo controls (components/shell/DemoControls.tsx): fill the idea, fill the first two answers
// one by one, then the rest of the conversation in one go. The replies carry no numbers: the scores stay
// on the side (the analysis), computed by the benchmark as for any idea. Pure.
import { stripTags } from "@/features/assist/check";
import { splitUpdate, type DialKey, type Move, type Topic } from "./raise";

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

// The eight topics on the rail, in the order the coach asks them. Answer n clears topic n.
export const DEMO_TOPICS: readonly { id: string; label: string; ask: string }[] = [
  { id: "process", label: "Current process", ask: "Where does reporting get stuck today?" },
  { id: "scale", label: "Scale and impact", ask: "How much disruption do these recurring issues cause?" },
  { id: "owner", label: "Ownership", ask: "Who would take responsibility for following up each report?" },
  { id: "alternatives", label: "Existing alternatives", ask: "Could an existing reporting tool solve this?" },
  { id: "use", label: "Practical use", ask: "How would operators report an issue without interrupting assembly?" },
  { id: "cost", label: "Cost", ask: "What equipment and software would the pilot need?" },
  { id: "risks", label: "Risks", ask: "What could prevent reports from being acted on?" },
  { id: "success", label: "Pilot success", ask: "What result would justify expanding beyond one station?" },
];

export const DEMO_SCRIPT: readonly ScriptStep[] = [
  {
    label: "Sample idea",
    say: DEMO_IDEA.text,
    reply: "I can see the value here. The demo company already has reports of people flagging a problem and then being handed the fix. " +
      "A screen could make follow-up more visible, but it would still need a clear owner. Starting at one station seems sensible.\n\n" +
      "What still needs work is the current process, scale and impact, ownership, existing alternatives, practical use, cost, risks, and pilot success.",
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
      "Could an existing reporting tool solve this - is there something on the line already?",
  },
  {
    label: "Existing alternatives",
    say: "We have the booking terminals on the line, but they only take bookings and production data - there is no field for a problem or a status. " +
      "The quality system is only used by inspectors. IT said a form inside the booking system would take months, so a separate screen is faster to try.",
    reply: "Fair - the booking terminals have no place for it, and the quality system is not the operators’. It could feed the booking system later, but that should not hold up a trial.\n\n" +
      "How would operators report an issue without interrupting assembly?",
  },
  {
    label: "Practical use",
    say: "Three taps and done: the station is preset, you pick parts, tooling, instructions or other, and add a photo if you want. " +
      "It takes under 30 seconds and fits between cycles. With gloves on we need big buttons, so a tablet on a wall mount at the station.",
    reply: "Under 30 seconds between cycles keeps it out of the way of the work, and big buttons for gloves is the kind of detail that decides whether it gets used.\n\n" +
      "What equipment and software would the pilot need?",
  },
  {
    label: "Cost",
    say: "One rugged tablet with a wall mount, about €600, and a simple form in the forms tool we already have licences for. IT estimated two days to set it up.",
    reply: "That is well within what the team can approve on its own, so the trial needs no extra sign-off.\n\n" +
      "What could prevent reports from being acted on?",
  },
  {
    label: "Risks",
    say: "If owners do not respond, operators give up on it within a couple of weeks. So anything open for two days goes to the morning check, " +
      "and safety problems still go straight to the shift lead by voice, as today. If the tablet is down, we fall back to the whiteboard.",
    reply: "An escalation rule, safety kept on the fast path, and a fallback - that covers the ways this usually fails.\n\n" +
      "Last one: what result would justify expanding beyond one station?",
  },
  {
    label: "Pilot success",
    say: "Run it for four weeks at station 4 on line 3. If at least 80 % of reports get a status within two days and the repeat issues drop by half, " +
      "we roll it out to the rest of line 3, then to lines 1 and 2.",
    reply: "That makes it easy to decide: a four-week pilot at one station, a cost the team can approve, an owner for every problem type and a clear bar for rolling it out.\n\n" +
      "Everything on the right is answered. Publish it, and NextUp sends it to the person who can decide, with this analysis attached.",
  },
];

// The three checks the first feedback marks as improved (the ▲ on its gauges), of the five.
export const SCRIPT_FIRST_IMPROVED: DialKey[] = ["value", "feas", "risk"];

// What each answer moves, for the chat's AI analysis card under the coach's reply: one to three dials per
// step, so the card always shows something changed. Indexed like DEMO_SCRIPT (the idea itself, step 0,
// shows all the dials). The word on each dial and its reason still come from the real benchmark.
export const SCRIPT_MOVES: readonly Partial<Record<DialKey, Move>>[] = [
  {},
  { value: "up" }, // the handoff at shift change is the problem; the first reading has no fit evidence yet
  { value: "up", cost: "up" }, // 4 h a week gives a baseline
  { fit: "up", risk: "up" }, // an owner per problem type
  { feas: "up", fit: "up" }, // no existing tool does it
  { feas: "up" }, // three taps, under 30 seconds
  { cost: "up", feas: "up" }, // one tablet, two days of setup
  { risk: "up" }, // escalation rule and a fallback
  { value: "up", fit: "up", risk: "up" }, // a four-week pilot with a clear bar
];

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
