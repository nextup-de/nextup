// docs/RIGHTS.md: who may do what, asked of the real rights code (features/*/permissions.ts) and written as a table.
// The test fails when the code and the table disagree. A rights change therefore always shows up as a changed row in
// docs/RIGHTS.md, which Kevin reads in the PR instead of the code. To write the table after a deliberate change:
//   npm run rights:write -w @nextup/app
// A new right (a new event, a new kind of person) gets its row or column here in the same PR.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import { ev, raised, SEATS, startedLog, stateOf } from "@/features/projects/project-fixture";

const FILE = resolve(__dirname, "../../../../docs/RIGHTS.md");
const DAY = 20;

type Who = { key: string; label: string; userId: string; role: Actor["role"] };
/** The kinds of people the table asks about. Each is one user in the fixture project below. */
const PEOPLE: Who[] = [
  { key: "lead", label: "Project lead", userId: "u_lb", role: "leader" },
  { key: "admin", label: "Administrator", userId: "u_ad", role: "member" },
  { key: "member", label: "Team member", userId: "u_ci", role: "member" },
  { key: "sponsor", label: "Sponsor", userId: "u_sp", role: "leader" },
  { key: "raiser", label: "Raiser (employee, not on the team)", userId: "u_js", role: "member" },
  { key: "leader", label: "Team leader, not on the team", userId: "u_hs", role: "leader" },
  { key: "incharge", label: "Manager in charge (decided it)", userId: "u_tv", role: "manager" },
  { key: "manager", label: "Manager, not involved", userId: "u_mg", role: "manager" },
  { key: "employee", label: "Employee, not involved", userId: "u_xx", role: "member" },
];

type Row = { label: string; type: string; target: string; payload: EventPayload };
/** The actions. Each payload is valid, so a "no" is about who asks, never about what was sent. */
const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: "A running project",
    rows: [
      { label: "Add, change or remove a page or tool", type: "project.page.added", target: "p_one", payload: { pageId: "notes", title: "Notes", icon: "doc", tools: [{ toolId: "notes-doc", kind: "doc" }] } },
      { label: "Add a step", type: "project.step.added", target: "p_one", payload: { stepId: "s9", text: "New step" } },
      { label: "Move a step nobody owns", type: "project.step.moved", target: "p_one", payload: { stepId: "s1", to: "doing" } },
      { label: "Move a step the team member owns", type: "project.step.moved", target: "p_one", payload: { stepId: "s2", to: "done" } },
      { label: "Edit a step", type: "project.step.edited", target: "p_one", payload: { stepId: "s1", note: "Done when the cart is on line 3" } },
      { label: "Comment on a step", type: "project.step.commented", target: "p_one", payload: { stepId: "s1", text: "Looks good" } },
      { label: "Add or change a milestone", type: "project.milestone.added", target: "p_one", payload: { milestoneId: "m9", title: "Pilot", dueDay: 40 } },
      { label: "Add someone to the team", type: "project.member", target: "p_one", payload: { name: "X. New", userId: "u_new", on: true } },
      { label: "Take an administrator off the team", type: "project.member", target: "p_one", payload: { name: "A. Other", userId: "u_ad2", on: false } },
      { label: "Make someone on the team an administrator", type: "project.member", target: "p_one", payload: { name: "C. Ilg", userId: "u_ci", admin: true } },
      { label: "Pause the project", type: "project.paused", target: "p_one", payload: { untilDay: DAY + 5, why: "Parts are late" } },
      { label: "Stop the project", type: "project.stopped", target: "p_one", payload: { why: "No longer needed" } },
    ],
  },
  {
    group: "The idea",
    rows: [
      { label: "Revise an open idea", type: "case.revised", target: "c_b", payload: { body: "Version 2" } },
      { label: "Revise an idea after its yes (the project's Idea page)", type: "case.revised", target: "c_a", payload: { body: "Version 2" } },
    ],
  },
];

