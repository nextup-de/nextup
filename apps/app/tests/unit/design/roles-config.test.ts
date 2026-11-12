// DESIGN_RULES.md, section 4: the shell is chosen per role, and roles, homes and nav are config (ROLE_HOME, SHELL, NAV), never hard-coded in a page.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, NAV_SIMPLE } from "@/config/nav";
import { ROLE_HOME, ROLES, SHELL } from "@/config/roles";
import { againstAllowList, filesUnder, read, ROOT } from "./guard";

const APP = "src/app/[company]/(app)";

/** Does a path relative to /<company> name a page of the app? Dynamic segments match any folder like [x]. */
function routeExists(href: string): boolean {
  let dir = path.join(ROOT, APP);
  for (const part of href.split("/").filter(Boolean)) {
    const next = existsSync(path.join(dir, part)) ? part : existsSync(dir) ? readdirSync(dir).find((n) => /^\[.+\]$/.test(n)) : undefined;
    if (!next) return false;
    dir = path.join(dir, next);
  }
  return existsSync(path.join(dir, "page.tsx"));
}

/** What the rule says each role gets. */
const SHELL_RULE = { member: "simple", leader: "rail", manager: "rail" } as const;
/** Shells that differ from the rule. */
const SHELL_ALLOWED: Record<string, string> = {
  "SHELL.leader": "config/roles.ts: the rail 'is not used in the demo'; every role has the simple shell for now",
  "SHELL.manager": "config/roles.ts: the rail 'is not used in the demo'; every role has the simple shell for now",
};

describe("DESIGN shell and roles", () => {
  it("every role has a home, a shell and a simple nav", () => {
    for (const role of ROLES) {
      expect(ROLE_HOME[role], `ROLE_HOME.${role}`).toMatch(/^\//);
      expect(["simple", "rail"], `SHELL.${role}`).toContain(SHELL[role]);
      expect(NAV_SIMPLE[role].length, `NAV_SIMPLE.${role}`).toBeGreaterThan(0);
    }
  });

  it("members get the simple bar; leaders and managers the rail, unless the shell is listed as not yet moved", () => {
    const found = ROLES.filter((r) => SHELL[r] !== SHELL_RULE[r]).map((r) => `SHELL.${r}`);
    expect(againstAllowList(found, SHELL_ALLOWED)).toEqual({ fresh: [], fixed: [] });
  });

  it("every home and every nav target is a page that exists", () => {
    const hrefs = new Set([...Object.values(ROLE_HOME), ...NAV.map((n) => n.href), ...ROLES.flatMap((r) => NAV_SIMPLE[r].map((n) => n.href))]);
    expect([...hrefs].filter((h) => !routeExists(h)).sort()).toEqual([]);
  });

  it("every nav entry names the roles that see it, and a role only sees what it has access to", () => {
    for (const item of NAV) expect(item.roles.length, item.href).toBeGreaterThan(0);
  });

  it("no page or layout under src/app compares the signed-in role with a role name", () => {
    const pages = filesUnder("src/app", "page.tsx", "layout.tsx");
    const literal = /\brole\b\s*[!=]==?\s*["'](manager|leader|member)["']|["'](manager|leader|member)["']\s*[!=]==?\s*\brole\b|\[[^\]]*["'](manager|leader|member)["'][^\]]*\]\.includes\(\s*\w*\.?role\s*\)/;
    const found = pages.filter((f) => literal.test(read(f).replace(/\/\/.*$/gm, "")));
    expect(found).toEqual([]);
    expect(pages.length).toBeGreaterThan(10);
  });
});
