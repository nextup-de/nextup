// CNX-A1: the Graph fixtures of the 21 ground-truth questions (D8).
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSearchResponse, searchRequest } from "@/features/m365/search";
import {
  canRead, loadFiles, loadQuestions, loadResponse, PERSONA_GROUPS, toRecordedFixture, type ResponseFixture,
} from "../../fixtures/graph/fixtures";

const questions = loadQuestions();
const files = loadFiles();
const dir = new URL("../../fixtures/graph/", import.meta.url);

describe("CNX graph fixtures", () => {
  it("has 21 questions q01-q21 and a response for each", () => {
    expect(questions.map((q) => q.id)).toEqual(Array.from({ length: 21 }, (_, i) => "q" + String(i + 1).padStart(2, "0")));
    expect(readdirSync(new URL("responses/", dir)).sort()).toEqual(questions.map((q) => q.id + ".json").sort());
  });

  it("names only files that are in files.json", () => {
    const known = new Set(files.map((f) => f.path));
    for (const q of questions) for (const p of [...q.shouldFind, ...q.mustNotFind]) expect(known.has(p), `${q.id}: ${p}`).toBe(true);
  });

  it("gives every response the D8 fields, a request equal to searchRequest and a body the reader accepts", () => {
    for (const q of questions) {
      const r = loadResponse(q.id);
      expect(Object.keys(r).sort()).toEqual(["body", "persona", "question", "recordedAt", "request", "source", "status"]);
      expect(r.question).toBe(q.id);
      expect(r.persona).toBe(q.asPersona);
      expect(r.status).toBe(200);
      expect(r.request).toEqual(searchRequest(q.question, 10));
      expect(() => readSearchResponse(r.body, "confidential")).not.toThrow();
    }
  });

  it("holds no hit for a file the persona cannot read (synthetic)", () => {
    expect(Object.keys(PERSONA_GROUPS).sort()).toEqual(["ben", "erik", "fiona", "lena"]);
    for (const q of questions) {
      const r = loadResponse(q.id);
      if (r.source !== "synthetic") continue;
      const hits = readSearchResponse(r.body, "strictly_confidential");
      for (const h of hits) {
        const file = files.find((f) => decodeURIComponent(h.url).endsWith(f.path));
        expect(file, `${q.id}: ${h.url}`).toBeDefined();
        expect(canRead(q.asPersona, file!), `${q.id}: ${file!.path}`).toBe(true);
      }
    }
  });

  it("writes recorded fixtures without a token or an authorization key", () => {
    const q = questions[0]!;
    const rec: ResponseFixture = toRecordedFixture(q, q.asPersona, searchRequest(q.question, 10), 200, { value: [] }, new Date("2026-11-01T10:00:00Z"));
    expect(rec.source).toBe("recorded");
    expect(rec.recordedAt).toBe("2026-11-01T10:00:00.000Z");
    const text = JSON.stringify(rec);
    expect(text).not.toContain("Bearer");
    expect(text.toLowerCase()).not.toContain('"authorization"');
  });

  it("keeps record.mjs from printing its token", () => {
    const text = readFileSync(new URL("record.mjs", dir), "utf8");
    expect(text).toContain("GRAPH_TOKEN_");
    const lines = text.split("\n").filter((l) => /console\.(log|error|info|warn)/.test(l));
    for (const l of lines) expect(l).not.toMatch(/bearer|process\.env\[/);
    expect(lines.join("\n")).not.toMatch(/\$\{bearer\}/);
  });
});
