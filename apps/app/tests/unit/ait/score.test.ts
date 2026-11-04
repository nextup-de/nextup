import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../../prisma/generators/musterwerk-docs/ask";
import { parseAssistStream, score, type Done, type Question } from "../../../prisma/generators/musterwerk-docs/score";

const Q: Question = {
  id: "m01",
  persona: "lena",
  channel: "m365",
  lang: "de",
  question: "Wie läuft die Schichtübergabe?",
  shouldFind: ["Musterwerk Werk Nord/Schichtübergabe.md"],
  mustNotFind: ["Musterwerk Board/Projekt Adler.md"],
  answerShouldContain: ["Übergabe"],
  needsCeiling: null,
  note: "",
};
const src = (label: string, level = "internal") => ({ tag: "S1", kind: "doc", label, level });
const done = (sources: Done["sources"], text = "Die Übergabe erfolgt am Schichtende."): Done => ({ text, sources, unsourced: false, blocked: false });

describe("AIT score", () => {
  it("counts a hit by title and by path", () => {
    expect(score(Q, done([src("Schichtübergabe")])).found).toEqual(Q.shouldFind);
    expect(score(Q, done([src("Musterwerk Werk Nord/Schichtübergabe.md")])).pass).toBe(true);
  });

  it("fails without a hit", () => {
    const s = score(Q, done([src("Urlaubsregelung")]));
    expect(s.found).toEqual([]);
    expect(s.pass).toBe(false);
  });

  it("flags a forbidden file as a leak", () => {
    const s = score(Q, done([src("Schichtübergabe"), src("Projekt Adler")]));
    expect(s.leaked).toEqual(["Projekt Adler"]);
    expect(s.pass).toBe(false);
  });

  it("flags a confidential source under the internal ceiling, not under confidential", () => {
    const d = done([src("Schichtübergabe"), src("Lohnliste", "confidential")]);
    expect(score(Q, d, "internal").leaked).toEqual(["Lohnliste"]);
    expect(score(Q, d, "confidential").leaked).toEqual([]);
  });

  it("checks the expected words in any case", () => {
    expect(score(Q, done([src("Schichtübergabe")], "die ÜBERGABE ist klar")).contains).toBe(true);
    const s = score(Q, done([src("Schichtübergabe")], "keine Ahnung"));
    expect(s.contains).toBe(false);
    expect(s.pass).toBe(false);
  });

  it("passes a question that must find nothing only with no sources", () => {
    const none = { ...Q, shouldFind: [], answerShouldContain: [] };
    expect(score(none, done([], "")).pass).toBe(true);
    expect(score(none, done([src("Etwas")], "")).pass).toBe(false);
  });

  it("parses a recorded assist stream", () => {
    const sources = [{ tag: "S1", kind: "doc", label: "Schichtübergabe", level: "internal" }];
    const stream =
      `event: text\ndata: ${JSON.stringify({ text: "Die", sources })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ turnId: "t", blocked: false, text: "Die Übergabe.", sources, unsourced: false, retentionDays: 90 })}\n\n`;
    const d = parseAssistStream(stream);
    expect(d).toMatchObject({ text: "Die Übergabe.", unsourced: false, blocked: false });
    expect(d.sources).toHaveLength(1);
    expect(() => parseAssistStream(`event: error\ndata: {"message":"x"}\n\n`)).toThrow();
  });

  it("never writes the cookie, with --dry or with an injected fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ait-"));
    const cookies = join(dir, "cookies");
    mkdirSync(cookies);
    const SECRET = "session=TOP-SECRET-VALUE";
    writeFileSync(join(cookies, "lena.txt"), SECRET + "\n");
    writeFileSync(join(dir, "questions.json"), JSON.stringify({ version: 1, questions: [Q] }));
    const common = ["--persona", "lena", "--questions", join(dir, "questions.json"), "--delay", "0"];
    const sent: string[] = [];
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      sent.push(String((init?.headers as Record<string, string>).cookie));
      const d = { blocked: false, text: "Die Übergabe.", sources: [src("Schichtübergabe")], unsourced: false };
      return new Response(`event: done\ndata: ${JSON.stringify(d)}\n\n`, { status: 200 });
    }) as typeof fetch;
    const quiet = { log: () => {}, sleep: async () => {} };

    await run([...common, "--dry", "--out", join(dir, "dry.json")], { ...quiet, fetch: fakeFetch });
    const rows = await run([...common, "--base", "http://x", "--slug", "mw", "--cookies", cookies, "--out", join(dir, "live.json")], { ...quiet, fetch: fakeFetch });

    expect(rows[0].pass).toBe(true);
    expect(sent).toEqual([SECRET]);
    for (const f of readdirSync(dir).filter((n) => n.startsWith("dry") || n.startsWith("live"))) {
      expect(readFileSync(join(dir, f), "utf8")).not.toContain("TOP-SECRET-VALUE");
    }
  });
});
