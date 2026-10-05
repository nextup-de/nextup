// The idea coach: after each message the idea is re-read and benchmarked, and the coach answers
// with what got better and ONE challenging question aimed at the weakest bar - the
// feedback ⇄ develop loop from the whiteboard. Pure.
//
// coachMock() is the reply when no model is configured (demo, e2e, local); coachBrief() is what
// a model is told in coach mode (features/assist/prompt.ts), so both answer the same question.
import { SITE } from "@/config/site";
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import { deltas, weakest, type Benchmark } from "./benchmarks";

export const IDEA_PROMPT_VERSION = "idea-coach-v1";

const TITLE_MAX = 140;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

// Keyboard mashing ("jd klafkhdjahjsdhf ajsdhljf"): at least half of its longer words carry five
// or more consonant sounds in a row, which real English and German words almost never do once
// "sch", "ch", "th" and "ng" count as one ("strengths", "Rüstzeit" pass).
const MASHED = /[bcdfghjklmnpqrstvwxzß]{5,}/;
const mashed = (w: string) => MASHED.test(w.replace(/sch|ch|th|ng|ck/g, "c"));
export function isGibberish(text: string): boolean {
  const long = text.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? [];
  if (long.length === 0) return false;
  return long.filter(mashed).length / long.length >= 0.5;
}

