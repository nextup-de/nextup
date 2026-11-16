// A project draft in Musterwerk's day (plan SET; the way from idea to project of 16 Nov 2026, docs/DESIGN_RULES.md §8): the draft the last
// approval opened is set up over the next working days, one thing a day, as its lead would - the lead takes it, invites colleagues and the
// desk as sponsor and writes the goal, the invited answer, the lead takes the baseline, a second person confirms it where a reward is
// possible, and then the lead plans the steps and starts it. From there the running project is plan.ts's. Pure.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { baselineNeedsConfirm, rewardPossible } from "@/features/projects/result";
import type { ReducedProject } from "@/features/projects/types";
import { LIFE_IDEAS, GENERAL_IDEAS, type LifeIdea } from "./catalog";
import { simulated, type DayCtx, type LifePerson, type Rng } from "./shared";

const ALL_IDEAS: readonly LifeIdea[] = [...Object.values(LIFE_IDEAS).flat(), ...GENERAL_IDEAS];
export const ideaByTitle = (title: string): LifeIdea | null => ALL_IDEAS.find((i) => i.title === title) ?? null;

/** Running simulated projects a demo account joins at most (they get a step of their own in each). */
export const FOCUS_PROJECTS_MAX = 2;

const DECLINE = "Ich bin die nächsten Wochen im Kundenaudit gebunden. Gerne beim nächsten Mal.";

/** The last day an event of this type was written on the project; null when none was. */
const dayOf = (p: ReducedProject, type: string): number | null => p.history.findLast((e) => e.type === type)?.day ?? null;

/** A working day after `since` the lead gets to it: most days, for sure on the third. */
const due = (r: Rng, today: number, since: number): boolean => today - since >= 1 && (r.chance(0.6) || today - since >= 3);

/** Who may confirm the baseline number and is a colleague the simulation writes as: the sponsor, the route's deputy, a manager (projects/permissions.ts). */
function confirmerOf(p: ReducedProject, state: State, ctx: DayCtx): LifePerson | null {
  const not = (u: string | null) => u !== null && u !== p.leadUserId && u !== (p.baseline?.byUserId ?? null);
  const sponsor = not(p.sponsorUserId) ? simulated(ctx, p.sponsorUserId) : null;
  if (sponsor) return sponsor;
  const deputyRoleId = state.routes.find((x) => x.id === p.routeId)?.deputyRoleId ?? null;
  const deputies = deputyRoleId === null ? [] : seatsOfRole(state.seats, deputyRoleId).map((s) => s.userId).filter(not);
  if (deputies.length > 0) return simulated(ctx, deputies[0]);
  return ctx.people.find((x) => x.role === "manager" && not(x.id) && simulated(ctx, x.id) !== null) ?? null;
}

/**
 * One working day of a draft in setup whose lead the simulation writes as. `joined` counts the running simulated projects each demo account is
 * in; the lead adds them to the team (at most FOCUS_PROJECTS_MAX), so each has a step of their own once it starts.
 */
