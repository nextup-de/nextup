// The project half of reduce(seed, log) (features/cases/reducer.ts calls into this). A project
// opens with the case.decided yes that names it, and changes only through project.* events.
// Pure like the case reducer: state in, state out, nothing stored.
import type { CaseEvent } from "@/features/cases/events";
import type { Route } from "@/features/demo/types";
import type { LoopRules } from "@/features/loop/rules";
import type { CheckDue, ReducedProject, SeedProject, StepColumn } from "./types";
import { STEP_COLUMNS } from "./types";
import { verdictOf } from "./verdict";

export type ProjectBook = { byId: Record<string, ReducedProject>; order: string[] };

export const newBook = (): ProjectBook => ({ byId: {}, order: [] });

function fresh(book: ProjectBook, id: string, p: Pick<ReducedProject, "title" | "sources" | "authors" | "routeId" | "lead" | "members" | "openedDay" | "openedBy" | "seed">): ReducedProject {
  const project: ReducedProject = {
    id, number: 0, ...p,
    startedDay: null, doneDay: null, doneNote: "", stopped: null, baseline: null,
    steps: [], links: [], measures: [], checks: [], verdict: null, reward: null, claimed: null,
    status: "planning", closed: false, rewardDue: false, dueDay: null, overdue: false, escalated: null, history: [],
  };
  book.byId[id] = project;
  book.order.push(id);
  return project;
}

/** A project from the company's seed (demo data); its history arrives as seed events. */
export function seedProject(book: ProjectBook, row: SeedProject): void {
  if (book.byId[row.id]) return;
  fresh(book, row.id, {
    title: row.title, sources: row.sources.slice(), authors: row.authors.slice(), routeId: row.routeId ?? null,
    lead: row.lead, members: (row.members ?? []).filter((m) => m !== row.lead), openedDay: row.openedDay, openedBy: row.openedBy, seed: true,
  });
}

/** The case a yes came from, as the project needs it. */
export type Source = { id: string; from: string; routeId: string | null; title: string };

/**
 * case.decided { answer: "yes", projectId, lead, title }: open that project, or - when it is
 * already open - add this idea to it. Returns the project, or null when nothing changed.
 */
export function openOrJoin(book: ProjectBook, ev: CaseEvent, source: Source): ReducedProject | null {
  const pl = ev.payload;
  const id = pl.projectId;
  if (!id) return null;
  const have = book.byId[id];
  if (have) {
    if (have.stopped || have.reward || have.sources.includes(source.id)) return null;
    have.sources.push(source.id);
    if (!have.authors.includes(source.from)) have.authors.push(source.from);
    have.history.push(ev);
    return have;
  }
  const lead = pl.lead?.trim() || ev.actor;
  const p = fresh(book, id, {
    title: pl.title?.trim() || source.title, sources: [source.id], authors: [source.from], routeId: source.routeId,
    lead, members: [], openedDay: ev.day | 0, openedBy: ev.actor, seed: Boolean(ev.seed),
  });
  p.history.push(ev);
  return p;
}

const isColumn = (s: unknown): s is StepColumn => typeof s === "string" && (STEP_COLUMNS as readonly string[]).includes(s);

