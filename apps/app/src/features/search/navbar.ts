// The index behind the simple shell's search (shell/NavSearch): every case this person may open, with
// the Overview's row facts (status, stage, whose desk), a manager's decisions owed, and the people. Pure over the context.
import type { DemoContext } from "@/components/dashboard/DemoProvider";
import { canOpen, inboxIdeas } from "@/components/dashboard/derive";
import { dashboardRow, OVERVIEW_STEPS, type OverviewStatus } from "@/features/cases/rows";
import { onDesk } from "@/features/cases/selectors";
import { caseHay, ideaHay, type SearchItem } from ".";

export type NavCase = { status: OverviewStatus; step: number; open: boolean; late: boolean; yourMove: boolean; desk: string; days: number };
export type NavHit = SearchItem & { href: string; case: NavCase | null };

export function navbarIndex(ctx: DemoContext): NavHit[] {
  const { D, seed, persona, log, tenant } = ctx;
  const me = persona.who.name;
  const index: NavHit[] = [];
  for (const c of D.cases.filter((c) => canOpen(ctx, c))) {
    const row = dashboardRow(c, seed.promiseDays, persona.who, log);
    const desk = row.chain[row.chain.length - 1];
    // The Overview's "Your move": a question for you, or someone's open case waiting on your desk.
    const yourMove = row.status === "move" || (!row.mine && row.open && onDesk(c, me));
    const stage = row.step >= OVERVIEW_STEPS.length ? "Shipped" : OVERVIEW_STEPS[row.step];
    index.push({
      kind: c.kind === "idea" ? "Idea" : "Problem", group: c.kind === "idea" ? 1 : 0, title: c.title,
      sub: row.mine ? "You · " + row.fromDept : [row.from, row.fromDept].filter(Boolean).join(" · "),
      hay: [caseHay(c), desk, stage].join(" "), right: desk, go: { view: "dashboard", id: c.id }, href: ctx.href("/dashboard?id=" + encodeURIComponent(c.id)),
      case: { status: yourMove ? "move" : row.status, step: row.step, open: row.open, late: row.open && row.overdue, yourMove, desk, days: row.open ? row.openDays : row.clock },
    });
  }
  // A manager's decisions owed (the Inbox's ideas): open there, at the Decision step.
  for (const i of inboxIdeas(ctx)) {
    index.push({ kind: "Idea", group: 1, title: i.title, sub: [i.proposedBy, "Waiting for your decision"].filter(Boolean).join(" · "),
      hay: ideaHay(i, ctx.S.problems, seed.depts), right: me, go: { view: "leader", id: i.id }, href: ctx.href("/leader?id=" + encodeURIComponent(i.id)),
      case: { status: "move", step: 3, open: true, late: false, yourMove: true, desk: me, days: i.wait } });
  }
  for (const person of seed.people) {
    if (person.name === me || tenant.hiddenPeople?.includes(person.name)) continue;
    const dept = seed.depts.find((d) => d.id === person.dept)?.name ?? person.dept;
    index.push({ kind: "Person", group: 4, title: person.name, sub: [person.role, dept].filter(Boolean).join(" · "),
      hay: [person.name, person.role, dept].join(" "), right: "", go: { view: "people", id: person.name },
      href: ctx.href("/people/" + encodeURIComponent(person.name)), case: null });
  }
  return index;
}
