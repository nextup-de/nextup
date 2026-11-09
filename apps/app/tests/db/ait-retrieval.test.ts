// AIT acceptance (D9): offline retrieval on the Musterwerk pack. Real Postgres, own sandbox company, no model, no network.
// The company-wide part of the pack (api files and the Company site) goes in through toInbound + upsertDocuments; every
// question runs, as its persona, through the assistant's own searchDocuments and through the whole assistant with the
// mock provider. Leaks must be zero; hit rate and sourced answers are measured and written, never asserted (Q3).
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assist } from "@/features/assist";
import { rank, type Level } from "@/features/assist/classify";
import { mockProvider } from "@/features/assist/mock";
import { DOC_HITS } from "@/features/assist/tools";
import { NO_KNOWLEDGE } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { searchDocuments, upsertDocuments } from "@/lib/db/assist";
import { batches, companyWide, toInbound } from "../../prisma/generators/musterwerk-docs/load";
import { MW_PERSONAS } from "../../prisma/generators/musterwerk-docs/manifest";
import { musterwerkDocs } from "../../prisma/generators/musterwerk-docs/pack";

type Question = {
  id: string;
  persona: string;
  channel: "m365" | "api" | "both";
  lang: "de" | "en";
  question: string;
  shouldFind: string[];
  mustNotFind: string[];
  needsCeiling: "internal" | "confidential" | null;
};

const questions = (
  JSON.parse(readFileSync(new URL("../../prisma/generators/musterwerk-docs/questions.json", import.meta.url), "utf8")) as {
    questions: Question[];
  }
).questions;

const pack = musterwerkDocs(1);
const files = new Map(pack.map((f) => [f.path, f]));
const groupsOf = new Map(MW_PERSONAS.map((p) => [p.persona, p.groups as readonly string[]]));
const FINDINGS = fileURLToPath(new URL("../../../../docs/test-phase/findings/AIT-Z1.md", import.meta.url));
const db = getDb();
let companyId = "";

type Result = {
  id: string;
  lang: "de" | "en";
  /** A shouldFind file is in the loaded (company-wide) part, so the search can find it. */
  scored: boolean;
  hit: boolean;
  /** A superseded copy (mustNotFind, readable) ranks above the first right file. */
  stale: boolean;
  /** The mock assistant's answer cites a document / a right document. */
  sourced: boolean;
  rightSource: boolean;
  paths: string[];
  leaks: string[];
};

