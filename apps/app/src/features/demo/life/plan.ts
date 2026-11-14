// Musterwerk's working day (server/scheduler/life.ts runs it): the generated company keeps living, so a demo always has fresh
// ideas waiting for a decision and projects that move. Pure: the reduced state, the people and today in, the events out.
// The same day gives the same events (seeded by the date), and every event carries an idemKey, so a second run writes nothing.
//
// Each working day:
//   - 2 to 4 new ideas from the catalogue, raised by members, routed like the generator routes (a desk a real person works
//     from gets three times its share, so whoever demos the company has ideas of their own to decide);
//   - the colleagues' desks read what came in and decide shortly before the promise; anything far past it is decided for sure;
//   - a yes opens the idea's project, which is planned, started, worked step by step, finished and measured over the weeks.
// Desks and projects of real people (anyone who ever acted in the app) are never touched: those decisions stay theirs. The
// generator's own old cases are cleared out regardless, since nobody is waiting for them.
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import type { NoCategory } from "@/features/cases/no";
import type { State } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";
import { ideasFor, LIFE_IDEAS, GENERAL_IDEAS, type LifeIdea } from "./catalog";

export type LifePerson = { id: string; name: string; dept: string; role: string };
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
};
export type LifeEvent = { id: string; idemKey: string; type: CaseEventType; actor: string; actorUserId: string; targetId: string; payload: EventPayload };

/** The source the scheduler stores these events under; its notices stay in the app (no mail, no Teams). */
export const LIFE_SOURCE = "life";

type Rng = { next(): number; int(min: number, max: number): number; pick<T>(xs: readonly T[]): T; chance(p: number): boolean };
function rngOf(label: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p };
}

const ALL_IDEAS: readonly LifeIdea[] = [...Object.values(LIFE_IDEAS).flat(), ...GENERAL_IDEAS];
const ideaByTitle = (title: string): LifeIdea | null => ALL_IDEAS.find((i) => i.title === title) ?? null;

const NO_REASONS: readonly (readonly [NoCategory, string, string])[] = [
  ["no-budget", "Dafür ist im Budget dieses Jahres kein Geld mehr frei. Im neuen Jahr nehmen wir es in die Planung auf.", "Wenn das Budget für das neue Jahr steht."],
  ["no-fit", "Das passt gerade nicht zu unseren Schwerpunkten Liefertreue und Ausschuss. Wir konzentrieren uns auf weniger Vorhaben.", "Wenn sich zeigt, dass es Ausschuss oder Liefertreue direkt verbessert."],
  ["not-feasible", "Wir haben es mit der Instandhaltung geprüft: Umbau und Aufwand wären deutlich größer als der Nutzen.", "Wenn es eine einfachere technische Lösung gibt."],
];

/** The day's events, in the order they should be written. */
export function lifeDay(input: LifeInput): LifeEvent[] {
  const { slug, iso, today, state, promiseDays, routes, people, humans } = input;
  const out: LifeEvent[] = [];
  const at = (key: string, type: CaseEventType, by: LifePerson, targetId: string, payload: EventPayload = {}) => {
    const idemKey = `life:${iso}:${key}`;
    out.push({ id: `e_${slug}_${idemKey}`, idemKey, type, actor: by.name, actorUserId: by.id, targetId, payload });
  };
  const personById = new Map(people.map((p) => [p.id, p]));
  const routeByHolder = new Map(routes.map((r) => [r.holderId, r]));
  const generated = new RegExp(`^${slug}-(c|pr)\\d+$`);
  const members = people.filter((p) => p.role === "member" && !humans.has(p.id));
  const raisers = members.length ? members : people.filter((p) => !humans.has(p.id));

  // 1. The open cases: read, then decided shortly before the promise.
  for (const c of state.cases) {
    if (!c.open || c.decided || c.withdrawn) continue;
    const route = c.assigneeSeatId ? routeByHolder.get(c.assigneeSeatId) : undefined;
    const owner = route?.owner ?? null;
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
      const projectId = `${slug}-lp-${c.id.slice(slug.length + 1)}`;
      at(`${c.id}:yes`, "case.decided", owner, c.id, { answer: "yes", note: "Gute Idee, das machen wir.", projectId, lead: owner.name, leadUserId: owner.id, title: idea.title });
      const pj = idea.project;
      const base = Math.round((pj.base[0] + r.next() * (pj.base[1] - pj.base[0])) * 10) / 10;
      at(`${c.id}:baseline`, "project.baseline", owner, projectId, { metric: pj.metric, unit: pj.unit, value: base, better: pj.better, source: "manual" });
    } else if (old && r.chance(0.7)) {
      at(`${c.id}:yes`, "case.decided", owner, c.id, { answer: "yes", note: "Ist erledigt, danke für den Hinweis." });
    } else {
      const [category, reason, changeIf] = r.pick(NO_REASONS);
      at(`${c.id}:no`, "case.decided", owner, c.id, { answer: "no", category, reason, changeIf });
    }
  }

  // 2. The projects: planned, started, worked step by step, finished, measured.
  for (const p of state.projects) {
    if (p.stopped || p.closed || p.draft) continue;
    const lead = p.leadUserId ? personById.get(p.leadUserId) ?? null : null;
    if (!lead || (humans.has(lead.id) && !generated.test(p.id))) continue;
    projectDay(p, lead, rngOf(`${slug}:${iso}:${p.id}`), today, people, at);
  }

  // 3. New ideas: 2 to 4 a day, none the same as one still open.
  const r = rngOf(`${slug}:${iso}:raise`);
  const openTitles = new Set(state.cases.filter((c) => c.open).map((c) => c.title));
  const staffed = routes.filter((x) => x.owner);
  const weighted = staffed.flatMap((x) => (humans.has(x.owner!.id) ? [x, x, x] : [x]));
  const count = r.int(2, 4);
  for (let n = 0; n < count && raisers.length; n++) {
    const fresh = (key: string) => ideasFor(key).filter((i) => !openTitles.has(i.title));
    const candidates = weighted.filter((x) => fresh(x.key).length > 0);
    if (candidates.length === 0) break;
    const route = r.pick(candidates);
    const idea = r.pick(fresh(route.key));
    openTitles.add(idea.title);
    const raiser = r.pick(raisers);
    const id = `${slug}-l${iso.replaceAll("-", "")}-${n}`;
    at(`raise:${n}`, "case.raised", raiser, id, {
      title: idea.title, body: idea.body, upside: idea.upside, routeId: route.key, assignee: route.owner!.name, assigneeRoleHolderId: route.holderId,
      fromDept: raiser.dept, kind: "idea", reason: "keywords",
      proposal: { routeId: route.key, confidence: r.int(70, 95), source: "keywords", version: "musterwerk-life" },
    });
  }
  return out;
}

