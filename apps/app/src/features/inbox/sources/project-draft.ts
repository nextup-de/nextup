// Items from a project draft (plan SET, D11 and D12): a lead the draft waits for, and an invitation waiting for an
// answer - also on a project that has started (P6.5). Derived from the reduced state, nothing stored. Each is the
// person's own part (`ask: "part"`), due on the day the clock reminds.
import { INVITE_REMIND_DAYS, LEAD_REMIND_DAYS } from "@/features/clock/due";
import { tabQuery } from "@/features/projects/tabs";
import type { ReducedProject } from "@/features/projects/types";
import type { InboxInput, InboxItem } from "../types";

const base = (p: ReducedProject) => `/projects/${encodeURIComponent(p.id)}`;
const live = (p: ReducedProject) => p.status !== "stopped" && p.status !== "recognised";

export function projectDraftItems(input: InboxInput): InboxItem[] {
  if (!input.flags.projects) return [];
  const { state, me, demo } = input;
  const userId = me.userId;
  if (userId === null) return [];
  const out: InboxItem[] = [];
  for (const p of demo ? state.projects : state.projects.filter((x) => !x.seed)) {
    if (!p.draft || !live(p)) continue;
    if (p.status === "planning" && p.leadState === "pending" && p.leadUserId === userId) {
      out.push({
        id: `lead:${p.id}`, ask: "part", kind: "lead", projectId: p.id, title: p.title, href: base(p),
        dueDay: p.leadAskedDay === null ? null : p.leadAskedDay + LEAD_REMIND_DAYS, late: false, dueSoon: false, pinned: false, deskRoleId: null,
      });
    }
    for (const i of p.invites) {
      if (i.state !== "pending" || i.userId !== userId) continue;
      // A draft shows the response on its page; a running project shows it on the Team tab. The anchor is the response itself.
      const where = p.status === "planning" ? base(p) : base(p) + tabQuery("team");
      out.push({
        id: `invitation:${p.id}:${i.id}`, ask: "part", kind: "invitation", projectId: p.id, title: p.title, href: `${where}#invite-${encodeURIComponent(i.id)}`,
        dueDay: i.day + INVITE_REMIND_DAYS, late: false, dueSoon: false, pinned: false, deskRoleId: null,
      });
    }
  }
  return out;
}
