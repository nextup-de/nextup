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
  { key: "colead", label: "Co-lead", userId: "u_co", role: "member" },
  { key: "member", label: "Team member", userId: "u_ci", role: "member" },
  { key: "sponsor", label: "Sponsor", userId: "u_sp", role: "leader" },
  { key: "raiser", label: "Raiser (employee, not on the team)", userId: "u_js", role: "member" },
  { key: "leader", label: "Team leader, not on the team", userId: "u_hs", role: "leader" },
  { key: "incharge", label: "Manager in charge (decided it)", userId: "u_tv", role: "manager" },
  { key: "manager", label: "Manager, not involved", userId: "u_mg", role: "manager" },
  { key: "added", label: "Manager a co-lead added", userId: "u_mc", role: "manager" },
  { key: "employee", label: "Employee, not involved", userId: "u_xx", role: "member" },
];

type Row = { label: string; type: string; target: string; payload: EventPayload; nobody?: true };
/** The actions. Each payload is valid, so a "no" is about who asks, never about what was sent; `nobody` marks a row no one may. */
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
      { label: "Add someone to the team when the idea is private", type: "project.member", target: "p_priv", payload: { name: "X. New", userId: "u_new", on: true } },
      { label: "Take someone the lead added off the team", type: "project.member", target: "p_one", payload: { name: "C. Ilg", userId: "u_ci2", on: false, unassign: true } },
      { label: "Take someone a co-lead added off the team", type: "project.member", target: "p_one", payload: { name: "N. New", userId: "u_n", on: false, unassign: true } },
      { label: "Invite someone as member", type: "project.invited", target: "p_one", payload: { userId: "u_new", role: "member" } },
      { label: "Ask someone to be co-lead", type: "project.invited", target: "p_one", payload: { userId: "u_ci", role: "colead" } },
      { label: "Ask a manager to be co-lead", type: "project.invited", target: "p_one", payload: { userId: "u_mg", role: "colead" }, nobody: true },
      { label: "Take the co-lead role back from someone else", type: "project.member", target: "p_one", payload: { userId: "u_co2", coLead: false } },
      { label: "Move a step somebody else owns", type: "project.step.moved", target: "p_one", payload: { stepId: "s3", to: "done" } },
      { label: "Remove a step somebody else added", type: "project.step.edited", target: "p_one", payload: { stepId: "s3", removed: true } },
      { label: "End a pause early", type: "project.resumed", target: "p_pause", payload: {} },
      { label: "Mark the project done", type: "project.done", target: "p_done", payload: {} },
      { label: "Hand over the lead", type: "project.handed", target: "p_one", payload: { toUserId: "u_ci", to: "C. Ilg" } },
      { label: "Send the idea back after the lead stopped it", type: "case.reopened", target: "c_stop", payload: { why: "stopped" } },
      { label: "Pause the project", type: "project.paused", target: "p_one", payload: { untilDay: DAY + 5, why: "Parts are late" } },
      { label: "Stop the project", type: "project.stopped", target: "p_one", payload: { why: "No longer needed" } },
    ],
  },
  {
    group: "A project draft",
    rows: [
      { label: "Rename the draft", type: "project.renamed", target: "p_draft", payload: { title: "Changeover cart, line 3" } },
      { label: "Move the draft's start before it is late", type: "project.start.moved", target: "p_draft", payload: { dueDay: DAY + 5, why: "Parts are late" } },
      { label: "Move the start of a late draft", type: "project.start.moved", target: "p_late", payload: { dueDay: DAY + 5, why: "Parts are late" } },
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
    ...["u_ci2", "u_co", "u_co2", "u_n", "u_mc"].map((u) => ev("project.member", "L. Brandt", "p_one", { name: u, userId: u, on: true }, 11)),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Nobody's step" }, 11),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s2", text: "C. Ilg's step", owner: "C. Ilg", ownerUserId: "u_ci" }, 11),
    ev("project.step.added", "L. Brandt", "p_one", { stepId: "s3", text: "The lead's step", owner: "L. Brandt", ownerUserId: "u_lb" }, 11),
    raised("c_b"),
  ];
  const state = stateOf(events, DAY);
  state.managerUserIds = PEOPLE.filter((w) => w.role === "manager").map((w) => w.userId);
  const p = state.projects.find((x) => x.id === "p_one")!;
  // A sponsor is accepted through a draft invitation; the fixture is a legacy project, so it is set here.
  p.sponsorUserId = "u_sp";
  // Co-leads come from a draft invitation too; N. New and one manager were added by a co-lead.
  p.draft = true;
  p.coLeadUserIds = ["u_co", "u_co2"];
  p.addedByCoLeadUserIds = ["u_n", "u_mc"];
  // Copies for the rows that need another state: paused, without open steps, and stopped by the lead.
  const c = state.cases.find((x) => x.id === "c_a")!;
  const stop = ev("project.stopped", "L. Brandt", "p_stop", { why: "No longer needed" }, 15);
  state.projects.push(
    { ...p, id: "p_pause", pausedUntil: DAY + 3 }, { ...p, id: "p_done", steps: [] },
    { ...p, id: "p_draft", status: "planning", startedDay: null, startDay: DAY + 2, leadState: "taken" },
    { ...p, id: "p_late", status: "planning", startedDay: null, startDay: DAY - 2, leadState: "taken" },
    { ...p, id: "p_priv", sources: ["c_priv"] },
    { ...p, id: "p_stop", status: "stopped", sources: ["c_stop"], history: [...p.history, stop] });
  const priv = { ...c, id: "c_priv", history: c.history.map((e) => (e.type === "case.raised" ? { ...e, payload: { ...e.payload, visibility: "private" as const } } : e)) };
  state.cases.push(priv, { ...c, id: "c_stop", decided: c.decided ? { ...c.decided, projectId: "p_stop" } : null });
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
    "project grew from it, T. Vogel (route owner, a manager here) said yes, L. Brandt leads it, C. Ilg is on the team and owns one step, one member took the co-lead role, a sponsor was accepted. Who may",
    "*see* what is in `docs/VISIBILITY.md`.",
    "",
    ...groups.flatMap((g) => [g, ""]),
  ].join("\n");
}

it("RIGHTS: docs/RIGHTS.md is what the rights code says", () => {
  const table = verdicts(fixture());
  // A row nobody may do means its payload or the fixture is wrong, not that the right is gone.
  for (const { rows } of table) for (const { row, cells } of rows) expect(cells.some(Boolean), `nobody may: ${row.label}`).toBe(row.nobody !== true);
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