const pathOf = (externalId: string) => externalId.replace(/#\d+$/, "");
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)} % (${n}/${d})`);
/** May this persona open the file? api files have no site permissions; m365 files go by reader group. */
const mayRead = (persona: string, path: string) => {
  const f = files.get(path);
  if (!f) return false;
  return f.channel === "api" || f.readers.some((g) => (groupsOf.get(persona) ?? []).includes(g));
};

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  companyId = (await db.company.create({ data: { slug: `ait-z1-${tag}`, name: "ait z1", seedJson: {} } })).id;
  for (const chunk of batches(toInbound(pack), 100)) await upsertDocuments(companyId, chunk);
}, 120_000);

afterAll(async () => {
  if (companyId) await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

describe("AIT acceptance: offline retrieval on the Musterwerk pack, no leak above the ceiling", () => {
  it("loads only what every employee may open", async () => {
    const rows = await db.document.findMany({ where: { companyId }, select: { externalId: true, classification: true } });
    const paths = new Set(rows.map((r) => pathOf(r.externalId)));
    expect(paths.size).toBe(pack.filter(companyWide).length);
    for (const p of paths) for (const persona of groupsOf.keys()) expect(mayRead(persona, p), `${persona} may read ${p}`).toBe(true);
    expect(rows.some((r) => r.classification === "strictly_confidential")).toBe(false);
  });

  it("leaks nothing above the ceiling or outside the person's files, and measures hit rate and sourced answers for every question", async () => {
    expect(questions.length).toBeGreaterThan(0);
    const results: Result[] = [];
    for (const q of questions) {
      const ceiling: Level = q.needsCeiling ?? "internal";
      const search = (text: string, limit: number) => searchDocuments(companyId, ceiling, text, limit);
      const hits = await search(q.question, DOC_HITS);
      const rows = await db.document.findMany({ where: { companyId }, select: { id: true, externalId: true } });
      const pathById = new Map(rows.map((r) => [r.id, pathOf(r.externalId)]));
      const paths = hits.map((h) => pathById.get(h.id) ?? h.title);
      const leaks: string[] = [];
      hits.forEach((h, i) => {
        const level = files.get(paths[i])?.classification;
        if (!mayRead(q.persona, paths[i])) leaks.push(`${paths[i]} (not readable by ${q.persona})`);
        if (level === "strictly_confidential" || rank(h.classification as Level) > rank(ceiling)) leaks.push(`${paths[i]} (${h.classification} above ${ceiling})`);
      });
      const findable = q.shouldFind.filter((p) => { const f = files.get(p); return f !== undefined && companyWide(f); });
      const firstRight = paths.findIndex((p) => q.shouldFind.includes(p));
      const firstStale = paths.findIndex((p) => q.mustNotFind.includes(p));

      // The whole assistant, offline: redaction, tools, citation check, with the mock provider.
      const out = await assist({
        question: q.question,
        history: [],
        ctx: { knowledge: NO_KNOWLEDGE, profile: null, ceiling, searchDocuments: search },
        prompt: { companyName: "Musterwerk", brief: "", rules: "" },
        redaction: {},
        provider: mockProvider,
      });
      const cited = out.blocked ? [] : out.answer.cited.filter((c) => c.kind === "doc");
      const citedPaths = cited.map((c) => paths[hits.findIndex((h) => h.title === c.label)] ?? c.label);
      for (const c of cited) if (rank(c.level) > rank(ceiling)) leaks.push(`${c.label} cited above ${ceiling}`);

      results.push({
        id: q.id,
        lang: q.lang,
        scored: findable.length > 0,
        hit: findable.some((p) => paths.includes(p)),
        stale: firstStale >= 0 && (firstRight < 0 || firstStale < firstRight),
        sourced: cited.length > 0,
        rightSource: citedPaths.some((p) => q.shouldFind.includes(p)),
        paths,
        leaks,
      });
    }

    const leaked = results.filter((r) => r.leaks.length > 0).map((r) => `${r.id}: ${r.leaks.join(", ")}`);
    expect(leaked, "leaks per question id").toEqual([]);
    expect(results).toHaveLength(questions.length);

    const scored = results.filter((r) => r.scored);
    const rate = (rs: Result[]) => pct(rs.filter((r) => r.hit).length, rs.length);
    const sourced = (rs: Result[]) => pct(rs.filter((r) => r.sourced).length, rs.length);
    const right = (rs: Result[]) => pct(rs.filter((r) => r.rightSource).length, rs.length);
    const missed = scored.filter((r) => !r.hit).map((r) => r.id);
    const stale = results.filter((r) => r.stale).map((r) => r.id);
    console.info(
      `AIT-Z1 docs ${pack.filter(companyWide).length}; hit rate all ${rate(scored)}; de ${rate(scored.filter((r) => r.lang === "de"))}; en ${rate(scored.filter((r) => r.lang === "en"))}; ` +
        `answers with a source: all questions ${sourced(results)}, answerable ${sourced(scored)}; right source (answerable) ${right(scored)}; ` +
        `missed ${missed.join(", ")}; stale first ${stale.join(", ")}`,
    );

    if (process.env.AIT_WRITE_FINDINGS === "1") {
      const section = [
        "## Measured offline hit rate",
        "",
        `Pack seed 1. The company-wide part (api files and the Company site, \`companyWide\` in \`load.ts\`: ${pack.filter(companyWide).length} of ${pack.length} files) loaded into a sandbox company; \`searchDocuments(companyId, ceiling, question, ${DOC_HITS})\` and the whole assistant with the mock provider for all ${results.length} questions, each as its persona. ${scored.length} questions have a right file in the loaded part (answerable). Leaks (a hit the persona may not open, above the ceiling or strictly confidential): 0.`,
        "",
        "| Measure | Value |",
        "|---|---|",
        `| Hit rate, answerable, all | ${rate(scored)} |`,
        `| Hit rate, answerable, German | ${rate(scored.filter((r) => r.lang === "de"))} |`,
        `| Hit rate, answerable, English | ${rate(scored.filter((r) => r.lang === "en"))} |`,
        `| Answers with a source, answerable | ${sourced(scored)} |`,
        `| Answers with the right source, answerable | ${right(scored)} |`,
        `| Answers with a source, all ${results.length} questions | ${sourced(results)} |`,
        "",
        `Missed question ids: ${missed.length ? missed.map((m) => `\`${m}\``).join(", ") : "none"}. A superseded copy ranks above the right file: ${stale.length ? stale.map((m) => `\`${m}\``).join(", ") : "none"}.`,
        "",
        ...(missed.length
          ? ["| Missed id | Top hits |", "|---|---|", ...scored.filter((r) => !r.hit).map((r) => `| \`${r.id}\` | ${r.paths.map((p) => `\`${p}\``).join("<br>") || "none"} |`), ""]
          : []),
      ].join("\n");
      mkdirSync(fileURLToPath(new URL("../../../../docs/test-phase/findings/", import.meta.url)), { recursive: true });
      // Keep the hand-written causes below the measured section when the file is rewritten.
      let causes = "";
      try {
        const old = readFileSync(FINDINGS, "utf8");
        const at = old.indexOf("## Likely causes");
        causes = at >= 0 ? `\n${old.slice(at)}` : "";
      } catch {
        // first run: no file yet
      }
      writeFileSync(FINDINGS, `# AIT-Z1 findings\n\n${section}${causes}`);
    }
  }, 120_000);
});
