// Live search over the SharePoint and OneDrive files a person can open, as that person (phase 2 of
// docs/plans/2026-10-22_sso-and-data-access.md, step 2.4). Microsoft trims the hits to what the
// person may read; NextUp copies nothing. Pure: the request we send to Graph `POST
// /v1.0/search/query` and what we keep of its answer. The glue that calls Microsoft is
// src/server/m365-search.ts.
//
// What we keep of a hit: the file name, a short snippet, its link and a level. Snippets above the
// company's classification ceiling are dropped here, before anything else sees them.
import { canUse, type Level } from "@/features/assist/classify";
import { markerOf } from "@/features/assist/redact";

export const GRAPH_SEARCH_URL = "https://graph.microsoft.com/v1.0/search/query";

/** Hits per search. Graph ranks well; more would only make the model's context longer. */
export const SEARCH_SIZE = 5;

const MAX_TERMS = 12;
const MAX_SNIPPET = 400;

/**
 * The query as KQL: words only, lower-cased. Lower case turns KQL's operators (AND, OR, NOT, NEAR,
 * which are upper case only) into plain words; quotes, colons (property restrictions), wildcards
 * and brackets never get through. Empty when nothing searchable is left.
 */
export function kqlQuery(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?/gu) ?? [];
  return [...new Set(words.filter((w) => w.length > 1 || /\d/.test(w)).map((w) => w.slice(0, 40)))].slice(0, MAX_TERMS).join(" ");
}

export type SearchRequest = {
  requests: { entityTypes: ["driveItem"]; query: { queryString: string }; from: 0; size: number }[];
};

export function searchRequest(text: string, size = SEARCH_SIZE): SearchRequest | null {
  const queryString = kqlQuery(text);
  if (!queryString) return null;
  return { requests: [{ entityTypes: ["driveItem"], query: { queryString }, from: 0, size: Math.min(Math.max(size, 1), 10) }] };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Graph's summary without its markup: `<c0>` highlights and `<ddd/>` gaps out, entities decoded. */
export function plainSnippet(summary: string): string {
  const text = summary
    .replace(/<ddd\s*\/>/gi, " … ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_SNIPPET ? text.slice(0, MAX_SNIPPET - 1) + "…" : text;
}

export type M365Hit = { id: string; title: string; snippet: string; url: string; classification: Level };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The hits worth handing on, best first. `unlabelled`: the level a hit gets when neither its name
 * nor its snippet carries a marker (decision 4: internal, per company). A hit marked above
 * `ceiling` - "vertraulich", "confidential", "streng vertraulich" - is dropped.
 */
export function readSearchResponse(body: unknown, ceiling: Level, unlabelled: Level = "internal"): M365Hit[] {
  const hits = list(obj(body)?.value).flatMap((r) => list(obj(r)?.hitsContainers)).flatMap((c) => list(obj(c)?.hits));
  const out: M365Hit[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const hit = obj(h);
    const resource = obj(hit?.resource);
    if (!hit || !resource) continue;
    const url = text(resource.webUrl);
    const title = text(resource.name).trim();
    if (!/^https:\/\//i.test(url) || !title || seen.has(url)) continue;
    const snippet = plainSnippet(text(hit.summary));
    const classification = markerOf(title + "\n" + snippet) ?? unlabelled;
    if (!canUse(classification, ceiling)) continue;
    seen.add(url);
    out.push({ id: text(resource.id) || text(hit.hitId) || url, title, snippet, url, classification });
  }
  return out;
}
