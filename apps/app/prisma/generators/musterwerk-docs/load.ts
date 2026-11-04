// Loads the api part of the pack into the document API the way a customer's middleware would (AIT-C1, D7).
// toInbound and batches are pure; loadPack takes an injectable fetch. The token is never logged.
import { MAX_BODY, MAX_DOCUMENTS, type InboundDocument } from "../../../src/features/assist/documents";
import type { PackFile } from "./manifest";

export type LoadResult = { batches: number; written: number; failed: number; statuses: number[] };

/** Cuts a body into pieces of at most `max` characters, at line ends where there is one. */
function splitBody(body: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  const push = () => {
    if (current) parts.push(current);
    current = "";
  };
  for (const line of body.split("\n")) {
    let rest = current ? `\n${line}` : line;
    if (current.length + rest.length > max) {
      push();
      rest = line;
    }
    while (rest.length > max) {
      parts.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    current += rest;
  }
  push();
  return parts;
}

export function toInbound(files: readonly PackFile[]): InboundDocument[] {
  const docs: InboundDocument[] = [];
  for (const f of files) {
    if (f.channel !== "api" || f.classification === "strictly_confidential") continue;
    const base = { source: "upload", classification: f.classification };
    if (f.body.length <= MAX_BODY) {
      docs.push({ ...base, externalId: f.path, title: f.title, body: f.body });
      continue;
    }
    const parts = splitBody(f.body, MAX_BODY);
    parts.forEach((body, i) =>
      docs.push({ ...base, externalId: `${f.path}#${i + 1}`, title: `${f.title} (${i + 1}/${parts.length})`, body }),
    );
  }
  return docs;
}

export function batches<T>(docs: readonly T[], size: number = MAX_DOCUMENTS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < docs.length; i += size) out.push(docs.slice(i, i + size));
  return out;
}

export async function loadPack(opts: {
  base: string;
  slug: string;
  files: readonly PackFile[];
  token: string;
  fetch?: typeof fetch;
}): Promise<LoadResult> {
  const doFetch = opts.fetch ?? fetch;
  const url = `${opts.base.replace(/\/+$/, "")}/api/${opts.slug}/knowledge/documents`;
  const result: LoadResult = { batches: 0, written: 0, failed: 0, statuses: [] };
  for (const batch of batches(toInbound(opts.files), MAX_DOCUMENTS)) {
    result.batches += 1;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({ documents: batch }),
      });
      if (!res.ok) {
        result.failed += 1;
        result.statuses.push(res.status);
        continue;
      }
      const data: unknown = await res.json().catch(() => null);
      const written = typeof data === "object" && data !== null && "written" in data ? Number(data.written) : batch.length;
      result.written += Number.isFinite(written) ? written : batch.length;
    } catch {
      result.failed += 1;
      result.statuses.push(0);
    }
  }
  return result;
}