/** The fixture: J. Schmidt raised c_a, it got its yes with L. Brandt leading, C. Ilg is on the team, a sponsor was accepted. */
function fixture(): State {
  const events: CaseEvent[] = [
    ...startedLog(),
    ev("project.member", "L. Brandt", "p_one", { name: "C. Ilg", userId: "u_ci", on: true }, 11),
    ev("project.member", "L. Brandt", "p_one", { name: "A. Admin", userId: "u_ad", on: true }, 11),
    ev("project.member", "L. Brandt", "p_one", { name: "A. Admin", userId: "u_ad", admin: true }, 11),
    ev("project.member", "L. Brandt", "p_one", { name: "A. Other", userId: "u_ad2", on: true }, 11),
    ev("project.member", "L. Brandt", "p_one", { name: "A. Other", userId: "u_ad2", admin: true }, 11),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Nobody's step" }, 11),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s2", text: "C. Ilg's step", owner: "C. Ilg", ownerUserId: "u_ci" }, 11),
    raised("c_b"),
  ];
  const state = stateOf(events, DAY);
  const p = state.projects.find((x) => x.id === "p_one")!;
  // A sponsor is accepted through a draft invitation; the fixture is a legacy project, so it is set here.
  p.sponsorUserId = "u_sp";
  return state;
}

function verdicts(state: State) {
  return ROWS.map(({ group, rows }) => ({
    group,
    rows: rows.map((row) => ({
      row,
      cells: PEOPLE.map((who) => {
        const actor: Actor = { role: who.role, name: who.label, handle: null, userId: who.userId, me: meFor(who.userId, SEATS) };
        return mayAppend(actor, { type: row.type, target: row.target, payload: row.payload }, state).ok;
      }),
    })),
  }));
}

function render(table: ReturnType<typeof verdicts>): string {
  const head = `| Action | ${PEOPLE.map((p) => p.label).join(" | ")} |\n|---|${PEOPLE.map(() => ":-:").join("|")}|`;
  const groups = table.map(({ group, rows }) =>
    [`### ${group}`, "", head, ...rows.map(({ row, cells }) => `| ${row.label} \`${row.type}\` | ${cells.map((ok) => (ok ? "✓" : "—")).join(" | ")} |`)].join("\n"),
  );
  return [
    "# Rights: who may do what",
    "",
    "<!-- Generated by apps/app/tests/unit/rights-table.test.ts. Do not edit by hand: run `npm run rights:write -w @nextup/app`. -->",
    "",
    "This table is asked of the real rights code (`apps/app/src/features/*/permissions.ts`) on a small fixture project.",
    "A unit test fails when the code and this file disagree, so **every rights change is a changed row here**.",
    "Rights changes follow the rules in `CONTRIBUTING.md` (\"Rights\"): their own PR, the `rights` label, Kevin told.",
    "",
    "✓ may, — may not. Everyone in a column is the same one person in the fixture: J. Schmidt raised the idea and the",
    "project grew from it, T. Vogel (route owner, a manager here) said yes, L. Brandt leads it, C. Ilg is on the team and owns one step, A. Admin is an administrator, a sponsor was accepted. Who may",
    "*see* what is in `docs/VISIBILITY.md`.",
    "",
    ...groups.flatMap((g) => [g, ""]),
  ].join("\n");
}

it("RIGHTS: docs/RIGHTS.md is what the rights code says", () => {
  const table = verdicts(fixture());
  // A row nobody may do means its payload or the fixture is wrong, not that the right is gone.
  for (const { rows } of table) for (const { row, cells } of rows) expect(cells.some(Boolean), `nobody may: ${row.label}`).toBe(true);
  const text = render(table);
  if (process.env.RIGHTS_WRITE === "1") writeFileSync(FILE, text);
  let saved = "";
  try {
    saved = readFileSync(FILE, "utf8");
  } catch {
    // missing file: the comparison below fails with the whole table as the diff
  }
  expect(saved, "Rights changed. If on purpose: npm run rights:write -w @nextup/app, then follow CONTRIBUTING.md › Rights.").toBe(text);
});
