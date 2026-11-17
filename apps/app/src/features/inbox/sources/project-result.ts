// Items from a result that closes properly (kinds `help` and `baseline`; plan RES, D16, D19, D20): an open "ask the sponsor" for the
// asked person or the holders of the asked role, and a baseline that waits for a second person's confirmation - for whoever may
// confirm it. The confirm row of a sponsor or a manager-only result comes through projectItems, a sent-back check as the lead's measure
// move: nothing shows twice. Derived from the reduced state, nothing stored.
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { mayConfirmBaseline } from "@/features/projects/result";
import type { ReducedProject } from "@/features/projects/types";
import type { InboxInput, InboxItem } from "../types";

const base = (p: ReducedProject) => `/projects/${encodeURIComponent(p.id)}`;
const live = (p: ReducedProject) => p.status !== "stopped" && p.status !== "recognised";

// Who may confirm a baseline that waits lives with the result's rules (features/projects/result.ts): the draft's visibility asks it too.
export { mayConfirmBaseline };

export function projectResultItems(input: InboxInput & { role?: string }): InboxItem[] {
  if (!input.flags.projects) return [];
  const { state, me, demo } = input;
  if (me.userId === null) return [];
  const out: InboxItem[] = [];
  for (const p of demo ? state.projects : state.projects.filter((x) => !x.seed)) {
    if (!live(p)) continue;
    // An ask nobody answered yet, for the asked person or one who holds the asked role. An answered ask is gone.
    for (const a of p.helpAsks) {
      if (a.answeredDay !== null) continue;
      if (!(a.toUserId === me.userId || (a.toRoleId !== null && me.roleIds.includes(a.toRoleId)))) continue;
      out.push({
        id: `help:${a.id}`, ask: "part", kind: "help", projectId: p.id, title: p.title, href: base(p),
        dueDay: a.day + DEFAULT_RULES.promiseDays, late: false, dueSoon: false, pinned: false, deskRoleId: a.toRoleId !== null && me.roleIds.includes(a.toRoleId) ? a.toRoleId : null,
      });
    }
    if (mayConfirmBaseline(p, { rules: state.rules, routes: state.routes, seats: [...input.seats] }, me, input.role === "manager")) {
      out.push({ id: `baseline:${p.id}`, ask: "confirm", kind: "baseline", projectId: p.id, title: p.title, href: base(p), dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null });
    }
  }
  return out;
}