// The idea as it stands: the first paragraph of the first message is the title, everything the
// author wrote after it (the context under that line, later answers) is the body. The coach's own
// words are never part of the idea - only the author's - and neither is a message that is only
// keyboard mashing, so it cannot move the score.
export function ideaFromTurns(turns: readonly Turn[]): { title: string; body: string; text: string } {
  const mine = turns.filter((t) => t.role === "user").map((t) => stripTags(t.text).trim()).filter(Boolean);
  const [head = "", ...more] = (mine[0] ?? "").split(/\n\s*\n/);
  const title = clip(head.trim(), TITLE_MAX);
  const later = mine.slice(1).filter((m) => !isGibberish(m)).join("\n");
  const body = [isGibberish(mine[0] ?? "") ? "" : more.join("\n\n").trim(), later].filter(Boolean).join("\n");
  const text = [isGibberish(mine[0] ?? "") ? "" : (mine[0] ?? ""), later].filter(Boolean).join("\n");
  return { title, body, text };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// "12 points to publish" / "Ready to publish".
export function toGo(overall: number, threshold: number): string {
  const n = threshold - overall;
  return n <= 0 ? "Ready to publish" : n + (n === 1 ? " point" : " points") + " to publish";
}

// The gaps as nouns ("a number on the upside") and, per bar, why the person who decides will ask
// for it - so the coach can explain the question instead of only posing it. Keyed by the start
// of the `missing` hint in benchmarks.ts.
const GAPS: [string, string][] = [
  ["Which company goal", "which company goal it serves"],
  ["Which number would move", "which number it would move"],
  ["How far would it move", "how far that number would move"],
  ["Put a number on the upside", "a number on the upside"],
  ["Add who else it helps", "who else it helps"],
  ["Does it help one team", "how far it reaches - one team, or every shift"],
  ["Attach a photo", "a photo or screenshot as evidence"],
  ["Who would decide", "who would decide it"],
  ["Roughly what would it cost", "roughly what it costs"],
  ["What is the smallest first step", "a first small step"],
  ["Say a little more", "what exactly would change"],
  ["Why does it matter", "why it matters"],
  ["Who works differently", "who works differently afterwards"],
];
const gap = (missing: string) => GAPS.find(([k]) => missing.startsWith(k))?.[1] ?? lowerFirst(missing.replace(/[?.]$/, ""));

// Why the person who decides will ask for each gap - keyed like GAPS, so the sentence fits the
// question, not just the bar.
const WHY_ASK: [string, string][] = [
  ["Which company goal", "The person who decides reads this line first: an idea tied to a goal they already report on gets a slot in the next planning round, one that is not gets parked as “nice to have”."],
  ["Which number would move", "A goal is a direction; the number is how anyone will know in three months whether the idea worked - scrap rate, minutes per changeover, days until a login exists."],
  ["How far would it move", "Even a rough share - a fifth, a third, half - tells the person who decides whether this is a quick win or the big lever, and they plan the two very differently."],
  ["Put a number on the upside", "A number is what turns an opinion into a case. It does not have to be exact - a rough figure with how you got to it is worth more than a precise one nobody believes."],
  ["Add who else it helps", "One person's idea is an opinion; three names next to it are a pattern, and a pattern gets a slot in the next team meeting. Add them under Affected on the right."],
  ["Does it help one team", "The same fix on one station is a favour; on every shift it is a change to how the line runs, and that is what earns a decision rather than a shrug."],
  ["Attach a photo", "A photo of the sheet, the queue or the workaround says in one look what three paragraphs cannot, and it is the thing that gets forwarded."],
  ["Who would decide", "An idea without an owner goes to the triage desk and waits; name the area it belongs to and it lands on one desk with a date on it."],
  ["Roughly what would it cost", "Under the team limit it is a yes or no from your lead; above it, it needs a sign-off. That is the difference between next week and next quarter, so a ballpark is enough."],
  ["What is the smallest first step", "Ideas get published when the person who decides can say yes without asking anyone else, so the smallest version they could say yes to next week is worth more than the full rollout."],
  ["Say a little more", "Whoever reads this has not stood at your station. If they can picture what changes on a normal Tuesday, they can decide; if they have to guess, they will ask you and lose a week."],
  ["Why does it matter", "Whoever reads this has not felt the wait. Say what happens today without the change - people decide on the pain, not on the fix."],
  ["Who works differently", "A change is what someone does differently on Monday. Name the role - the operator, the shift lead, the apprentice - and the idea becomes something people can picture."],
  ["Already raised", "Two versions of the same idea split the votes; one with both names on it gets decided."],
];
const whyAsk = (missing: string) => WHY_ASK.find(([k]) => missing.startsWith(k))?.[1] ?? "";

// "it serves “…”, the owner of “…” would decide it, and nothing like it has been raised before"
function seen(b: Benchmark): string {
  const facts: string[] = [];
  for (const p of b.parts) for (const f of p.found) {
    if (f.startsWith("Serves")) facts.push("it serves " + f.slice(7));
    else if (f.startsWith("Decided by")) facts.push(f.slice(11) + " would decide it");
    else if (f === "Upside has a number") facts.push("the upside has a number");
    else if (f === "Names a first step") facts.push("it names a first step");
    else if (f === "Says why") facts.push("it says why it matters");
    else if (f === "Not raised before") facts.push("nothing like it has been raised before");
    else if (f.endsWith("affected")) facts.push(f.replace(" more", "").replace(" affected", " besides you") + (f.startsWith("1 ") ? " is" : " are") + " affected");
  }
  return list(facts.slice(0, 4));
}
// A `found` fact as "the idea now …": "Upside has a number" -> "puts a number on the upside".
const GAINED: [string, string][] = [
  ["Serves ", "serves "], ["Names what it measures", "names what it measures"], ["Puts a figure on the goal", "puts a figure on the goal"],
  ["Upside has a number", "puts a number on the upside"], ["Reaches beyond one person", "reaches beyond one person"], ["Evidence attached", "has evidence attached"],
  ["Decided by", "is decided by"], ["No spend needed", "needs no spend"], ["Within team authority", "stays within team authority"], ["Above team authority", "names its cost"], ["Names a first step", "names a first step"],
  ["Not raised before", "is new"], ["Described in more than a line", "is described in more than a line"], ["Detailed", "is detailed"], ["Says why", "says why it matters"], ["Says who it is for", "says who it is for"],
];
function gained(found: string): string {
  const hit = GAINED.find(([k]) => found.startsWith(k));
  if (hit) return hit[1] + (hit[0].endsWith(" ") ? found.slice(hit[0].length) : hit[0] === "Decided by" ? found.slice(10) : "");
  return found.endsWith("affected") ? "names " + found.replace(" more", "").replace(" affected", "") + " it helps" : lowerFirst(found);
}
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

// `said` is the message just sent; `offers` is how many suggested answers the page shows under it.
// Two or three short paragraphs: what the benchmarks can see now, then the one question and why
// the person who decides will ask it.
export function coachMock(prev: Benchmark | null, now: Benchmark, threshold: number, said = "", offers = 0): string {
  const d = deltas(prev, now);
  const w = weakest(now);
  const again = prev !== null && d.overall <= 0 && w !== null && weakest(prev)?.missing[0] === w.missing[0];
  const left = threshold - now.overall;
  const gaps = list(now.parts.map((p) => p.missing[0]).filter((m): m is string => !!m && !m.startsWith("Already raised")).map(gap).slice(0, 3));
  const read: string[] = [];

  if (said && isGibberish(said)) {
    read.push(`That looks like a slip of the keyboard, so I left it out of the idea - it still stands at ${now.overall} of 100.`);
  } else if (!prev) {
    read.push(`First read: ${now.overall} of 100. ${now.overall >= threshold ? "That is already enough to publish." : `It needs ${threshold} to publish, so there are ${left} points to find.`}`);
    const s = seen(now);
    if (s) read.push(`What the benchmarks can already see: ${s}.`);
    if (gaps) read.push(`What they cannot see yet: ${gaps}.`);
  } else if (d.overall > 0) {
    const best = now.parts.reduce((b, p) => (d[p.id] > d[b.id] ? p : b), now.parts[0]);
    const was = new Set(prev.parts.find((p) => p.id === best.id)?.found ?? []);
    const why = best.found.filter((f) => !was.has(f)).map(gained).slice(0, 2);
    read.push(`Up ${d.overall} to ${now.overall} - ${best.label.toLowerCase()} got stronger${why.length ? ", because the idea now " + list(why) : ""}.`);
    if (left > 0) read.push(`${left} more ${left === 1 ? "point" : "points"} and it can go to the person who decides${gaps ? "; still open: " + gaps : ""}.`);
    else read.push(`That is over the line - it can be published as it is, and every message from here only sharpens it.`);
  } else {
    read.push(`Still at ${now.overall}. I read that, but the four benchmarks only move on things they can check - a goal, a number, a decider, a first step - and there was none of that in it${gaps ? ". Still open: " + gaps : ""}.`);
  }
  // Said once, when the match first appears; the chip and the side panel keep showing it.
  if (now.sameAs && !prev?.sameAs) read.push(`One more thing: something close is already raised, “${now.sameAs.title}”. You can co-sign it instead, or say in a sentence what is different about yours.`);

  const ask: string[] = [];
  if (w && again) {
    ask.push(`I still need this: ${lowerFirst(w.missing[0])}${offers ? " Pick a suggested answer below and edit it so it is true for your line, or write your own." : ""}`);
  } else if (w) {
    ask.push(`${w.label} is the weakest bar at ${w.value}. ${w.missing[0]}`);
    ask.push(whyAsk(w.missing[0]) + (offers ? (prev ? " There are suggested answers below - edit one before you send it." : " There are suggested answers below to start from.") : ""));
  } else if (now.overall >= threshold) {
    ask.push(`Ready when you are - publish it and ${SITE.name} routes it to the person who can decide, with the four benchmarks attached so they see the case the way you built it.`);
  }
  return [read.join(" "), ask.join(" ")].filter(Boolean).join("\n\n");
}

// What a model is told in coach mode: the numbers it may not change and the one gap to ask about.
export function coachBrief(now: Benchmark, threshold: number): string {
  const w = weakest(now);
  const bars = now.parts.map((p) => `- ${p.label}: ${p.value}/100${p.missing.length ? " (missing: " + p.missing.join("; ") + ")" : ""}`).join("\n");
  return [
    `The idea scores ${now.overall}/100; it can be published at ${threshold}. The scores are computed, not yours to change - never state a different number.`,
    bars,
    now.sameAs ? `A close match is already raised: "${now.sameAs.title}". Mention it and suggest co-signing.` : "",
    w ? `Ask exactly one short, challenging question that would raise "${w.label}". Do not answer it yourself.` : "Tell them it is ready to publish.",
  ].filter(Boolean).join("\n");
}
