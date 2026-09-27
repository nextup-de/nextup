// The org chart and who-works-with-whom, as pure functions over the seed rows. The collaboration
// page draws what comes out of here; nothing in this file knows about React or SVG.
import type { Initiative, OrgPerson } from "@/features/demo/types";

export type TreeNode = { person: OrgPerson; depth: number; x: number; y: number };
export type TreeEdge = { from: string; to: string };
export type TreeLayout = { nodes: TreeNode[]; edges: TreeEdge[]; cols: number; rows: number };

// Classic top-down layout: leaves take consecutive columns, a parent sits over the middle of its
// children. x/y are grid units (column, depth); the caller scales them to pixels.
export function layoutTree(people: readonly OrgPerson[]): TreeLayout {
  const names = new Set(people.map((p) => p.name));
  const kids = new Map<string | null, OrgPerson[]>();
  for (const p of people) {
    const parent = p.reportsTo !== null && names.has(p.reportsTo) ? p.reportsTo : null;
    kids.set(parent, [...(kids.get(parent) ?? []), p]);
  }
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  let next = 0, rows = 0;
  const place = (p: OrgPerson, depth: number): number => {
    rows = Math.max(rows, depth + 1);
    const children = kids.get(p.name) ?? [];
    let x: number;
    if (children.length === 0) x = next++;
    else {
      const xs = children.map((c) => { edges.push({ from: p.name, to: c.name }); return place(c, depth + 1); });
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    nodes.push({ person: p, depth, x, y: depth });
    return x;
  };
  for (const root of kids.get(null) ?? []) place(root, 0);
  return { nodes, edges, cols: Math.max(next, 1), rows };
}

// Initiatives a person is on (anonymous members never match an OrgPerson).
export const projectsOf = (initiatives: readonly Initiative[], name: string) =>
  initiatives.filter((t) => t.members.some((m) => m.name === name));

// Everyone who shares at least one initiative with `name`, with the initiatives they share.
export function coworkersOf(initiatives: readonly Initiative[], name: string): { name: string; shared: Initiative[] }[] {
  const out = new Map<string, Initiative[]>();
  for (const t of projectsOf(initiatives, name)) {
    for (const m of t.members) {
      if (m.name === name || m.name === "—" || m.name === "Anonymous") continue;
      out.set(m.name, [...(out.get(m.name) ?? []), t]);
    }
  }
  return [...out].map(([n, shared]) => ({ name: n, shared })).sort((a, b) => b.shared.length - a.shared.length || a.name.localeCompare(b.name));
}

// Named members only - the people the tree and the map can actually point at.
export const namedMembers = (t: Initiative) => t.members.filter((m) => m.name !== "—" && m.name !== "Anonymous");

// Every pair among `names`, once. The lines drawn between people on the same project.
export function pairs(names: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) out.push([names[a], names[b]]);
  return out;
}

// The reporting lines that join `names` up: every tree edge on a path between two of them, and
// nothing above their common ancestor. Keys are "parent>child". The clean way to show which part
// of the company a project runs through.
export function chainEdges(people: readonly OrgPerson[], names: readonly string[]): Set<string> {
  const parent = new Map(people.map((p) => [p.name, p.reportsTo]));
  const targets = names.filter((n) => parent.has(n));
  const count = new Map<string, number>(); // how many targets sit in this node's subtree (itself included)
  for (const t of targets) for (let n: string | null | undefined = t; n; n = parent.get(n)) count.set(n, (count.get(n) ?? 0) + 1);
  const out = new Set<string>();
  if (targets.length < 2) return out;
  for (const [child, c] of count) {
    const p = parent.get(child);
    if (p && c < targets.length) out.add(p + ">" + child);
  }
  return out;
}

// Folding managers in a big org chart: everyone under a collapsed manager is hidden, the manager
// stays. `keep` names must stay visible, so their collapsed ancestors are ignored (the selection
// always shows).
export function visiblePeople(people: readonly OrgPerson[], collapsed: ReadonlySet<string>, keep: readonly string[] = []): { people: OrgPerson[]; folded: Map<string, number> } {
  const parent = new Map(people.map((p) => [p.name, p.reportsTo]));
  const open = new Set<string>();
  for (const k of keep) for (let n = parent.get(k); n; n = parent.get(n)) open.add(n);
  const hiddenBy = (name: string): string | null => {
    for (let n = parent.get(name); n; n = parent.get(n)) if (collapsed.has(n) && !open.has(n)) return n;
    return null;
  };
  const folded = new Map<string, number>(); // collapsed manager -> people hidden under them
  const out: OrgPerson[] = [];
  for (const p of people) {
    const by = hiddenBy(p.name);
    if (by) folded.set(by, (folded.get(by) ?? 0) + 1);
    else out.push(p);
  }
  return { people: out, folded };
}
