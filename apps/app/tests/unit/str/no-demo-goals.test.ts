import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS } from "@/features/demo/structure";
import { ideaContext } from "@/features/ideas/drafts";
import { companyBrief, rowsFromSeed } from "@/features/knowledge";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

describe("STR no demo goals in the app", () => {
  const all = files(SRC).map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));
  it("imports neither GOALS nor SPEND_LIMIT_EUR", () => {
    const bad = all.filter((f) => /import\s*(type\s*)?\{[^}]*\b(GOALS|SPEND_LIMIT_EUR)\b[^}]*\}/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
  it("uses DEMO_GOALS and DEMO_RULES only where the demo template lives", () => {
    const allowed = ["src/features/demo/", "src/server/admin-insight.ts", "src/server/actions/admin.ts"];
    const bad = all.filter((f) => !allowed.some((a) => f.path.startsWith(a)) && /\b(DEMO_GOALS|DEMO_RULES)\b/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
  it("makes ideaContext take the spend rule", () => {
    expect(ideaContext.length).toBe(4);
  });
  it("gives a company without rows no acme goal in its brief", () => {
    const k = rowsFromSeed({ ...SEED, depts: [], people: [], routes: [] }, [], () => "id");
    const brief = companyBrief(k, null);
    for (const g of DEMO_GOALS) expect(brief).not.toContain(g.goal);
  });
});
