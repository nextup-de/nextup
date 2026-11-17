// Musterwerk's working day (server/scheduler/life.ts runs it): the generated company keeps living, so a demo always has fresh
// ideas waiting for a decision and projects that move. Pure: the reduced state, the people and today in, the events out.
// The same day gives the same events (seeded by the date), and every event carries an idemKey, so a second run writes nothing.
//
// Each working day:
//   - 2 to 4 new ideas from the catalogue, raised by members, routed like the generator routes (a desk a real person works
//     from gets three times its share, so whoever demos the company has ideas of their own to decide);
//   - the colleagues' desks read what came in and decide shortly before the promise; anything far past it is decided for sure;
//   - a yes goes the way the app has it since 16 Nov 2026 (approval.ts): one to three named approvers vote on the following days, one no
//     returns the idea to its raiser, who sends it again or takes it back, and only the last yes opens the project draft;
//   - the draft is set up by its lead over the next days (draft.ts) and started; the project is then worked step by step, finished and
//     measured over the weeks; the 30-day result says what it saves a year and a colleague confirms it (result.ts).
// So at any time a demo shows ideas on a desk, ideas waiting on their approvers, ideas sent back, drafts in setup and running projects.
// Desks, approvals and projects of real people (anyone who ever acted in the app) are never touched: those decisions stay theirs. The
// generator's own old cases are cleared out regardless, since nobody is waiting for them.
//
// The people the team demos from (`focus`: Kevin Schmid and Julia Rossi) get something to click every working day: the
// one who holds a desk gets an idea of their own on it every day, they are invited to discuss one of the colleagues' new ideas, they
// are named approver of one idea at a time when they head a unit, and they join new projects (at most two running at a time) with a
// step of their own, which waits five working days for them before the lead moves it. Every project the simulation starts is planned
// with dated steps and two milestones.
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import type { NoCategory } from "@/features/cases/no";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";
import { approvalDay, pickApprovers, provisionalPayload, type DeskYes } from "./approval";
import { ideasFor } from "./catalog";
import { draftDay, ideaByTitle, planAndStart } from "./draft";
import { impactOf, resultDay } from "./result";
import { rngOf, simulated, type At, type DayCtx, type LifePerson, type Rng } from "./shared";

export type { LifePerson } from "./shared";
/** A route and the seat that owns it, with the seat's person (null: nobody holds it). */
export type LifeRoute = { key: string; holderId: string; owner: LifePerson | null };
export type LifeInput = {
  slug: string;
  /** Today's Berlin date (YYYY-MM-DD) and the company's working day. */
  iso: string;
  today: number;
  state: State;
  promiseDays: number;
  routes: readonly LifeRoute[];
  people: readonly LifePerson[];
  /** People who acted in the app themselves: their desks and projects are theirs. */
  humans: ReadonlySet<string>;
  /** The demo accounts that should always have something to do (see above). Absent: nobody. */
  focus?: ReadonlySet<string>;
};
/** `actorUserId` is null only for the settle operation's decision (system:approvals). */
export type LifeEvent = { id: string; idemKey: string; type: CaseEventType; actor: string; actorUserId: string | null; targetId: string; payload: EventPayload };

/** The source the scheduler stores these events under; its notices stay in the app (no mail, no Teams). */
export const LIFE_SOURCE = "life";

const NO_REASONS: readonly (readonly [NoCategory, string, string])[] = [
  ["no-budget", "Dafür ist im Budget dieses Jahres kein Geld mehr frei. Im neuen Jahr nehmen wir es in die Planung auf.", "Wenn das Budget für das neue Jahr steht."],
  ["no-fit", "Das passt gerade nicht zu unseren Schwerpunkten Liefertreue und Ausschuss. Wir konzentrieren uns auf weniger Vorhaben.", "Wenn sich zeigt, dass es Ausschuss oder Liefertreue direkt verbessert."],
  ["not-feasible", "Wir haben es mit der Instandhaltung geprüft: Umbau und Aufwand wären deutlich größer als der Nutzen.", "Wenn es eine einfachere technische Lösung gibt."],
];
const RAISER_NOTE = "Gute Idee, das machen wir.";