type At = (key: string, type: CaseEventType, by: LifePerson, targetId: string, payload?: EventPayload) => void;

function projectDay(p: ReducedProject, lead: LifePerson, r: Rng, today: number, people: readonly LifePerson[], at: At): void {
  const key = (what: string) => `${p.id}:${what}`;
  if (p.status === "planning") {
    if (today - p.openedDay < 1 || !(r.chance(0.6) || today - p.openedDay >= 3)) return;
    if (!p.baseline) at(key("baseline"), "project.baseline", lead, p.id, { none: true, why: "Wird mit dem ersten Schritt erhoben." });
    const idea = ideaByTitle(p.title);
    const team = people.filter((x) => x.dept === lead.dept && x.id !== lead.id);
    if (idea && p.steps.length === 0) {
      idea.project.steps.forEach((text, k) => {
        const owner = k === 0 || team.length === 0 ? lead : r.pick(team);
        at(key(`step${k}`), "project.step.added", lead, p.id, { stepId: `${p.id}-s${k + 1}`, text, owner: owner.name, ownerUserId: owner.id });
      });
    }
    at(key("started"), "project.started", lead, p.id);
    if (idea) at(key("doing1"), "project.step.moved", lead, p.id, { stepId: `${p.id}-s1`, to: "doing" });
    return;
  }
  if (p.status === "running") {
    const live = p.steps.filter((s) => !s.dropped);
    const doing = live.find((s) => s.column === "doing");
    const next = live.find((s) => s.column === "todo");
    if (doing) {
      if (today - doing.movedDay >= 1 && r.chance(0.45)) {
        at(key(`${doing.id}:done`), "project.step.moved", lead, p.id, { stepId: doing.id, to: "done" });
        if (next) at(key(`${next.id}:doing`), "project.step.moved", lead, p.id, { stepId: next.id, to: "doing" });
        else at(key("done"), "project.done", lead, p.id, { note: "Alle Schritte umgesetzt." });
      }
    } else if (next) {
      if (r.chance(0.6)) at(key(`${next.id}:doing`), "project.step.moved", lead, p.id, { stepId: next.id, to: "doing" });
    } else if (today - (p.startedDay ?? today) >= 2) {
      at(key("done"), "project.done", lead, p.id, { note: "Umgesetzt." });
    }
    return;
  }
  if (p.status === "measuring" && p.doneDay !== null && p.measures.length === 0 && today - p.doneDay >= 20) {
    const b = p.baseline && !p.baseline.none ? p.baseline : null;
    if (!b) return;
    const idea = ideaByTitle(p.title);
    const gain = (idea?.project.gain ?? 0.25) * (0.6 + r.next() * 0.7);
    const value = Math.round(b.value * (b.better === "down" ? 1 - gain : 1 + gain) * 10) / 10;
    at(key("measured30"), "project.measured", lead, p.id, { check: 30, value, source: "manual", note: "Gemessen wie die Ausgangslage." });
  }
}
