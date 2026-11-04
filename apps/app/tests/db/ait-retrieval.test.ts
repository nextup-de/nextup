// AIT acceptance (D9): offline retrieval on the Musterwerk pack. Real Postgres, own sandbox company, no model, no network.
// The api part of the pack goes in through toInbound + upsertDocuments; every api/both question runs through the
// assistant's own searchDocuments. Leaks must be zero; the hit rate is measured and written, never asserted (Q3).
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rank, type Level } from "@/features/assist/classify";
import { getDb } from "@/lib/db/client";
import { searchDocuments, upsertDocuments } from "@/lib/db/assist";
import { batches, toInbound } from "../../prisma/generators/musterwerk-docs/load";
import { musterwerkDocs } from "../../prisma/generators/musterwerk-docs/pack";

type Question = {
  id: string;
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
).questions.filter((q) => q.channel === "api" || q.channel === "both");

const files = new Map(musterwerkDocs(1).map((f) => [f.path, f]));
const FINDINGS = fileURLToPath(new URL("../../../../docs/test-phase/findings/AIT-Z1.md", import.meta.url));
const db = getDb();
let companyId = "";

type Result = { id: string; lang: "de" | "en"; scored: boolean; hit: boolean; paths: string[]; leaks: string[] };

const pathOf = (externalId: string) => externalId.replace(/#\d+$/, "");
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)} % (${n}/${d})`);

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  companyId = (await db.company.create({ data: { slug: `ait-z1-${tag}`, name: "ait z1", seedJson: {} } })).id;
  for (const chunk of batches(toInbound(musterwerkDocs(1)), 100)) await upsertDocuments(companyId, chunk);
}, 120_000);

afterAll(async () => {
  if (companyId) await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

describe("AIT acceptance: offline retrieval on the Musterwerk pack, no leak above the ceiling", () => {
  it("leaks nothing above the ceiling or from a forbidden file, and measures the hit rate for every api question", async () => {
    expect(questions.length).toBeGreaterThan(0);
    const results: Result[] = [];
    for (const q of questions) {
      const ceiling: Level = q.needsCeiling ?? "internal";
      const hits = await searchDocuments(companyId, ceiling, q.question, 4);
      const rows = await db.document.findMany({ where: { companyId, id: { in: hits.map((h) => h.id) } }, select: { id: true, externalId: true } });
      const paths = hits.map((h) => pathOf(rows.find((r) => r.id === h.id)?.externalId ?? h.title));
      const leaks: string[] = [];
      hits.forEach((h, i) => {
        const level = files.get(paths[i])?.classification;
        if (q.mustNotFind.includes(paths[i])) leaks.push(`${paths[i]} (mustNotFind)`);
        if (level === "strictly_confidential" || rank(h.classification as Level) > rank(ceiling)) leaks.push(`${paths[i]} (${h.classification} above ${ceiling})`);
      });
      results.push({ id: q.id, lang: q.lang, scored: q.shouldFind.length > 0, hit: q.shouldFind.some((p) => paths.includes(p)), paths, leaks });
    }

    const leaked = results.filter((r) => r.leaks.length > 0).map((r) => `${r.id}: ${r.leaks.join(", ")}`);
    expect(leaked, "leaks per question id").toEqual([]);
    expect(results).toHaveLength(questions.length);

    const scored = results.filter((r) => r.scored);
    const rate = (rs: Result[]) => pct(rs.filter((r) => r.hit).length, rs.length);
    const missed = scored.filter((r) => !r.hit).map((r) => r.id);
    console.info(`AIT-Z1 hit rate all ${rate(scored)}; de ${rate(scored.filter((r) => r.lang === "de"))}; en ${rate(scored.filter((r) => r.lang === "en"))}; missed ${missed.join(", ")}`);

    if (process.env.AIT_WRITE_FINDINGS === "1") {
      const section = [
        "## Measured offline hit rate",
        "",
        `Pack seed 1, api part loaded into a sandbox company, \`searchDocuments(companyId, ceiling, question, 4)\` for ${results.length} api or both questions (${scored.length} with a shouldFind file). Leaks: 0.`,
        "",
        "| Language | Hit rate |",
        "|---|---|",
        `| all | ${rate(scored)} |`,
        `| German | ${rate(scored.filter((r) => r.lang === "de"))} |`,
        `| English | ${rate(scored.filter((r) => r.lang === "en"))} |`,
        "",
        `Missed question ids: ${missed.length ? missed.map((m) => `\`${m}\``).join(", ") : "none"}.`,
        "",
        "| Missed id | Top hits |",
        "|---|---|",
        ...scored.filter((r) => !r.hit).map((r) => `| \`${r.id}\` | ${r.paths.map((p) => `\`${p}\``).join("<br>") || "none"} |`),
        "",
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
