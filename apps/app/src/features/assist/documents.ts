// What n8n (or anything with a knowledge:write token) may send to /api/<company>/knowledge/documents:
// ERP extracts, process descriptions, policies. Pure validation. docs/ASSISTANT.md.
//
// A document without a classification is stored as `confidential` - above the default ceiling, so
// the assistant cannot read it until someone has looked at it. Labelling is the sender's job;
// guessing a lower class would be the one mistake that leaks.
import { isLevel, type Level } from "./classify";

export const MAX_DOCUMENTS = 100;
export const MAX_BODY = 20_000;
export const SOURCES = ["erp", "n8n", "upload"] as const;

export type InboundDocument = { source: string; externalId: string; title: string; body: string; classification: Level };
export type DocumentsResult = { ok: true; docs: InboundDocument[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseDocuments(body: unknown): DocumentsResult {
  const list = isObj(body) && Array.isArray(body.documents) ? body.documents : null;
  if (!list) return { ok: false, error: 'Send {"documents": [...]}.' };
  if (list.length === 0 || list.length > MAX_DOCUMENTS) return { ok: false, error: `Send 1 to ${MAX_DOCUMENTS} documents per request.` };

  const docs: InboundDocument[] = [];
  for (const [i, d] of list.entries()) {
    if (!isObj(d)) return { ok: false, error: `documents[${i}] is not an object.` };
    const source = text(d.source, 20) || "n8n";
    const externalId = text(d.externalId, 200);
    const title = text(d.title, 300);
    const body = text(d.body, MAX_BODY);
    if (!(SOURCES as readonly string[]).includes(source)) return { ok: false, error: `documents[${i}].source must be one of ${SOURCES.join(", ")}.` };
    if (!externalId || !title || !body) return { ok: false, error: `documents[${i}] needs externalId, title and body.` };
    if (d.classification === "strictly_confidential") return { ok: false, error: `documents[${i}] is strictly confidential - those never go to the assistant.` };
    const classification: Level = isLevel(d.classification) ? d.classification : "confidential";
    docs.push({ source, externalId, title, body, classification });
  }
  return { ok: true, docs };
}
