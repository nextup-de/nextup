// REM-O2: the pilot bootstrap marks its first admin as the stack admin, exactly one (plan REM, P8.8:bootstrap-admin). The config side and the runbook; the
// rows the bootstrap writes are in tests/db/rem-bootstrap-admin.test.ts. Flat tests (D2).
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { parsePilotConfig, stackAdminProblems, wantsStackAdmin } from "../../../prisma/generators/pilot/config";

const ROOT = path.resolve(__dirname, "../../../../..");
const base = { slug: "acme-pilot", name: "Acme GmbH", calendar: "de-by" };
const admin = { name: "Erika Muster", email: "erika.muster@acme.example" };
const parse = (over: Record<string, unknown>) => parsePilotConfig(JSON.stringify({ ...base, ...over }));

/** The runbook's section 4 (Bootstrap), up to section 5. */
const runbookInstall = () => {
  const md = readFileSync(path.join(ROOT, "docs/pilot/RUNBOOK.md"), "utf8");
  return md.slice(md.indexOf("## 3. Config file"), md.indexOf("## 5. What each check needs"));
};

it("REM bootstrap marks one stack admin", () => {
  // The first admin with `stackAdmin: true` is the stack admin; without the key it is only the company admin, as before.
  const on = parse({ admin: { ...admin, stackAdmin: true } });
  expect(on.ok && wantsStackAdmin(on.config)).toBe(true);
  const off = parse({ admin });
  expect(off.ok && wantsStackAdmin(off.config)).toBe(false);
  // Only `true` is a value: no false, no text, no number.
  for (const bad of [false, "yes", 1, null]) expect(parse({ admin: { ...admin, stackAdmin: bad } }).ok, String(bad)).toBe(false);
  // Nobody else on the company is touched: another admin there that is the config's own (any case) makes no problem, and neither does a company with none.
  const cfg = on.ok ? on.config : null;
  expect(cfg).not.toBeNull();
  expect(stackAdminProblems(cfg!, [])).toEqual([]);
  expect(stackAdminProblems(cfg!, [{ email: "Erika.Muster@acme.example" }])).toEqual([]);
  // The runbook's example config and the generator's README make the admin the stack admin, and the example is a config the bootstrap accepts.
  for (const file of ["docs/pilot/RUNBOOK.md", "apps/app/prisma/generators/pilot/README.md"]) {
    const md = readFileSync(path.join(ROOT, file), "utf8");
    const json = /```json\n([\s\S]*?)\n```/.exec(md)![1];
    const example = parsePilotConfig(json.replace('"flags": { "discussion": true },\n', ""));
    expect(example.ok && wantsStackAdmin(example.config), file).toBe(true);
  }
  // The install section names the stack admin as the one console session and the break-glass window as the only other way in.
  const text = runbookInstall();
  expect(text).toMatch(/\*\*stack admin\*\*/);
  expect(text).toMatch(/one\s+console\s+session/);
  expect(text).toMatch(/break-glass\s+window/);
  expect(text).toMatch(/stack\/break-glass\.sh <slug> open/);
});

it("REM bootstrap refuses two stack admins", () => {
  const cfg = parse({ admin: { ...admin, stackAdmin: true } });
  if (!cfg.ok) throw new Error(cfg.problems.join("; "));
  // A company that has a different active stack admin already: refused, and the message names who.
  const problems = stackAdminProblems(cfg.config, [{ email: "someone.else@acme.example" }]);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("someone.else@acme.example");
  expect(problems[0]).toContain("exactly one");
  expect(stackAdminProblems(cfg.config, [{ email: "erika.muster@acme.example" }, { email: "someone.else@acme.example" }])).toHaveLength(1);
  // A config that does not ask for a stack admin has nothing to refuse.
  const plain = parse({ admin });
  expect(plain.ok && stackAdminProblems(plain.config, [{ email: "someone.else@acme.example" }])).toEqual([]);
  // The config cannot name two: one admin entry, no list, no second flag.
  expect(parse({ admin: [{ ...admin, stackAdmin: true }, { name: "Max", email: "max@acme.example", stackAdmin: true }] }).ok).toBe(false);
  expect(parse({ admin: { ...admin, stackAdmin: true }, admins: [{ name: "Max", email: "max@acme.example", stackAdmin: true }] }).ok).toBe(false);
  expect(parse({ admin: { ...admin, stackAdmin: true }, stackAdmin: true }).ok).toBe(false);
});
