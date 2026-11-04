import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MW_PERSONAS, type Classification } from "../../../prisma/generators/musterwerk-docs/manifest";
import { musterwerkDocs } from "../../../prisma/generators/musterwerk-docs/pack";

type Question = {
  id: string;
  persona: "lena" | "ben" | "fiona" | "linus";
  channel: "m365" | "api" | "both";
  lang: "de" | "en";
  question: string;
  shouldFind: string[];
  mustNotFind: string[];
  answerShouldContain: string[];
  needsCeiling: "internal" | "confidential" | null;
  note: string;
};

const catalog = JSON.parse(
  readFileSync(new URL("../../../prisma/generators/musterwerk-docs/questions.json", import.meta.url), "utf8"),
) as { version: number; questions: Question[] };
const questions = catalog.questions;
const files = new Map(musterwerkDocs(1).map((f) => [f.path, f]));

const PERSONAS = ["lena", "ben", "fiona", "linus"] as const;
const rank: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, strictly_confidential: 3 };

function groupsOf(persona: string): readonly string[] {
  return MW_PERSONAS.find((p) => p.persona === persona)?.groups ?? [];
}

describe("AIT catalog", () => {
  it("has version 1 and every field in the shape of D6, ids m01…, unique", () => {
    expect(catalog.version).toBe(1);
    for (const [i, q] of questions.entries()) {
      expect(Object.keys(q).sort(), q.id).toEqual(
        ["answerShouldContain", "channel", "id", "lang", "mustNotFind", "needsCeiling", "note", "persona", "question", "shouldFind"],
      );
      expect(q.id).toBe(`m${String(i + 1).padStart(2, "0")}`);
      expect(PERSONAS).toContain(q.persona);
      expect(["m365", "api", "both"]).toContain(q.channel);
      expect(["de", "en"]).toContain(q.lang);
      expect(q.question.trim().length, q.id).toBeGreaterThan(10);
      expect([q.shouldFind, q.mustNotFind, q.answerShouldContain].every(Array.isArray), q.id).toBe(true);
      expect([null, "internal", "confidential"]).toContain(q.needsCeiling);
      expect(typeof q.note).toBe("string");
    }
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it("has the minimum counts of D6", () => {
    expect(questions.length).toBeGreaterThanOrEqual(40);
    expect(questions.filter((q) => q.lang === "de").length).toBeGreaterThanOrEqual(30);
    expect(questions.filter((q) => q.channel === "m365").length).toBeGreaterThanOrEqual(12);
    expect(questions.filter((q) => q.channel === "api").length).toBeGreaterThanOrEqual(12);
    for (const p of PERSONAS) expect(questions.filter((q) => q.persona === p).length, p).toBeGreaterThanOrEqual(4);

    const misses = questions.filter((q) => q.shouldFind.length === 0 && q.mustNotFind.length > 0);
    expect(misses.length).toBeGreaterThanOrEqual(6);

    // A superseded, stale or saved-twice file the answer must not be taken from.
    const stale = questions.filter((q) =>
      q.mustNotFind.some((p) => {
        const f = files.get(p);
        return f !== undefined && (f.year <= 2022 || /Kopie|\(v2\)|final_neu/.test(p) || f.body.includes("ersetzt"));
      }),
    );
    expect(stale.length).toBeGreaterThanOrEqual(4);

    expect(questions.some((q) => /Hinweise für KI-Assistenten/.test(q.question))).toBe(true);
  });

  it("names only paths that exist in the pack", () => {
    for (const q of questions) {
      for (const p of [...q.shouldFind, ...q.mustNotFind]) expect(files.has(p), `${q.id}: ${p}`).toBe(true);
      expect(new Set(q.shouldFind).size, q.id).toBe(q.shouldFind.length);
      expect(q.shouldFind.filter((p) => q.mustNotFind.includes(p)), q.id).toEqual([]);
    }
  });

  it("puts every shouldFind file in the question's channel and within the persona's reach", () => {
    for (const q of questions) {
      const groups = groupsOf(q.persona);
      for (const p of q.shouldFind) {
        const f = files.get(p)!;
        if (q.channel !== "both") expect(f.channel, `${q.id}: ${p}`).toBe(q.channel);
        const readable = f.channel === "api" || f.readers.some((g) => groups.includes(g));
        expect(readable, `${q.id} (${q.persona}) cannot read ${p}`).toBe(true);
      }
    }
  });

  it("has a note when nothing is to be found, and never asks for a strictly confidential file", () => {
    for (const q of questions) {
      if (q.shouldFind.length === 0) expect(q.note.trim().length, q.id).toBeGreaterThan(0);
      for (const p of q.shouldFind) expect(files.get(p)!.classification, `${q.id}: ${p}`).not.toBe("strictly_confidential");
    }
  });

  it("sets needsCeiling to the highest classification among the files to find, null when none", () => {
    for (const q of questions) {
      if (q.shouldFind.length === 0) {
        expect(q.needsCeiling, q.id).toBeNull();
        continue;
      }
      const top = Math.max(...q.shouldFind.map((p) => rank[files.get(p)!.classification]));
      expect(q.needsCeiling, q.id).toBe(top >= rank.confidential ? "confidential" : "internal");
    }
  });

  it("expects answers that can be read from the files to find, without personal data", () => {
    const pii = /DE00 ?\d|@example\.test|\+49 ?000|IBAN/i;
    for (const q of questions) {
      for (const s of q.answerShouldContain) expect(pii.test(s), `${q.id}: ${s}`).toBe(false);
      if (q.shouldFind.length === 0) {
        expect(q.answerShouldContain, q.id).toEqual([]);
        continue;
      }
      const text = q.shouldFind.map((p) => files.get(p)!.body).join("\n").toLowerCase();
      for (const s of q.answerShouldContain) expect(text.includes(s.toLowerCase()), `${q.id}: "${s}" not in the files to find`).toBe(true);
    }
  });
});