export function draftDay(p: ReducedProject, lead: LifePerson, state: State, ctx: DayCtx, joined: Map<string, number>): void {
  const { today, at, people, focus } = ctx;
  const r = ctx.rng(p.id);
  const key = (what: string) => `${p.id}:${what}`;
  const idea = ideaByTitle(p.title);

  // 1. The lead named in the yes takes it.
  if (p.leadState === "pending") {
    if (due(r, today, p.leadAskedDay ?? p.openedDay)) at(key("lead"), "project.lead.answered", lead, p.id, { take: true });
    return;
  }
  const taken = dayOf(p, "project.lead.answered") ?? p.openedDay;

  // 2. The team and the goal: colleagues of the lead's department invited, the desk that said yes as sponsor, the demo accounts on the team.
  if (p.goal === null) {
    if (!due(r, today, taken)) return;
    const colleagues = people.filter((x) => x.dept === lead.dept && x.id !== lead.id && x.id !== p.deciderUserId && simulated(ctx, x.id) && !p.memberUserIds.includes(x.id));
    const n = Math.min(colleagues.length, r.int(1, 2));
    const picked = colleagues.map((x) => ({ x, k: r.next() })).sort((a, b) => a.k - b.k).slice(0, n).map((y) => y.x);
    for (const x of picked) at(key(`invite:${x.id}`), "project.invited", lead, p.id, { userId: x.id, role: "member" });
    const sponsor = simulated(ctx, p.deciderUserId);
    if (sponsor && sponsor.id !== lead.id) at(key(`invite:${sponsor.id}`), "project.invited", lead, p.id, { userId: sponsor.id, role: "sponsor" });
    for (const f of people.filter((x) => focus.has(x.id))) {
      if (f.id === lead.id || p.memberUserIds.includes(f.id) || (joined.get(f.id) ?? 0) >= FOCUS_PROJECTS_MAX) continue;
      joined.set(f.id, (joined.get(f.id) ?? 0) + 1);
      at(key(`member:${f.id}`), "project.member", lead, p.id, { name: f.name, userId: f.id, on: true });
    }
    const pj = idea?.project;
    at(key("goal"), "project.goal", lead, p.id, {
      goal: idea?.upside ?? p.title,
      doneWhen: pj ? `Alle Schritte umgesetzt und „${pj.metric}“ ${pj.better === "down" ? "gesenkt" : "gesteigert"} gemessen.` : "Alle Schritte umgesetzt und die Wirkung gemessen.",
      doneBy: today + 32,
    });
    return;
  }

  // 3. The invited answer on their own pace, mostly yes.
  for (const inv of p.invites) {
    const who = inv.state === "pending" ? simulated(ctx, inv.userId) : null;
    const ir = ctx.rng(inv.id);
    if (!who || today - inv.day < 1 || !ir.chance(0.7)) continue;
    const take = inv.role === "sponsor" || !ir.chance(0.1);
    at(key(`answer:${inv.id}`), "project.invite.answered", who, p.id, { inviteId: inv.id, userId: who.id, take, ...(take ? {} : { reason: DECLINE }) });
  }

  // 4. The baseline, as the idea measures it. A number needs a second person where a reward is possible; with nobody to confirm it, none.
  if (p.baseline === null) {
    if (!due(r, today, dayOf(p, "project.goal") ?? taken)) return;
    const pj = idea?.project;
    const sponsorAsked = p.invites.some((i) => i.role === "sponsor" && i.state !== "declined" && i.state !== "lapsed" && simulated(ctx, i.userId));
    const confirmable = !rewardPossible(state.rules) || sponsorAsked || confirmerOf(p, state, ctx) !== null;
    if (pj && confirmable) {
      const value = Math.round((pj.base[0] + r.next() * (pj.base[1] - pj.base[0])) * 10) / 10;
      at(key("baseline"), "project.baseline", lead, p.id, { metric: pj.metric, unit: pj.unit, value, better: pj.better, source: "manual" });
    } else at(key("baseline"), "project.baseline", lead, p.id, { none: true, why: "Wird mit dem ersten Schritt erhoben." });
    return;
  }
  if (baselineNeedsConfirm(p, state.rules)) {
    const by = confirmerOf(p, state, ctx);
    if (by && today - p.baseline.day >= 1 && r.chance(0.7)) at(key("baseline:confirmed"), "project.baseline.confirmed", by, p.id, p.baseline.eventId ? { baselineEventId: p.baseline.eventId } : {});
    return;
  }

  // 5. Planned and started once the invited had a day to answer.
  const ready = Math.max(p.baseline.confirmed?.day ?? p.baseline.day, ...p.invites.map((i) => i.day + 1));
  if (!due(r, today, ready)) return;
  const team = people.filter((x) => p.memberUserIds.includes(x.id) && !focus.has(x.id));
  planAndStart(p, lead, r, today, team, people, focus, ctx.at);
}

/**
 * The plan of a project the simulation starts: two milestones (the work done, then the effect measured), the idea's four steps with dates,
 * owned by the lead and the team (the second by a demo account on the team), then the start and the first step in Doing.
 */
export function planAndStart(p: ReducedProject, lead: LifePerson, r: Rng, today: number, team: readonly LifePerson[], people: readonly LifePerson[], focus: ReadonlySet<string>, at: DayCtx["at"]): void {
  const key = (what: string) => `${p.id}:${what}`;
  const idea = ideaByTitle(p.title);
  if (idea && p.steps.length === 0) {
    // Each demo account on the team owns a step of its own: the second step, and the third for a second one.
    const mine = people.filter((x) => focus.has(x.id) && p.memberUserIds.includes(x.id));
    const m1 = `${p.id}-m1`, m2 = `${p.id}-m2`;
    at(key("m1"), "project.milestone.added", lead, p.id, { milestoneId: m1, title: "Umgesetzt", startDay: today, dueDay: today + 12 });
    at(key("m2"), "project.milestone.added", lead, p.id, { milestoneId: m2, title: "Wirkung gemessen", startDay: today + 12, dueDay: today + 32 });
    idea.project.steps.forEach((text, k) => {
      const owner = (k === 1 || k === 2) && mine[k - 1] ? mine[k - 1] : k === 0 || team.length === 0 ? lead : r.pick(team);
      const stepId = `${p.id}-s${k + 1}`;
      at(key(`step${k}`), "project.step.added", lead, p.id, { stepId, text, owner: owner.name, ownerUserId: owner.id, dueDay: today + 3 * (k + 1) });
      at(key(`step${k}:m`), "project.step.edited", lead, p.id, { stepId, milestoneId: k < 3 ? m1 : m2 });
    });
  }
  at(key("started"), "project.started", lead, p.id);
  if (idea) at(key("doing1"), "project.step.moved", lead, p.id, { stepId: `${p.id}-s1`, to: "doing" });
}
