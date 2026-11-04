// The pilot documents (PIL-P1): they exist, they point at things that exist, and they say the few things the plan
// requires them to say. The files are docs/pilot/*.md; nothing here reads the database.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../docs/register";

const ROOT = repoRoot();
const APP = path.join(ROOT, "apps", "app");
const DIR = path.join(ROOT, "docs", "pilot");
const SPEC = path.join(ROOT, "docs", "plans", "2026-11-02_pilot-pages", "09-go-live-and-pilot-report.md");

const FILES = ["README.md", "RUNBOOK.md", "ONBOARDING.md", "TRAINING.de.md", "TRAINING.en.md", "SUPPORT.md", "SUCCESS_METRICS.md", "ONE_PAGER.md"];

const read = (name: string) => fs.readFileSync(path.join(DIR, name), "utf8");
const readRoot = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const all = () => FILES.map(read).join("\n");

const exists = (p: string) => [ROOT, APP, path.join(APP, "src")].some((base) => fs.existsSync(path.join(base, p)));

const REPO_ROOTS = ["docs/", "stack/", "apps/", "src/", "prisma/", "tests/", "ops/", "packages/", "services/"];
const PATHLIKE = /^[\w.[\]@-]+(\/[\w.[\]@-]+)+\/?$/;

/** Inline-code names in a document that look like a path into this repository. */
function repoPaths(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/`([^`\n]+)`/g)) {
    const raw = m[1].trim();
    if (!PATHLIKE.test(raw)) continue;
    if (REPO_ROOTS.some((r) => raw.startsWith(r))) out.add(raw);
  }
  return [...out];
}

function relativeLinks(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    out.push(target.split("#")[0]);
  }
  return out;
}

const bashBlocks = (md: string) => [...md.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)].map((m) => m[1]);
const flagsOf = (line: string) => [...line.matchAll(/(?:^|\s)(--[a-z][a-z-]*)/g)].map((m) => m[1]);

describe("PIL docs", () => {
  it("every pilot document exists and starts with a title and an Updated line", () => {
    for (const name of FILES) {
      expect(fs.existsSync(path.join(DIR, name)), name).toBe(true);
      const lines = read(name).split("\n");
      expect(lines[0], name).toMatch(/^# \S/);
      expect(lines.slice(1, 4).join("\n"), name).toMatch(/^> \*\*(Updated|Stand) \d{4}-\d{2}-\d{2}\./m);
    }
  });

  it("training exists in German and in English with the same sections", () => {
    const de = read("TRAINING.de.md");
    const en = read("TRAINING.en.md");
    const heads = (s: string) => [...s.matchAll(/^## /gm)].length;
    expect(heads(de)).toBe(heads(en));
    expect(de).toMatch(/Rechtzeitig antworten/);
    expect(de).toMatch(/Vertretung/);
    expect(de).toMatch(/Erinnerungen/);
    expect(en).toMatch(/Answer on time/);
    expect(en).toMatch(/deputy/i);
    expect(en).toMatch(/Reminders/);
    expect(en).not.toMatch(/Vertretung|Erinnerungen/);
    for (const text of [de, en]) expect(text).toMatch(/30 (Minuten|minutes)/);
  });

  it("training says no person is ranked or counted (PILOT/HD5)", () => {
    expect(read("TRAINING.en.md")).toMatch(/never ranks a person/);
    expect(read("TRAINING.de.md")).toMatch(/rankt keine Person/);
    expect(read("TRAINING.en.md")).toMatch(/fewer than five people/);
    expect(read("TRAINING.de.md")).toMatch(/weniger als fünf Personen/);
  });

  it("every relative link resolves", () => {
    const missing: string[] = [];
    for (const name of FILES) {
      for (const link of relativeLinks(read(name))) {
        if (!fs.existsSync(path.resolve(DIR, link))) missing.push(`${name} -> ${link}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every repo path named in backticks exists", () => {
    const missing: string[] = [];
    for (const name of FILES) {
      for (const p of repoPaths(read(name))) if (!exists(p)) missing.push(`${name}: ${p}`);
      // A bare file name of another pilot document, such as `SUPPORT.md`.
      for (const m of read(name).matchAll(/`([A-Z_]+(?:\.(?:de|en))?\.md)`/g)) {
        if (!fs.existsSync(path.join(DIR, m[1]))) missing.push(`${name}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every stack script and every command flag the documents name exists", () => {
    const run = fs.readFileSync(path.join(APP, "prisma", "generators", "pilot", "run.ts"), "utf8");
    const install = readRoot("stack", "install.sh");
    const clean = readRoot("stack", "tests", "install-clean.sh");
    const backup = readRoot("stack", "backup.sh");
    const missing: string[] = [];
    for (const name of FILES) {
      const md = read(name);
      for (const m of md.matchAll(/(?:^|[\s`=/~])((?:\$HOME\/nextup\/|~\/nextup\/)?stack\/[A-Za-z0-9_./-]+\.(?:sh|mjs))/g)) {
        const rel = m[1].replace(/^(\$HOME|~)\/nextup\//, "");
        if (!fs.existsSync(path.join(ROOT, rel))) missing.push(`${name}: ${rel}`);
      }
      for (const block of bashBlocks(md)) {
        // Join "\" continuations so a flag on the second line belongs to its command.
        for (const line of block.replace(/\\\n\s*/g, " ").split("\n")) {
          const flags = flagsOf(line);
          if (line.includes("generators/pilot/run.ts")) {
            const sub = /run\.ts\s+(\w+)/.exec(line)?.[1] ?? "";
            if (!["bootstrap", "sample", "report"].includes(sub)) missing.push(`${name}: run.ts subcommand ${sub}`);
            for (const f of flags) if (!run.includes(`"${f.slice(2)}"`)) missing.push(`${name}: run.ts ${f}`);
          } else if (line.includes("install-clean.sh")) {
            for (const f of flags) if (!clean.includes(f) && !install.includes(f)) missing.push(`${name}: install-clean.sh ${f}`);
          } else if (line.includes("install.sh")) {
            for (const f of flags) if (!install.includes(f)) missing.push(`${name}: install.sh ${f}`);
          } else if (line.includes("backup.sh")) {
            const words = line.split(/\s+/).filter((w) => /^[a-z-]+$/.test(w) && w !== "stack");
            for (const w of words) if (!backup.includes(w)) missing.push(`${name}: backup.sh ${w}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    // The flags the runbook is about are real.
    for (const f of ["brain-cloud"]) expect(install).toContain(`--${f}`);
    for (const f of ["dry-run", "codes", "json", "config"]) expect(run).toContain(`"${f}"`);
  });

  it("the runbook and the onboarding each have a heading Joint setup session", () => {
    expect(read("RUNBOOK.md")).toMatch(/^## Joint setup session$/m);
    expect(read("ONBOARDING.md")).toMatch(/^## Joint setup session$/m);
  });

  it("the onboarding session names who attends, what each brings, what is checked and how it ends", () => {
    const md = read("ONBOARDING.md");
    const session = md.slice(md.indexOf("## Joint setup session"));
    for (const word of ["Who attends", "What each brings", "What is checked", "What the session ends with"]) expect(session).toContain(word);
    expect(session).toMatch(/pilot lead/);
    expect(session).toMatch(/Your IT/);
  });

  it("the runbook goes in order, from the VM to moving to live", () => {
    const md = read("RUNBOOK.md");
    const at = (s: string) => {
      const i = md.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      "## 1. Hardened VM", "## 2. Install", "## 3. Config file", "## 4. Bootstrap", "## 5. What each check needs",
      "## Joint setup session", "## 7. One real test mail", "## 8. The switch", "## 9. Rollback to sandbox",
      "## 10. First-week checks", "## 11. Weekly numbers", "## 12. Moving to live",
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md).toContain("--brain-cloud");
  });

  it("the runbook explains --dry-run, the --codes rules and the exit codes", () => {
    const md = read("RUNBOOK.md");
    expect(md).toMatch(/--dry-run/);
    expect(md).toMatch(/writes nothing/);
    expect(md).toMatch(/--codes/);
    expect(md).toMatch(/0600/);
    expect(md).toMatch(/never overwritten|refused before anything is written/);
    expect(md).toMatch(/never reach the\s+screen/);
    for (const code of ["| 0 |", "| 1 |", "| 2 |", "| 3 |"]) expect(md).toContain(code);
  });

  it("the runbook names every go-live check the app has", () => {
    const messages = fs.readFileSync(path.join(APP, "src", "i18n", "messages", "settingsGoLive.ts"), "utf8");
    const en = messages.slice(0, messages.indexOf("  de: {"));
    const names = [...en.matchAll(/^\s+check[A-Z]\w*: "([^"]+)"/gm)].map((m) => m[1]);
    names.splice(0, names.length, ...names.filter((n) => n !== "Check again" && n !== "Checking…"));
    expect(names.length).toBeGreaterThanOrEqual(13);
    const md = read("RUNBOOK.md");
    for (const n of names) expect(md, n).toContain(n);
  });

  it("the runbook says the Backups check shows only the last successful backup", () => {
    const md = read("RUNBOOK.md");
    expect(md).toMatch(/last successful/i);
    expect(md).toMatch(/failed attempt/);
    expect(md).toMatch(/restore test/);
  });

  it("the runbook lists what the session checks by hand, and a green checklist does not authorise a pilot", () => {
    const md = read("RUNBOOK.md");
    for (const item of ["Signed agreements", "Works council", "Restore test", "Open TST findings", "Residual access"]) expect(md).toContain(item);
    for (const name of ["RUNBOOK.md", "ONBOARDING.md"]) {
      expect(read(name), name).toMatch(/green checklist[^.]*does not authorise a pilot/i);
    }
  });

  it("the runbook keeps the real test mail, the switch and the rollback apart", () => {
    const md = read("RUNBOOK.md");
    expect(md).toMatch(/In sandbox the app sends no case mail/);
    expect(md).toMatch(/Switch back to sandbox/);
    expect(md).toMatch(/signed out once/);
  });

  it("the pilot README says what is ready, what is Kevin's and Marc's, and links the findings", () => {
    const md = read("README.md");
    for (const file of FILES.filter((f) => f !== "README.md")) expect(md, file).toContain(`(${file})`);
    for (const word of ["contract", "works council", "penetration test", "Two weeks of internal"]) expect(md, word).toContain(word);
    expect(md).toMatch(/Kevin's and Marc's/);
    expect(md).toContain("../test-phase/findings/");
    expect(md).toMatch(/no code fix in PIL/);
    expect(md).toMatch(/not the same as accepting a risk/);
  });

  it("support names an owner and an escalation, and leaves the person, the SLA and the price undecided", () => {
    const md = read("SUPPORT.md");
    expect(md).toMatch(/Support owner/);
    expect(md).toMatch(/Incident lead/);
    expect(md).toMatch(/\*\*Escalation\.\*\*/);
    expect((md.match(/KEVIN: fill in/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(md).toMatch(/SLA: undecided\. Price: undecided/);
    for (const level of ["1 Critical", "2 High", "3 Normal", "4 Question"]) expect(md).toContain(level);
    expect(md).toMatch(/72 hours/);
    expect(md).toMatch(/no night, weekend or holiday cover/i);
  });

  it("the success measures use the report's own tiles and the small-unit rule", () => {
    const md = read("SUCCESS_METRICS.md");
    const messages = fs.readFileSync(path.join(APP, "src", "i18n", "messages", "settingsPilotReport.ts"), "utf8");
    const en = messages.slice(0, messages.indexOf("  de: {"));
    for (const key of ["tileCases", "tileFirstAnswer", "tileOnTime", "tileUsing"]) {
      const label = new RegExp(`${key}: "([^"]+)"`).exec(en)?.[1];
      expect(label, key).toBeTruthy();
      expect(md, key).toContain(label!);
    }
    expect(md).toMatch(/fewer than 5 active people/);
    expect(md).toMatch(/Too few to show/);
    expect(md).toMatch(/No person numbers/);
  });

  it("the one-pager is the facts, with the price left for Kevin and no amount", () => {
    const md = read("ONE_PAGER.md");
    expect(md).toMatch(/KEVIN: fill in/);
    expect(md).not.toMatch(/(€|EUR|CHF|USD|\$)\s?\d|\d[\d.,']*\s?(€|EUR|CHF|USD)\b/);
    expect(md).toMatch(/does not rank or count people/i);
    expect(md).toMatch(/no certification/i);
  });

  it("no pilot document claims a total number of pilot weeks (PIL/D5)", () => {
    expect(all()).not.toMatch(/pilot week \d+ of \d+|of \{total\}/i);
  });

  it("docs/README.md links the pilot folder once", () => {
    const readme = readRoot("docs", "README.md");
    expect(readme.split("(pilot/README.md)").length - 1).toBe(1);
  });

  it("spec 09 no longer says PIL has no Bauplan and follows the plan (PIL/D5)", () => {
    const spec = fs.readFileSync(SPEC, "utf8");
    expect(spec).not.toMatch(/No Bauplan yet/i);
    expect(spec).not.toMatch(/no Bauplan for either/i);
    expect(spec).not.toMatch(/pilot week \d+ of \d+|of \{total\}/);
    expect(spec).not.toMatch(/904 of 1,482/);
    expect(spec).not.toMatch(/Numbers you enter/);
    expect(spec).not.toMatch(/Test mail accepted/);
    expect(spec).toMatch(/Cases per 10 people/);
    expect(spec).toMatch(/active managers/);
    expect(spec).toMatch(/a line and a link, not a form/);
    expect(spec).toMatch(/Baseline \*\(recommended\)\*/);
  });
});
