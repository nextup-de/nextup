// What the raise page worked out for a case it published: the finalized document as a brief (the five
// dials, what was checked across the company, who it affects, who receives it, every attached file).
// Like the screenshots (lib/shots.ts) it stays in this browser: localStorage, keyed per company, one
// entry per case id. The event log keeps the case itself; this is a stand-in until the brief has an event.
import type { WrittenBrief } from "@/features/ideas/brief";

const key = (slug: string) => "nextup." + slug + ".raised.v1";

export function loadRaised(slug: string): Record<string, WrittenBrief> {
  try { const v = localStorage.getItem(key(slug)); return v ? (JSON.parse(v) as Record<string, WrittenBrief>) : {}; } catch { return {}; }
}

export function saveRaised(slug: string, caseId: string, brief: WrittenBrief): boolean {
  try { localStorage.setItem(key(slug), JSON.stringify({ ...loadRaised(slug), [caseId]: brief })); return true; } catch { return false; /* quota or private mode */ }
}
