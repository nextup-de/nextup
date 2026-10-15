// The prompt tokens of the raise start page. The description is stored as plain text; a *Label* run is a token.
// Adding a prompt is one line here: its label and the colour family it is drawn in (Raise.module.css, data-tone).

export type Tone = "orange" | "rose" | "violet" | "amber" | "blue" | "green" | "teal" | "grey";
export type Prompt = { label: string; tone: Tone };

export const PROMPTS: Prompt[] = [
  { label: "Impact", tone: "orange" },
  { label: "Who’s blocked", tone: "rose" },
  { label: "Already tried", tone: "violet" },
  { label: "Deadline", tone: "amber" },
  { label: "Who’s involved", tone: "blue" },
];

// Typed *text* that is not a known prompt is still a token, in a neutral colour.
export const toneOf = (label: string): Tone => PROMPTS.find((p) => p.label.toLowerCase() === label.trim().toLowerCase())?.tone ?? "grey";

export const TOKEN = /\*([^*\s](?:[^*\n]*[^*\s])?)\*/g; // no space just inside the asterisks, so "2 * 3 * 4" stays a sum

export type Part = { text: string } | { token: string };

// "a *Impact* b" -> [{text:"a "}, {token:"Impact"}, {text:" b"}]
export function parseParts(value: string): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (const m of value.matchAll(TOKEN)) {
    const label = m[1].trim();
    if (!label) continue;
    if (m.index > at) out.push({ text: value.slice(at, m.index) });
    out.push({ token: label });
    at = m.index + m[0].length;
  }
  if (at < value.length) out.push({ text: value.slice(at) });
  return out;
}

export const serializeParts = (parts: Part[]) => parts.map((p) => ("token" in p ? "*" + p.token + "*" : p.text)).join("");

export const hasToken = (value: string, label: string) => parseParts(value).some((p) => "token" in p && p.token.toLowerCase() === label.toLowerCase());
