import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../docs/register";

const root = repoRoot();
const GUIDES = ["INSTALL.md", "OPERATIONS.md", "SECURITY_GUIDE.md"];
const guidePath = (name: string) => path.join(root, "docs", "customer", name);
const read = (name: string) => fs.readFileSync(guidePath(name), "utf8");

function relativeLinks(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    out.push(target.split("#")[0]);
  }
  return out;
}

function bashBlocks(md: string): string[] {
  return [...md.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)].map((m) => m[1]);
}

describe("SEC customer guides", () => {
  for (const name of GUIDES) {
    it(`${name} exists and starts with an Updated line`, () => {
      expect(fs.existsSync(guidePath(name))).toBe(true);
      const lines = read(name).split("\n");
      expect(lines.find((l) => l.includes("Updated"))).toMatch(/^> \*\*Updated \d{4}-\d{2}-\d{2}\.\*\*/);
      // The Updated line follows the title directly.
      expect(lines[0]).toMatch(/^# /);
      expect(lines[2]).toMatch(/^> \*\*Updated /);
    });

    it(`${name}: every relative link resolves`, () => {
      const links = relativeLinks(read(name));
      expect(links.length).toBeGreaterThan(0);
      const missing = links.filter((l) => !fs.existsSync(path.resolve(path.dirname(guidePath(name)), l)));
      expect(missing).toEqual([]);
    });

    it(`${name}: every script a bash block runs exists`, () => {
      const missing: string[] = [];
      for (const block of bashBlocks(read(name))) {
        for (const m of block.matchAll(/(?:^|[\s=/~])((?:\$HOME\/nextup\/|~\/nextup\/)?stack\/[A-Za-z0-9_./-]+\.(?:sh|mjs))/g)) {
          const rel = m[1].replace(/^(\$HOME|~)\/nextup\//, "");
          if (!fs.existsSync(path.join(root, rel))) missing.push(rel);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("the guides reference at least the scripts the plan names", () => {
    const all = GUIDES.map(read).join("\n");
    for (const s of ["stack/install.sh", "stack/deploy-remote.sh", "stack/rotate-keys.sh", "stack/break-glass.sh", "stack/backup.sh"]) {
      expect(all).toContain(s);
    }
  });

  it("docs/README.md lists each guide exactly once", () => {
    const readme = fs.readFileSync(path.join(root, "docs", "README.md"), "utf8");
    for (const name of GUIDES) {
      const count = readme.split(`(customer/${name})`).length - 1;
      expect(count, name).toBe(1);
    }
  });
});
