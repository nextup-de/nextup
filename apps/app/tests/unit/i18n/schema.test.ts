import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const model = (file: string, name: string) => {
  const src = fs.readFileSync(path.join(root, "prisma/schema", file), "utf8");
  const m = src.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : "";
};

describe("LNG locale columns", () => {
  it("adds nullable locale columns to User and CompanyConfig", () => {
    expect(model("auth.prisma", "User")).toMatch(/^\s*locale\s+String\?/m);
    expect(model("integrations.prisma", "CompanyConfig")).toMatch(/^\s*defaultLocale\s+String\?/m);
  });

  it("has exactly one _lng_locale migration with only those two columns", () => {
    const dirs = fs.readdirSync(path.join(root, "prisma/migrations")).filter((d) => d.endsWith("_lng_locale"));
    expect(dirs).toHaveLength(1);
    const sql = fs.readFileSync(path.join(root, "prisma/migrations", dirs[0], "migration.sql"), "utf8");
    const statements = sql
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'ALTER TABLE "User" ADD COLUMN "locale" TEXT',
      'ALTER TABLE "CompanyConfig" ADD COLUMN "defaultLocale" TEXT',
    ]);
  });
});