/** One project.* event. Returns false when the event is not a project event at all. */
export function applyProjectEvent(book: ProjectBook, ev: CaseEvent, rules: LoopRules): boolean {
  if (!ev.type.startsWith("project.")) return false;
  const p = ev.target ? book.byId[ev.target] : undefined;
  if (!p) return true;
  const pl = ev.payload ?? {};
  const d = ev.day | 0;
  const live = p.stopped === null;
  switch (ev.type) {
    case "project.member": {
      const name = pl.name?.trim();
      if (!name || name === p.lead) break;
      if (pl.on === false) p.members = p.members.filter((m) => m !== name);
      else if (!p.members.includes(name)) p.members.push(name);
      break;
    }
    case "project.handed": {
      const to = pl.to?.trim();
      if (!to || to === p.lead || !live) break;
      if (!p.members.includes(p.lead)) p.members.push(p.lead);
      p.members = p.members.filter((m) => m !== to);
      p.lead = to;
      break;
    }
    case "project.baseline": {
      if (p.startedDay !== null || !live) break; // taken before the start, never after
      if (pl.none) p.baseline = { none: true, why: pl.why ?? "", day: d, by: ev.actor };
      else if (typeof pl.value === "number" && Number.isFinite(pl.value) && pl.metric)
        p.baseline = { none: false, metric: pl.metric, unit: pl.unit ?? "", value: pl.value, better: pl.better === "up" ? "up" : "down", source: pl.source ?? "", day: d, by: ev.actor };
      break;
    }
    case "project.started":
      if (p.baseline && p.startedDay === null && live) p.startedDay = d;
      break;
    case "project.step.added": {
      const stepId = pl.stepId;
      const text = pl.text?.trim();
      if (!stepId || !text || p.steps.some((s) => s.id === stepId)) break;
      p.steps.push({
        id: stepId, text, owner: pl.owner?.trim() || null, dueDay: typeof pl.dueDay === "number" ? pl.dueDay : null,
        column: "todo", why: "", addedDay: d, by: ev.actor, movedDay: d,
        external: pl.external?.system && pl.external.key ? { system: pl.external.system, key: pl.external.key, url: pl.external.url } : null,
      });
      break;
    }
    case "project.step.moved": {
      const s = p.steps.find((x) => x.id === pl.stepId);
      if (!s || !isColumn(pl.to)) break;
      s.column = pl.to;
      s.why = pl.why ?? "";
      s.movedDay = d;
      break;
    }
    case "project.linked": {
      if (!pl.url && !pl.key) break;
      const stepId = pl.stepId ?? null;
      p.links.push({ system: pl.system ?? "url", url: pl.url ?? "", key: pl.key ?? "", stepId, day: d });
      const s = stepId ? p.steps.find((x) => x.id === stepId) : undefined;
      if (s && pl.key) s.external = { system: pl.system ?? "url", key: pl.key, url: pl.url };
      break;
    }
    case "project.done":
      if (p.startedDay !== null && p.doneDay === null && live) { p.doneDay = d; p.doneNote = pl.note ?? ""; }
      break;
    case "project.measured": {
      const check = pl.check;
      if (p.doneDay === null || typeof check !== "number" || !rules.measureDays.includes(check)) break;
      if (typeof pl.value !== "number" || p.measures.some((m) => m.check === check)) break;
      const v = verdictOf(p.baseline, pl.value, rules.tolerancePct);
      p.measures.push({ check, value: pl.value, source: pl.source ?? "", note: pl.note ?? "", day: d, by: ev.actor, ...v });
      p.measures.sort((a, b) => a.check - b.check);
      break;
    }
    case "project.rewarded":
      if (!p.reward) p.reward = { rule: pl.rule ?? rules.reward.kind, amount: typeof pl.amount === "number" ? pl.amount : null, note: pl.note ?? "", day: d, by: ev.actor };
      break;
    case "project.claimed":
      if (p.reward && !p.claimed) p.claimed = { by: ev.actor, day: d };
      break;
    case "project.stopped":
      if (live && p.reward === null) p.stopped = { day: d, by: ev.actor, why: pl.why ?? "" };
      break;
    case "project.commented":
    default:
      break;
  }
  p.history.push(ev);
  return true;
}

type Finish = { day: number; promise: number; rules: LoopRules; routeOf: (id: string | null) => Route | null };

/** Derived per project once every event is applied: status, checks, due day, escalation. */
export function finishProjects(book: ProjectBook, { day, promise, rules, routeOf }: Finish): ReducedProject[] {
  const list = book.order.map((id) => book.byId[id]);
  list.forEach((p, k) => {
    p.number = k + 1;
    const counted = p.baseline !== null && !p.baseline.none;
    p.checks = p.doneDay !== null && counted
      ? rules.measureDays.map((check): CheckDue => {
          const opensDay = (p.doneDay as number) + check;
          const measured = p.measures.some((m) => m.check === check);
          return { check, opensDay, dueDay: opensDay + promise, measured, late: !measured && day > opensDay + promise };
        })
      : [];
    const allMeasured = p.checks.every((c) => c.measured);

    p.status = p.stopped ? "stopped"
      : p.reward ? "recognised"
      : p.doneDay !== null ? (allMeasured ? "measured" : "measuring")
      : p.startedDay !== null ? "running"
      : "planning";

    const last = p.measures[p.measures.length - 1];
    p.verdict = last ? last.verdict : p.doneDay !== null && !counted ? "not measured" : null;
    p.rewardDue = p.status === "measured" && rules.reward.kind !== "none";
    p.closed = p.status === "stopped" || p.status === "recognised" || (p.status === "measured" && rules.reward.kind === "none");

    const nextCheck = p.checks.find((c) => !c.measured);
    p.dueDay = p.status === "planning" ? p.openedDay + promise : p.status === "measuring" && nextCheck ? nextCheck.dueDay : null;
    p.overdue = p.dueDay !== null && day > p.dueDay;
    const route = routeOf(p.routeId);
    const to = route ? (route.owner.name === p.lead ? route.deputy : route.owner.name) : null;
    p.escalated = p.overdue && to && p.dueDay !== null
      ? { to, from: p.lead, day: p.dueDay + 1, live: p.dueDay + 1 >= 0, what: p.status === "planning" ? "start" : "measure" }
      : null;
  });
  return list;
}
