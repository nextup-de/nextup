// IDN-S1: nothing in features/cases or features/projects decides who someone is by a display label (IDN/D2).
// A line that compares a person label is a failure unless it is on the explicit list below, written out in full.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as selectors from "@/features/cases/selectors";

const SRC = join(__dirname, "..", "..", "..", "src");
const DIRS = ["features/cases", "features/projects"];
/** Visibility lists names by choice (D14, VIS); the one excepted file. */
const EXCEPT_FILE = "features/cases/visibility.ts";

// A person label as an operand: x.name, p.owner.name, row.lead, ... or the bare identifiers name, actor, who, handle, lead.
const LAB =
  String.raw`(?:(?:[\w$?]+\.)*(?:name|actor|assignee|from|lead|by|to|deputy|handle|members|authors|invited|team)(?![\w(])` +
  String.raw`|(?<![.\w$])(?:name|actor|who|handle|lead)(?![\w(.]))`;
// ... compared (===, !==) or looked up (.includes( / .indexOf( with the label as the needle or the haystack).
const COMPARES = [
  new RegExp(LAB + String.raw`\s*[!=]==`),
  new RegExp(String.raw`[!=]==\s*` + LAB),
  new RegExp(String.raw`\.(?:includes|indexOf)\(\s*` + LAB + String.raw`\s*[,)]`),
  new RegExp(LAB + String.raw`\.(?:includes|indexOf)\(`),
];

/** Comparisons that are not about a person. Each one: file, the line as written (trimmed), why. */
const EXCEPTIONS: { file: string; line: string; reason: string }[] = [
  { file: "features/projects/permissions.ts", line: 'if (!from || !into || from === into) return no("projectPages.permPageUnknown");', reason: "`from` and `into` are project pages, compared to refuse merging a page into itself" },
  { file: "features/projects/permissions.ts", line: 'if (pages.some((x) => x.id === merge.from.id)) return no("projectPages.permPageExists");', reason: "`merge.from.id` is the source page id, checked against active page ids before undoing a merge" },
  { file: "features/cases/discussion.ts", line: "const seat = [...seats].sort((a, b) => a.sort - b.sort).find((s) => s.userId !== null && s.label === head.name);", reason: "the org chart (OrgPerson) has no ids: its head is bound to a seat once, here, to show a suggestion (D14)" },
  { file: "features/cases/discussion.ts", line: "const raiser = raiserSeat ? people.find((p) => p.name === raiserSeat.label) : undefined;", reason: "finds the raiser on the org chart (no ids there) from their own seat, to show their department (D14)" },
  { file: "features/cases/discussion.ts", line: "return inDept.find((p) => !inDept.some((q) => q.name === p.reportsTo)) ?? null;", reason: "org chart reportsTo is a directory label; reads the chart, decides nothing about who someone is (D14)" },
  { file: "features/cases/permissions.ts", line: "return typeof by === \"number\" && Number.isInteger(by) && by >= 1 && by <= 30 ? OK : no(t, \"cases.permClockRange\");", reason: "`by` is a number of days, not a person" },
  { file: "features/cases/permissions.ts", line: "if (typeof pl.lead !== \"string\" || !pl.lead.trim() || pl.lead.length > 120) return no(t, \"cases.permProjectLead\");", reason: "a type and length check of the lead label, no comparison with a person" },
  { file: "features/projects/permissions.ts", line: "const isMe = (who: string | null) => uid !== null && who === uid;", reason: "`who` holds a user id here, compared with the actor's user id" },
  { file: "features/projects/permissions.ts", line: "if (pl.to !== undefined && !(typeof pl.to === \"string\" && STARTS.includes(pl.to))) return no(\"projects.permStepStart\");", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/permissions.ts", line: "return typeof pl.to === \"string\" && (STEP_COLUMNS as readonly string[]).includes(pl.to) ? OK : no(\"projects.permMoveWhere\");", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/reduce.ts", line: "lead: row.lead, members: (row.members ?? []).filter((m) => m !== row.lead),", reason: "de-duplicates the shown member labels of a seed row; the ids are memberUserIds" },
  { file: "features/projects/reduce.ts", line: "if (!have.authors.includes(source.from)) have.authors.push(source.from);", reason: "de-duplicates the shown author labels; the ids are authorUserIds" },
  { file: "features/projects/reduce.ts", line: "if (name) p.members = p.members.filter((m) => m !== name); // the shown list only", reason: "de-duplicates the shown member labels; the ids are memberUserIds" },
  { file: "features/projects/reduce.ts", line: "if (to) p.members = p.members.filter((m) => m !== to);", reason: "de-duplicates the shown member labels; the ids are memberUserIds" },
  { file: "features/projects/reduce.ts", line: "const column: StepColumn = isColumn(pl.to) && pl.to !== \"blocked\" ? pl.to : \"todo\";", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/reduce.ts", line: "const changed = s.column !== pl.to;", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/reduce.ts", line: "if (pl.to !== \"todo\" && s.startedDay === null) s.startedDay = d;", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/reduce.ts", line: "s.doneDay = pl.to === \"done\" ? (changed || s.doneDay === null ? d : s.doneDay) : null;", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/views.ts", line: "case \"project.step.added\": return t(\"projects.tlStepAdded\", { text: (pl.text ?? \"\") + (pl.to && pl.to !== \"todo\" ? \" \" + t(\"projects.tlStepAddedIn\", { column: columnLabel(pl.to, locale) }) : \"\") });", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/views.ts", line: "if (ev.type === \"project.step.added\" && pl.stepId) col[pl.stepId] = pl.to && pl.to !== \"blocked\" ? pl.to : \"todo\";", reason: "`to` is a step column here, not a person" },
  { file: "features/projects/views.ts", line: "if (col[pl.stepId] === pl.to) return [];", reason: "`to` is a step column here, not a person" },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("IDN no display-name identity", () => {
  it("no source file under features/cases or features/projects compares a person label", () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const path of files(join(SRC, dir))) {
        const file = relative(SRC, path).split("\\").join("/");
        if (file === EXCEPT_FILE) continue;
        readFileSync(path, "utf8").split(/\r?\n/).forEach((raw, k) => {
          const line = raw.trim();
          if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return;
          const code = line.replace(/\s\/\/ .*$/, "");
          if (!COMPARES.some((re) => re.test(code))) return;
          if (EXCEPTIONS.some((e) => e.file === file && e.line === line)) return;
          hits.push(`${file}:${k + 1}  ${line}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });

  it("every exception is still a line of its file", () => {
    for (const e of EXCEPTIONS) {
      expect(readFileSync(join(SRC, e.file), "utf8").split(/\r?\n/).map((l) => l.trim()), e.reason).toContain(e.line);
    }
  });

  it("selectors.ts exports none of the deprecated label selectors", () => {
    for (const name of ["onDesk", "inboxFor", "mineFor", "cosignedBy", "actedBy", "deskFor", "clearedBy", "deskHolders"]) {
      expect(Object.keys(selectors), name).not.toContain(name);
    }
  });
});
