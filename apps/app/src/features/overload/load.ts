// How loaded a desk is (plan OVL, D18): the open work of a desk counted once, per present holder. Pure; counts per desk (a role) only - no user id and no
// name is in a result, and nothing compares people (D3). Work is: a case to decide, the current step of an approval run, a result to confirm.
import { currentStep } from "@/features/approvals/steps";
import { overloadAtOf } from "@/features/loop/rules";
import { unconfirmedOf } from "@/features/projects/confirm";
import type { State } from "@/features/cases/reducer";
import { awayOn } from "./away";
import { isPinned } from "./pinned";
import { overloadOf } from "./reduce";
import type { DeskLoad, DeskLevel, WorkItem } from "./types";

type LoadState = Pick<State, "cases" | "projects" | "seats" | "routes" | "rules" | "approvals" | "overload">;

/**
 * Every open work item once, deduplicated by key (D18):
 * - decide: a case on a desk, open or in a discussion (key `case:<id>`); a case that is asked waits for the raiser and is not counted;
 * - approve: only the current step of a case's active approval run, on its effective desk - the role of the seat it was handed to late, else the step's
 *   role, for a council step its secretary's role; later steps are not counted (key `approval:<runId>:<stepId>`);
 * - confirm: a project result that waits for a second person, on the route's deputy role or, once the clock passed it up, the role of that seat
 *   (key `confirm:<projectId>`).
 * late: its due day is before today.
 */
export function deskWork(state: LoadState, today: number): WorkItem[] {
  const items = new Map<string, WorkItem>();
  const add = (key: string, roleId: string | null, due: number | null) => {
    if (roleId !== null && !items.has(key)) items.set(key, { key, roleId, late: due !== null && due < today });
  };
  const roleOfSeat = (seatId: string | null) => (seatId === null ? null : state.seats.find((s) => s.id === seatId)?.roleId ?? null);
  for (const c of state.cases) {
    if (c.status === "open" || c.status === "discussion") add(`case:${c.id}`, c.assigneeRoleId, c.dueDay);
    const run = c.approvals ?? null;
    const step = currentStep(run);
    if (run !== null && step !== null) {
      const own = step.kind === "council" ? state.approvals.councils.find((k) => k.id === step.councilId)?.secretaryRoleId ?? null : step.roleId ?? null;
      add(`approval:${run.runId}:${step.id}`, roleOfSeat(step.seatId) ?? own, step.dueDay);
    }
  }
  for (const p of state.projects) {
    const waiting = unconfirmedOf(p);
    if (waiting.length === 0) continue;
    const deputy = state.routes.find((r) => r.id === p.routeId)?.deputyRoleId ?? null;
    const first = waiting[0];
    add(`confirm:${p.id}`, roleOfSeat(first.upSeatId) ?? deputy, Math.min(...waiting.map((u) => u.dueDay)));
  }
  return [...items.values()];
}

/**
 * One load per role with at least one item or one open episode (D18): open, late, pinned (those whose case is pinned, D20), holders (distinct user ids on
 * a seat of the role who are not away today), perHolder = ceil(open / max(1, holders)) and the level. Overflow also holds while the open episode is at
 * level 30 and the desk is still at up (Q3.16: it ends under up).
 */
export function deskLoads(state: LoadState, today: number): DeskLoad[] {
  const at = overloadAtOf(state.rules);
  const items = deskWork(state, today);
  const pinnedCases = new Set(state.cases.filter((c) => isPinned(c, state, today)).map((c) => `case:${c.id}`));
  const episodes = overloadOf(state).desks.filter((d) => d.clearedDay === null);
  const roles = [...new Set([...items.map((i) => i.roleId), ...episodes.map((d) => d.roleId)])];
  return roles.map((roleId): DeskLoad => {
    const mine = items.filter((i) => i.roleId === roleId);
    const holders = new Set(state.seats.filter((s) => s.roleId === roleId && s.userId !== null && !awayOn(state, s.userId, today)).map((s) => s.userId)).size;
    const open = mine.length;
    const late = mine.filter((i) => i.late).length;
    const perHolder = Math.ceil(open / Math.max(1, holders));
    const episode = episodes.find((d) => d.roleId === roleId);
    const level: DeskLevel = perHolder >= at.overflow || (episode?.level === 30 && perHolder >= at.up) ? "overflow"
      : perHolder >= at.up ? "up"
      : perHolder >= at.triage || late >= at.late ? "triage" : "normal";
    return { roleId, open, late, pinned: mine.filter((i) => pinnedCases.has(i.key)).length, holders, perHolder, level };
  });
}
