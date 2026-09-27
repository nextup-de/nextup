// The search engine behind the top bar (⌘K). Port of the search half of legacy/demo/js/dashboard.js.
// Every token has to appear somewhere in the item's text ("hay"); title matches rank above body
// matches. Highlighting reuses the same tokens. Pure.
import type { ReducedCase, ReducedIdea, ReducedProblem } from "@/features/cases/reducer";
import type { Dept, Initiative } from "@/features/demo/types";
import { type DemoData, people } from "@/features/metrics";
import { deptName, plural } from "@/lib/utils/format";

export const tokens = (q: string) => (q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
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
export type ResultView = "problems" | "ideas" | "collaboration" | "leader";
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

export function runSearch(idx: readonly SearchItem[], q: string): SearchItem[] {
  const toks = tokens(q);
  if (!toks.length) return [];
  const lower = q.trim().toLowerCase();
  const scored = idx.filter((x) => hits(x.hay, toks)).map((x) => {
    const t = x.title.toLowerCase();
    let score = 0;
    if (t === lower) score += 40;
    else if (t.indexOf(lower) === 0) score += 24;
    else if (t.includes(lower)) score += 16;
    toks.forEach((k) => { if (t.includes(k)) score += 6; else if (x.sub.toLowerCase().includes(k)) score += 2; });
    return { x, score };
  }).sort((a, b) => b.score - a.score || a.x.group - b.x.group);
  // at most 4 per group, 10 in total, best first
  const perGroup: Record<number, number> = {};
  const out: SearchItem[] = [];
  scored.forEach(({ x }) => {
    perGroup[x.group] = (perGroup[x.group] ?? 0) + 1;
    if (perGroup[x.group] <= 4 && out.length < 10) out.push(x);
  });
  return out;
}