/** The day's events, in the order they should be written. */
export function lifeDay(input: LifeInput): LifeEvent[] {
  const { slug, iso, today, state, promiseDays, routes, people, humans } = input;
  const focus = input.focus ?? new Set<string>();
  const focusPeople = people.filter((p) => focus.has(p.id));
  // Running simulated projects each focus person is in, counted up as they join today's.
  const joined = new Map(focusPeople.map((f) => [f.id, state.projects.filter((p) => p.id.includes("-lp-") && !p.closed && !p.stopped && (p.memberUserIds.includes(f.id) || p.leadUserId === f.id)).length]));
  const out: LifeEvent[] = [];
  const at: At = (key, type, by, targetId, payload = {}) => {
    const idemKey = `life:${iso}:${key}`;
    out.push({ id: `e_${slug}_${idemKey}`, idemKey, type, actor: by.name, actorUserId: by.id, targetId, payload });
  };
  const personById = new Map(people.map((p) => [p.id, p]));
  const ctx: DayCtx = { today, people, personById, humans, focus, at, rng: (label) => rngOf(`${slug}:${iso}:${label}`), stable: (label) => rngOf(`${slug}:${label}`) };
  const routeByHolder = new Map(routes.map((r) => [r.holderId, r]));
  const generated = new RegExp(`^${slug}-(c|pr)\\d+$`);
  const members = people.filter((p) => p.role === "member" && !humans.has(p.id));
  const raisers = members.length ? members : people.filter((p) => !humans.has(p.id));
  // A demo account is named approver of one idea at a time: nobody else answers for them, so a second one would only pile up.
  const asked = new Set(state.cases.flatMap((c) => (c.approvals?.parallel === true && !c.approvals.done ? c.approvals.steps.filter((s) => s.state === "pending").map((s) => s.userId ?? "") : [])));
  const mayAsk = (userId: string): boolean => simulated(ctx, userId) !== null || (focus.has(userId) && !asked.has(userId));

  // 1. The open cases: read, then decided shortly before the promise. A yes asks its approvers (approval.ts).
  for (const c of state.cases) {
    if (!c.open || c.decided || c.withdrawn) continue;
    const route = c.assigneeSeatId ? routeByHolder.get(c.assigneeSeatId) : undefined;
    // A case the clock passed on (deadline, overflow, one level up) sits on a seat that owns no route: its holder decides it.
    const seat = route || !c.assigneeSeatId ? undefined : state.seats.find((x) => x.id === c.assigneeSeatId);
    const owner = route?.owner ?? (seat?.userId ? personById.get(seat.userId) ?? null : null);
    if (!owner) continue;
    const old = generated.test(c.id);
    if (humans.has(owner.id) && !old) continue;
    const r = rngOf(`${slug}:${iso}:${c.id}`);
    const age = today - c.raisedDay;
    if (c.read === null && age >= 1 && r.chance(0.7)) at(`${c.id}:read`, "case.read", owner, c.id);
    const due = age >= promiseDays + 3 || (age >= promiseDays - 1 && r.chance(0.45));
    if (!due) continue;
    const idea = old ? null : ideaByTitle(c.title);
    if (idea && r.chance(0.6)) {
      const yes: DeskYes = { projectId: `${slug}-lp-${c.id.slice(slug.length + 1)}`, lead: leadOf(c, owner, r, ctx), title: idea.title, raiserNote: RAISER_NOTE };
      const approvers = pickApprovers(c, state, owner, r, mayAsk);
      for (const s of approvers) if (s.userId && focus.has(s.userId)) asked.add(s.userId);
      if (approvers.length > 0) at(`${c.id}:yes`, "case.provisional", owner, c.id, provisionalPayload(c, today, yes, approvers));
      // Nobody to ask (no other unit has a head): the plain yes opens the draft at once, as the yes sheet does without approvers.
      else at(`${c.id}:yes`, "case.decided", owner, c.id, { answer: "yes", draft: true, projectId: yes.projectId, lead: yes.lead.name, leadUserId: yes.lead.id, title: yes.title, raiserNote: yes.raiserNote });
    } else if (old && r.chance(0.7)) {
      at(`${c.id}:yes`, "case.decided", owner, c.id, { answer: "yes", note: "Ist erledigt, danke für den Hinweis." });
    } else {
      const [category, reason, changeIf] = r.pick(NO_REASONS);
      at(`${c.id}:no`, "case.decided", owner, c.id, { answer: "no", category, reason, changeIf });
    }
  }

  // 2. The ideas after the desk's yes: the approvers answer, the last yes opens the draft, a returned idea is sent again or taken back.
  for (const c of state.cases) if (c.status === "approval" && c.withdrawn === null) approvalDay(c, ctx);

  // 3. The projects: a draft is set up and started; a project is planned, started, worked step by step, finished, measured.
  for (const p of state.projects) {
    if (p.stopped || p.closed || (p.waitsForApproval ?? false)) continue;
    const lead = p.leadUserId ? personById.get(p.leadUserId) ?? null : null;
    if (!lead || (humans.has(lead.id) && !generated.test(p.id))) continue;
    if (p.draft && p.status === "planning") draftDay(p, lead, state, ctx, joined);
    else if (!p.draft || p.startedDay !== null) {
      projectDay(p, lead, rngOf(`${slug}:${iso}:${p.id}`), today, people, focus, at);
      resultDay(p, ideaByTitle(p.title), state, ctx);
    }
  }

  // 4. New ideas: 2 to 4 a day, none the same as one still open. (One waiting on its approvers does not hold its title back: with three
  // ideas a desk in the catalogue, the desks would run dry and the demo accounts would miss their daily discussion.)
  const r = rngOf(`${slug}:${iso}:raise`);
  const openTitles = new Set(state.cases.filter((c) => c.open).map((c) => c.title));
  const staffed = routes.filter((x) => x.owner);
  const weighted = staffed.flatMap((x) => (humans.has(x.owner!.id) ? [x, x, x] : [x]));
  const count = r.int(2, 4);
  const raised: { id: string; route: LifeRoute }[] = [];
  const fresh = (key: string) => ideasFor(key).filter((i) => !openTitles.has(i.title));
  const day = `${slug}-l${iso.replaceAll("-", "")}-`;
  const raise = (key: string, id: string, route: LifeRoute) => {
    const idea = r.pick(fresh(route.key));
    openTitles.add(idea.title);
    const raiser = r.pick(raisers);
    at(key, "case.raised", raiser, id, {
      title: idea.title, body: idea.body, upside: idea.upside, routeId: route.key, assignee: route.owner!.name, assigneeRoleHolderId: route.holderId,
      fromDept: raiser.dept, kind: "idea", reason: "keywords",
      proposal: { routeId: route.key, confidence: r.int(70, 95), source: "keywords", version: "musterwerk-life" },
    });
    raised.push({ id, route });
  };
  // Every focus person who holds a desk gets an idea of their own each working day, so each of them always has one to decide
  // (Kevin, 16 Nov 2026: one idea a day shared between the two left one of them without buttons). Not when today's ideas
  // already put one on their desk (a run earlier the same day).
  if (raisers.length) {
    focusPeople.forEach((f, k) => {
      const route = staffed.find((x) => x.owner!.id === f.id && fresh(x.key).length > 0);
      if (!route || state.cases.some((c) => c.id.startsWith(day) && c.assigneeSeatId === route.holderId)) return;
      raise(`raise:focus:${f.id}`, `${day}f${k}`, route);
    });
  }
  for (let n = 0; n < count && raisers.length; n++) {
    const candidates = weighted.filter((x) => fresh(x.key).length > 0);
    if (candidates.length === 0) break;
    raise(`raise:${n}`, `${day}${n}`, r.pick(candidates));
  }

  // 5. A colleague asks the focus people to discuss one of today's ideas on a desk of their own (not one a focus person or a real person holds).
  const invitees = (x: LifeRoute) => focusPeople.filter((f) => f.id !== x.owner!.id);
  const talk = raised.filter((x) => !humans.has(x.route.owner!.id) && !focus.has(x.route.owner!.id) && invitees(x.route).length > 0);
  if (talk.length) {
    const { id, route } = r.pick(talk);
    const who = invitees(route);
    at(`discuss:${id}`, "case.discussion", route.owner!, id, {
      invited: who.map((f) => f.name), invitedUserIds: who.map((f) => f.id),
      missing: "Wie seht ihr das aus eurer Sicht? Gibt es etwas, das dagegen spricht oder das wir mitdenken müssen?",
    });
  }
  return out;
}

