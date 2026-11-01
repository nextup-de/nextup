// Graph fixtures for the 21 ground-truth questions of the Acme test pack (D8, D9 of plan CNX). Pure: no
// test-runner imports and no imports from src/, so record.mjs and synthesize.mjs run it directly with Node's
// type stripping (Node 22.18+), like tests/fake-jira/fake-jira.ts - plain syntax that erases cleanly.
import { readFileSync } from "node:fs";

export type Level = "public" | "internal" | "confidential" | "strictly_confidential";
export type FileClass = "public" | "internal" | "confidential" | "strict";

export type Question = {
  id: string;
  asPersona: string;
  question: string;
  shouldFind: string[];
  mustNotFind: string[];
  answerShouldContain: string[];
  note: string;
  needsCeiling: "internal" | "confidential" | "never" | null;
};

export type FileRow = { path: string; file: string; classification: FileClass; lang: string; readers: string[] };

/** What features/m365/search.ts `searchRequest` builds, as plain data. */
export type GraphSearchRequest = {
  requests: { entityTypes: ["driveItem"]; query: { queryString: string }; from: 0; size: number }[];
};

export type ResponseFixture = {
  question: string;
  persona: string;
  source: "synthetic" | "recorded";
  recordedAt: string | null;
  request: GraphSearchRequest | null;
  status: number;
  body: unknown;
};

/** A hit as the checker needs it: a KnowledgeHit has all of this. */
export type HitLike = { url: string; classification: string };

export type GroundTruthResult = {
  id: string;
  pass: boolean;
  missing: string[];
  leaked: string[];
  aboveCeiling: string[];
  foreignToken: boolean;
};

export const PERSONA_GROUPS: Record<string, string[]> = {
  lena: ["G-ALL", "G-PRD"],
  ben: ["G-ALL", "G-HIT"],
  fiona: ["G-ALL", "G-FIN"],
  erik: ["G-ALL", "G-OPS", "G-EXEC", "G-MGR"],
};

const RANK: Record<Level, number> = { public: 0, internal: 1, confidential: 2, strictly_confidential: 3 };
const SITE_BASE = "https://nextuptest.sharepoint.com/sites/";

const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));

export function loadQuestions(): Question[] {
  return readJson("./ground-truth/queries.json") as Question[];
}

export function loadFiles(): FileRow[] {
  return readJson("./ground-truth/files.json") as FileRow[];
}

export function loadResponse(qid: string): ResponseFixture {
  return readJson(`./responses/${qid}.json`) as ResponseFixture;
}

/** The company ceiling a question is asked under (D9). */
export function ceilingFor(question: Question): Level {
  if (question.needsCeiling === "internal" || question.needsCeiling === "confidential") return question.needsCeiling;
  if (question.needsCeiling === "never") return "confidential";
  return "internal";
}

export const levelOf = (c: FileClass): Level => (c === "strict" ? "strictly_confidential" : c);

/** Copy of features/m365/search.ts `kqlQuery`; graph-fixtures.test.ts checks the two agree. */
function kqlQuery(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?/gu) ?? [];
  return [...new Set(words.filter((w) => w.length > 1 || /\d/.test(w)).map((w) => w.slice(0, 40)))].slice(0, 12).join(" ");
}

/** Copy of features/m365/search.ts `searchRequest`. */
export function graphSearchRequest(text: string, size: number): GraphSearchRequest | null {
  const queryString = kqlQuery(text);
  if (!queryString) return null;
  return { requests: [{ entityTypes: ["driveItem"], query: { queryString }, from: 0, size: Math.min(Math.max(size, 1), 10) }] };
}

export function canRead(persona: string, file: FileRow): boolean {
  const groups = PERSONA_GROUPS[persona] ?? [];
  return file.readers.some((g) => groups.includes(g));
}

function webUrlOf(file: FileRow): string {
  const segments = file.path.split("/");
  const site = (segments[0] ?? "").replace(/\s+/g, "");
  return SITE_BASE + site + "/" + segments.map(encodeURIComponent).join("/");
}

const MARKER: Record<FileClass, string> = { public: "", internal: "", confidential: "Vertraulich. ", strict: "Streng vertraulich. " };

/** A made-up Graph answer: one hit per readable file the question names, marked the way the file is classified. */
export function synthesizeResponse(question: Question, files: FileRow[]): ResponseFixture {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const named = [...question.shouldFind, ...question.mustNotFind];
  const hits = [];
  for (const path of [...new Set(named)]) {
    const file = byPath.get(path);
    if (!file || !canRead(question.asPersona, file)) continue;
    const n = files.indexOf(file) + 1;
    hits.push({
      hitId: `hit-${String(n).padStart(2, "0")}`,
      rank: hits.length + 1,
      summary: `${MARKER[file.classification]}Made-up test content of <c0>${file.file.replace(/\.docx$/, "")}</c0> <ddd/>`,
      resource: {
        "@odata.type": "#microsoft.graph.driveItem",
        id: `01SYNTHETICITEM${String(n).padStart(2, "0")}`,
        name: file.file,
        webUrl: webUrlOf(file),
      },
    });
  }
  const body = {
    value: [{ searchTerms: [], hitsContainers: [{ total: hits.length, moreResultsAvailable: false, hits }] }],
  };
  return {
    question: question.id,
    persona: question.asPersona,
    source: "synthetic",
    recordedAt: null,
    request: graphSearchRequest(question.question, 10),
    status: 200,
    body,
  };
}

/** What record.mjs writes: Microsoft's answer and the request that asked for it. No header, no token. */
export function toRecordedFixture(
  question: Question,
  persona: string,
  request: GraphSearchRequest | null,
  status: number,
  body: unknown,
  at: Date | string,
): ResponseFixture {
  return {
    question: question.id,
    persona,
    source: "recorded",
    recordedAt: typeof at === "string" ? at : at.toISOString(),
    request,
    status,
    body,
  };
}

/** The file a hit shows: its webUrl, URL-decoded, ends with the file's path. */
function fileOfHit(hit: HitLike, files: FileRow[]): FileRow | undefined {
  let url = hit.url;
  try {
    url = decodeURIComponent(hit.url);
  } catch {
    /* keep the raw url */
  }
  return files.find((f) => url.endsWith(f.path));
}

/**
 * D9: did the retrieval for this question do what ground truth says? `tokenUsers`: whose Graph token was asked
 * for; the tests use the persona name as the user id.
 */
export function checkGroundTruth(question: Question, hits: HitLike[], tokenUsers: string[]): GroundTruthResult {
  const files = loadFiles();
  const ceiling = ceilingFor(question);
  const found = new Set<string>();
  const aboveCeiling: string[] = [];
  for (const h of hits) {
    const file = fileOfHit(h, files);
    if (file) found.add(file.path);
    const shownLevel = RANK[h.classification as Level] ?? 99;
    const fileLevel = file ? RANK[levelOf(file.classification)] : 0;
    if (shownLevel > RANK[ceiling] || fileLevel > RANK[ceiling]) aboveCeiling.push(file ? file.path : h.url);
  }
  const missing = question.shouldFind.filter((p) => {
    const f = files.find((x) => x.path === p);
    return f !== undefined && RANK[levelOf(f.classification)] <= RANK[ceiling] && !found.has(p);
  });
  const leaked = question.mustNotFind.filter((p) => found.has(p));
  const foreignToken = tokenUsers.some((u) => u !== question.asPersona);
  return {
    id: question.id,
    pass: missing.length === 0 && leaked.length === 0 && aboveCeiling.length === 0 && !foreignToken,
    missing,
    leaked,
    aboveCeiling,
    foreignToken,
  };
}
