// One list of document hits out of the company's own documents and a person's live Microsoft 365
// search. Pure. docs/plans/2026-10-22_sso-and-data-access.md, step 2.5.
import type { DocHit } from "./tools";

/** Slots kept for Microsoft 365 when it found something, so full local results can't crowd it out. */
const M365_ROOM = 2;

const norm = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Local hits first, then Microsoft 365, at most `limit` in all. A Microsoft 365 hit whose title a
 * local document already has is the same file, imported - the local one stays.
 */
export function mergeHits(local: readonly DocHit[], m365: readonly DocHit[], limit: number): DocHit[] {
  const titles = new Set(local.map((d) => norm(d.title)));
  const ids = new Set(local.map((d) => d.id));
  const extra = m365.filter((d) => !titles.has(norm(d.title)) && !ids.has(d.id));
  const room = Math.min(extra.length, M365_ROOM, limit);
  return [...local.slice(0, limit - room), ...extra.slice(0, limit)].slice(0, limit);
}