/** Who the desk asks to set the draft up: often the raiser or a colleague of the desk's department, else the desk itself. Never a real person or a demo account. */
function leadOf(c: ReducedCase, owner: LifePerson, r: Rng, ctx: DayCtx): LifePerson {
  const raiser = simulated(ctx, c.fromUserId);
  const colleagues = ctx.people.filter((x) => x.dept === owner.dept && x.id !== owner.id && x.role === "member" && simulated(ctx, x.id) !== null);
  const pool = [...(raiser ? [raiser] : []), ...colleagues.filter((x) => x.id !== raiser?.id)];
  return pool.length > 0 && r.chance(0.6) ? r.pick(pool) : owner;
}

function projectDay(p: ReducedProject, lead: LifePerson, r: Rng, today: number, people: readonly LifePerson[], focus: ReadonlySet<string>, at: At): void {
  const key = (what: string) => `${p.id}:${what}`;
  if (p.status === "planning") {
    // A project opened before drafts (a yes without one): planned and started as before.
    if (today - p.openedDay < 1 || !(r.chance(0.6) || today - p.openedDay >= 3)) return;
    if (!p.baseline) at(key("baseline"), "project.baseline", lead, p.id, { none: true, why: "Wird mit dem ersten Schritt erhoben." });
    const team = people.filter((x) => x.dept === lead.dept && x.id !== lead.id);
    planAndStart(p, lead, r, today, team, people, focus, at);
    return;
  }
  if (p.status === "running") {
    const live = p.steps.filter((s) => !s.dropped);
    const doing = live.find((s) => s.column === "doing");
    const next = live.find((s) => s.column === "todo");
    if (doing) {
      // A focus person's own step waits for them a while; after that the lead finishes it, so the project never stalls.
      const theirs = !!doing.ownerUserId && focus.has(doing.ownerUserId);
      if (theirs ? today - doing.movedDay >= 5 : today - doing.movedDay >= 1 && r.chance(0.45)) {
        at(key(`${doing.id}:done`), "project.step.moved", lead, p.id, { stepId: doing.id, to: "done" });
        if (next) at(key(`${next.id}:doing`), "project.step.moved", lead, p.id, { stepId: next.id, to: "doing" });
        else {
          at(key("done"), "project.done", lead, p.id, { note: "Alle Schritte umgesetzt." });
          if (p.milestones.some((m) => m.id === `${p.id}-m1` && !m.shipped)) at(key("m1:shipped"), "project.milestone.edited", lead, p.id, { milestoneId: `${p.id}-m1`, shipped: true });
        }
      }
    } else if (next) {
      if (r.chance(0.6)) at(key(`${next.id}:doing`), "project.step.moved", lead, p.id, { stepId: next.id, to: "doing" });
    } else if (today - (p.startedDay ?? today) >= 2) {
      at(key("done"), "project.done", lead, p.id, { note: "Umgesetzt." });
    }
    return;
  }
  // The 30-day check, on the day it opens (the app refuses it before).
  if (p.status === "measuring" && p.doneDay !== null && p.measures.length === 0 && p.checks.some((c) => c.check === 30 && today >= c.opensDay)) {
    const b = p.baseline && !p.baseline.none ? p.baseline : null;
    if (!b) return;
    const idea = ideaByTitle(p.title);
    const share = 0.6 + r.next() * 0.7;
    const gain = (idea?.project.gain ?? 0.25) * share;
    const value = Math.round(b.value * (b.better === "down" ? 1 - gain : 1 + gain) * 10) / 10;
    at(key("measured30"), "project.measured", lead, p.id, { check: 30, value, source: "manual", note: "Gemessen wie die Ausgangslage.", impact: impactOf(idea, share, r) });
    if (p.milestones.some((m) => m.id === `${p.id}-m2` && !m.shipped)) at(key("m2:shipped"), "project.milestone.edited", lead, p.id, { milestoneId: `${p.id}-m2`, shipped: true });
  }
}
