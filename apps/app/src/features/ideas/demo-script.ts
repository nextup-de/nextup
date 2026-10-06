// The demo script (docs/IDEAS.md, "The demo page"): the conversation we show people on the static demo
// (app/demo - no company, no login, nothing leaves the browser). One prepared idea and two prepared
// answers, each one click away in the composer, and the coach's prepared reply to each - the same story
// every time, with no model in the loop. The replies carry no numbers: the scores stay on the side (the rail, the analysis),
// computed by the benchmark as for any idea. tests/unit/ideas-demo-script.test.ts checks that what the
// replies say still matches the benchmark. Pure.
import { stripTags } from "@/features/assist/check";
import { splitUpdate } from "./raise";

type Turn = { role: "user" | "assistant"; text: string };
export type ScriptStep = { label: string; say: string; reply: string };

// How long the coach thinks before a prepared reply, so it reads like one being written.
export const SCRIPT_THINK_MS = 2500;

export const DEMO_SCRIPT: readonly ScriptStep[] = [
  {
    label: "Prepared idea",
    say: "A shared setup cart for line 3, so a changeover never waits for tools",
    reply: "I checked it against the company goals, the routing map and every open case. It serves “Every changeover under 20 minutes”, " +
      "and the owner of fixtures, tooling and line layout would decide it.\n\n" +
      "What I can’t see yet is how big the problem is. How much time does a changeover on line 3 lose today waiting for tools, " +
      "and is it one shift or all of them? A rough number, with how you got to it, is worth more than a precise one nobody believes.",
  },
  {
    label: "Next answer",
    say: "Every changeover on line 3 loses about 20 minutes because the setter walks to the tool crib for clamps, gauges and sockets. " +
      "It happens on all three shifts, around six changeovers a day - roughly two hours of line time lost every day.",
    reply: "That number did the work. Twenty minutes on six changeovers a day is two hours of line time, on every shift, " +
      "and minutes per changeover is exactly what the changeover goal is measured on. It is over the publish line now.\n\n" +
      "One thing would make it an easy yes: what is the smallest first step? A one-week trial on one line is something your team lead " +
      "can approve next week, without a budget meeting.",
  },
  {
    label: "Last answer",
    say: "First step: a one-week trial with one cart on line 3, stocked with spare tools maintenance already has, so it costs nothing. " +
      "If changeovers drop under 20 minutes, lines 1 and 2 get a cart too.",
    reply: "That makes it easy to approve: a one-week trial with tools you already have needs no budget and no sign-off, " +
      "so your team can decide it on its own.\n\n" +
      "Two points are still open - who else it helps, and a photo of the walk to the tool crib - but neither blocks it. " +
      "It is ready: publish it, and NextUp sends it to the person who can decide, with this analysis attached.",
  },
];

// The case the script publishes: what the conversation found, as the main points - the case view shows
// the first paragraph as the idea, the second as its context, and every "*Label*" line as a fact
// (features/ideas/brief.ts splitBody). `upside` is what the case says it is worth.
export const DEMO_CASE = {
  upside: "≈ 2 h of line time a day",
  body: "Every changeover on line 3 loses about 20 minutes: the setter walks to the tool crib for clamps, gauges and sockets.\n\n" +
    "It happens on all three shifts, around six changeovers a day. A shared cart at the line, stocked once with what a changeover needs, ends the walk.\n\n" +
    "*Goal* Every changeover under 20 minutes\n" +
    "*First step* A one-week trial with one cart on line 3\n" +
    "*Cost* None - spare tools maintenance already has, no sign-off needed\n" +
    "*Then* Lines 1 and 2 get a cart too if changeovers drop under 20 minutes\n" +
    "*Still open* Who else it helps, and a photo of the walk to the tool crib",
};

// What the desk does with the script's case on its own, a few seconds after it is published (the static
// demo's frame, components/demo/StaticDemo.tsx): it reads it and asks one question, so the case shows
// the conversation - and "Your move" - without anyone switching person.
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
 * idea, DEMO_SCRIPT.length once all three are said), or -1 once they wrote something of their own.
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
