"use client";
// Idea drafts for the demo without a database: the same shapes as lib/db/ideas.ts, kept in this
// browser's localStorage per company. Nothing leaves the browser. With a session and Postgres
// the page uses the server actions instead (server/actions/ideas.ts).
import type { Snapshot, TurnRow } from "@/lib/db/ideas";
import type { DraftSummary, DraftView } from "@/features/ideas/drafts";
import { summaryOf } from "@/features/ideas/drafts";

const KEY = (slug: string) => "nextup.ideas." + slug + ".v1";
let seq = 0;
const mint = (p: string) => p + "_" + Date.now().toString(36) + (seq++).toString(36);

function read(slug: string): DraftView[] {
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    const all = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(all) ? (all as DraftView[]) : [];
  } catch {
    return [];
  }
}
function write(slug: string, all: DraftView[]): boolean {
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(all));
    return true;
  } catch {
    return false; // full or blocked: the page says so
  }
}
function update(slug: string, id: string, fn: (d: DraftView) => DraftView | null): boolean {
  const all = read(slug);
  const i = all.findIndex((d) => d.id === id && d.status === "draft");
  if (i < 0) return false;
  const next = fn(all[i]);
  if (!next) return false;
  all[i] = { ...next, updatedAt: new Date().toISOString() };
  return write(slug, all);
}

export const localDrafts = {
  list(slug: string): DraftSummary[] {
    return read(slug).filter((d) => d.status !== "discarded").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summaryOf);
  },
  get(slug: string, id: string): DraftView | null {
    return read(slug).find((d) => d.id === id && d.status !== "discarded") ?? null;
  },
  create(slug: string): string {
    const now = new Date().toISOString();
    const d: DraftView = { id: mint("d"), title: "", status: "draft", overall: 0, updatedAt: now, caseId: null, scores: [], affected: [], attachments: 0, turns: [] };
    write(slug, [d, ...read(slug)]);
    return d.id;
  },
  addTurns(slug: string, id: string, turns: readonly TurnRow[], snap: Snapshot): boolean {
    const at = new Date().toISOString();
    return update(slug, id, (d) => ({
      ...d, title: snap.title, overall: snap.overall, scores: snap.scores,
      turns: [...d.turns, ...turns.map((t) => ({ id: mint("t"), role: t.role, text: t.text, overall: t.overall ?? null, at }))],
    }));
  },
  saveMeta(slug: string, id: string, meta: { title?: string; affected?: string[]; attachments?: number }): boolean {
    return update(slug, id, (d) => ({ ...d, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) }));
  },
  discard(slug: string, id: string): boolean {
    return update(slug, id, (d) => ({ ...d, status: "discarded" }));
  },
  publish(slug: string, id: string, caseId: string, snap: Snapshot): boolean {
    return update(slug, id, (d) => ({ ...d, status: "published", caseId, title: snap.title, overall: snap.overall, scores: snap.scores }));
  },
  // Every draft of this company in this browser, gone (the static demo starts clean on each visit,
  // the dev panel's "Reset demo").
  clear(slug: string): void {
    try { window.localStorage.removeItem(KEY(slug)); } catch { /* blocked: nothing was stored either */ }
  },
  // The drafts that became these cases (the dev panel's "Delete added cases").
  dropCases(slug: string, caseIds: ReadonlySet<string>): void {
    const all = read(slug);
    const kept = all.filter((d) => !(d.caseId && caseIds.has(d.caseId)));
    if (kept.length !== all.length) write(slug, kept);
  },
};
