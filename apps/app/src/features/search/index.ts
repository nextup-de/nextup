// The search engine behind the top bar (⌘K). Port of the search half of legacy/demo/js/dashboard.js.
// Every token has to appear somewhere in the item's text ("hay"); title matches rank above body
// matches. Highlighting reuses the same tokens. Pure.
import type { ReducedCase, ReducedIdea, ReducedProblem } from "@/features/cases/reducer";
import type { Dept, Initiative } from "@/features/demo/types";
import { type DemoData, people } from "@/features/metrics";
import { deptName, plural } from "@/lib/utils/format";

export const normalizeSearch = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const tokens = (q: string) => normalizeSearch(q || "").split(/\s+/).filter(Boolean);
export const hits = (hay: string, toks: string[]) => toks.every((t) => hay.includes(t));

export type Part = { t: string; hit: boolean };

export function highlight(text: string, toks: string[]): Part[] {
  if (!toks.length || !text) return [{ t: text || "", hit: false }];
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(" + toks.map(esc).join("|") + ")", "ig");
  const isHit = new RegExp("^(" + toks.map(esc).join("|") + ")$", "i");
  return String(text).split(re).filter((x) => x !== "").map((x) => ({ t: x, hit: isHit.test(x) }));
}

export const ownerLabel = (o: string) => (o === "none" ? "No owner" : o === "trial" ? "Fix in trial" : "Ideas submitted");

export const problemHay = (p: ReducedProblem, depts: readonly Dept[]) =>
  [p.title, p.sub, p.detail, p.trend, p.age, ownerLabel(p.owner), p.depts.map((d) => deptName(depts, d)).join(" "),
    p.signals.map((x) => x.by + " " + x.quote).join(" ")].join(" ").toLowerCase();

export const ideaHay = (i: ReducedIdea, problems: readonly ReducedProblem[], depts: readonly Dept[]) => {
  const pr = problems.find((p) => p.id === i.problem);
  return [i.title, i.rationale, i.status, i.proposedBy, i.expected, i.upside, i.effort, i.team.join(" "), pr?.title ?? "",
    (pr?.depts ?? []).map((d) => deptName(depts, d)).join(" ")].join(" ").toLowerCase();
};

export const teamHay = (t: Initiative, depts: readonly Dept[]) =>
  [t.name, t.why, t.status, t.stage, t.depts.map((d) => deptName(depts, d)).join(" "), t.members.map((m) => m.name + " " + m.role).join(" ")].join(" ").toLowerCase();

export const caseHay = (c: ReducedCase) => [c.title, c.from, c.fromDept, c.body, c.reason].filter(Boolean).join(" ").toLowerCase();

export type ResultKind = "Problem" | "Idea" | "Team" | "Case" | "Person";
export type ResultView = "problems" | "ideas" | "collaboration" | "leader" | "dashboard" | "people";
export type SearchItem = { kind: ResultKind; group: number; title: string; sub: string; hay: string; right: string; go: { view: ResultView; id: string } | null };

export const GROUP_NAMES = ["Problems", "Ideas", "Teams", "Your inbox", "People"];

// `cases` is the list the current person may see in search (their open inbox).
export function buildIndex(D: DemoData, cases: readonly ReducedCase[], depts: readonly Dept[], allProblems: readonly ReducedProblem[]): SearchItem[] {
  const idx: SearchItem[] = [];
  D.problems.forEach((p) => idx.push({ kind: "Problem", group: 0, title: p.title, sub: p.sub, hay: problemHay(p, depts), right: p.people + " people", go: { view: "problems", id: p.id } }));
  D.ideas.forEach((i) => idx.push({ kind: "Idea", group: 1, title: i.title, sub: "solves: " + (allProblems.find((p) => p.id === i.problem)?.title ?? "—"),
    hay: ideaHay(i, allProblems, depts), right: i.status, go: { view: "ideas", id: i.id } }));
  D.initiatives.forEach((t) => idx.push({ kind: "Team", group: 2, title: t.name, sub: t.why, hay: teamHay(t, depts), right: t.status, go: { view: "collaboration", id: t.id } }));
  cases.forEach((c) => idx.push({ kind: "Case", group: 3, title: c.title, sub: "from " + c.from, hay: caseHay(c), right: c.clock + " d", go: { view: "leader", id: c.id } }));
  people(D).forEach((pe) => {
    const where = [pe.teams.length ? plural(pe.teams.length, "team") : "", pe.ideas.length ? plural(pe.ideas.length, "idea") : ""].filter(Boolean).join(" · ");
    idx.push({ kind: "Person", group: 4, title: pe.name, sub: [pe.roles[0] ?? "", where].filter(Boolean).join(" · "),
      hay: (pe.name + " " + pe.roles.join(" ")).toLowerCase(), right: pe.teams.length ? "open team" : pe.ideas.length ? "open idea" : "",
      go: pe.teams.length ? { view: "collaboration", id: pe.teams[0] } : pe.ideas.length ? { view: "ideas", id: pe.ideas[0] } : null });
  });
  return idx;
}

// One small typo is tolerated for words of four or more characters.
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

// At most `perGroup` per group and `total` in all, best first (4 and 10: the top bar's grouped list).
export function runSearch<T extends SearchItem>(idx: readonly T[], q: string, { perGroup: cap = 4, total = 10 } = {}): T[] {
  const toks = tokens(q);
  if (!toks.length) return [];
  const phrase = toks.join(" ");
  const scored = idx.flatMap((x) => {
    const title = normalizeSearch(x.title), sub = normalizeSearch(x.sub);
    const hay = normalizeSearch([x.title, x.sub, x.right, x.hay].join(" "));
    const words = hay.split(" ");
    let typos = 0;
    for (const token of toks) {
      if (hay.includes(token)) continue;
      if (token.length < 4 || !words.some((word) => oneEdit(token, word))) return [];
      typos++;
    }
    let score = title === phrase ? 80 : title.startsWith(phrase) ? 50 : title.includes(phrase) ? 35 : 0;
    for (const token of toks) {
      if (title.split(" ").includes(token)) score += 15;
      else if (title.includes(token)) score += 10;
      else if (sub.includes(token)) score += 4;
    }
    return [{ x, score: score - typos * 100 }];
  }).sort((a, b) => b.score - a.score || a.x.group - b.x.group || a.x.title.localeCompare(b.x.title));
  const perGroup: Record<number, number> = {};
  return scored.filter(({ x }) => {
    perGroup[x.group] = (perGroup[x.group] ?? 0) + 1;
    return perGroup[x.group] <= cap;
  }).slice(0, total).map(({ x }) => x);
}
