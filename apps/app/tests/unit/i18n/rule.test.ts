import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint, Linter } from "eslint";
import { afterAll, describe, expect, it } from "vitest";
import plugin from "../../../eslint/no-inline-strings.mjs";
import { catalogIssues, inlineStrings } from "./inline";

const APP_ROOT = path.resolve(__dirname, "../../..");

async function lint(code: string): Promise<number[]> {
  const base = (await new ESLint({ cwd: APP_ROOT }).calculateConfigForFile("src/components/x.tsx")) as Linter.Config;
  const linter = new Linter({ configType: "flat", cwd: APP_ROOT });
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: base.languageOptions,
        plugins: { nextup: plugin },
        rules: { "nextup/no-inline-strings": "error" },
      },
    ],
    { filename: path.join(APP_ROOT, "src/components/x.tsx") },
  );
  const fatal = messages.filter((m) => m.fatal);
  if (fatal.length) throw new Error(fatal.map((m) => m.message).join("; "));
  return messages.filter((m) => m.ruleId === "nextup/no-inline-strings").map((m) => m.line);
}

const REPORTED: Record<string, string> = {
  "jsx text": `const a = <p>Raise an idea</p>;`,
  placeholder: `const a = <input placeholder="Search people" />;`,
  "aria-label": `const a = <button aria-label="Close analysis" />;`,
  "message property": `toast({ message: "Saved" });`,
  sentence: `const why = "Only the owner can decide this";`,
  "template literal": "const s = `Due in ${n} days`;",
};

const IGNORED: Record<string, string> = {
  "translated text": `const a = <p>{t("shell.inbox")}</p>;`,
  className: `const a = <div className="flex items-center" />;`,
  "import source": `import x from "Some Module";`,
  directive: `"use client";\nconst a = 1;`,
  "console argument": `console.warn("Could not load the inbox");`,
  "thrown error": `throw new Error("Missing company slug");`,
  "data attribute": `const a = <div data-testid="raise-box" />;`,
  "object key": `const h = { "Content-Type": "x" };`,
  "single word": `const ok = "OK";`,
  "disable comment": `// eslint-disable-next-line nextup/no-inline-strings -- brand name\nconst name = "Acme Corp Holdings";`,
};

describe("LNG no-inline-strings rule", () => {
  for (const [name, code] of Object.entries(REPORTED)) {
    it(`reports ${name}`, async () => {
      expect((await lint(code)).length).toBeGreaterThan(0);
    });
  }
  for (const [name, code] of Object.entries(IGNORED)) {
    it(`ignores ${name}`, async () => {
      expect(await lint(code)).toEqual([]);
    });
  }

  const dir = path.join(APP_ROOT, "node_modules/.cache/lng/l1");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("inlineStrings finds only the dirty file, with its line", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "clean.tsx"), `export const A = () => <p>{t("a.b")}</p>;\n`);
    writeFileSync(path.join(dir, "dirty.tsx"), `export const B = () => (\n  <p>Raise an idea</p>\n);\n`);
    const findings = await inlineStrings(["node_modules/.cache/lng/l1/*.tsx"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "node_modules/.cache/lng/l1/dirty.tsx", line: 2 });
    await expect(inlineStrings(["node_modules/.cache/lng/l1/nope-*.tsx"])).rejects.toThrow();
  });

  it("catalogIssues", () => {
    expect(catalogIssues("common")).toEqual([]);
    expect(catalogIssues("nope")).toEqual(["unknown namespace nope"]);
  });
});
