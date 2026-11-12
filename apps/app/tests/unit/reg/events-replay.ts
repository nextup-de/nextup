// A fixed pre-REG log (plan REG, decision D5): one EventRow literal of every type the app may append, plus
// case.unanswered (the clock's) and a clock.due. Fixed ids, seqs and timestamps; never built with appendEvent,
// Date.now or the reducer, so no later change to a reducer can alter it.
import type { EventRow } from "@/features/cases/persist";

let seq = 0;
const row = (type: string, who: readonly [string, string | null], targetId: string | null, payload: Record<string, unknown>, day = 0): EventRow => {
  const [actor, actorUserId] = who;
  seq += 1;
  return { id: `ev_${String(seq).padStart(3, "0")}`, seq, day, ts: 1_790_000_000_000 + seq * 1000, type, actor, actorUserId, targetId, payload };
};

const RAISER = ["Anonymous #4471", "u_js"] as const satisfies readonly [string, string | null];
const DESK = ["T. Vogel", "u_tv"] as const;
const LEAD = ["L. Brandt", "u_lb"] as const;
const CLOCK = ["system:clock", null] as const;

export const REPLAY_ROWS: EventRow[] = [
  row("case.raised", RAISER, "c_a", { kind: "idea", title: "Shorter changeover", body: "Pre-stage the tools.", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_vogel", fromDept: "Line 3", visibility: "custom", seenByUserIds: ["u_hs"], seenByUnitIds: ["unit_l3"], asName: true, attachments: 1, proposal: { routeId: "r1", confidence: 80, source: "keywords", version: "kw-1" } }),
  row("case.read", DESK, "c_a", {}),
  row("case.discussion", DESK, "c_a", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "The saving" }, 1),
  row("case.invited", DESK, "c_a", { invited: ["M. Roth"], invitedUserIds: ["u_mr"] }, 1),
  row("case.revised", RAISER, "c_a", { body: "Pre-stage the tools, second version.", title: "Shorter changeover", overall: 72 }, 2),
  row("case.checkin", DESK, "c_a", { next: "decide", open: ["Cost"], note: "Quote is in" }, 3),
  row("case.affected", ["H. Sander", "u_hs"], "c_a", { why: "It hits line 2 too" }, 3),
  row("case.unaffected", ["H. Sander", "u_hs"], "c_a", {}, 3),
  row("case.commented", ["M. Roth", "u_mr"], "c_a", { text: "New information: the cart exists.", rescore: true }, 3),
  row("case.asked", DESK, "c_a", { text: "Which line is it?" }, 3),
  row("case.answered", RAISER, "c_a", { text: "Line 3" }, 4),
  row("case.unanswered", CLOCK, "c_a", {}, 9),
  row("case.override", DESK, "c_a", { proposed: "r1", chosen: "r2" }, 4),
  row("case.handed", DESK, "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "Their machine" }, 4),
  row("case.decided", DESK, "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart", draft: true, raiserNote: "Thank you, set it up." }, 5),
  row("case.withdrawn", RAISER, "c_b", { note: "Solved it myself" }, 5),
  row("idea.cosigned", ["M. Roth", "u_mr"], "i_a", {}, 5),
  row("idea.uncosigned", ["M. Roth", "u_mr"], "i_a", {}, 5),
  row("idea.asked", DESK, "i_a", { text: "Who pays?" }, 5),
  row("idea.approved", DESK, "i_a", { team: ["L. Brandt"], note: "Go" }, 5),
  row("idea.funded", DESK, "i_a", { team: ["L. Brandt"], note: "Budget found" }, 5),
  row("project.member", LEAD, "p_one", { name: "H. Sander", userId: "u_hs", on: true }, 6),
  row("project.handed", LEAD, "p_one", { to: "H. Sander", toUserId: "u_hs", why: "New line" }, 6),
  row("project.baseline", LEAD, "p_one", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES weekly" }, 6),
  row("project.template", LEAD, "p_one", { key: "quick-win", version: 1, title: "Quick win" }, 6),
  row("project.invited", LEAD, "p_one", { userId: "u_mr", role: "sponsor" }, 6),
  row("project.invite.answered", ["M. Roth", "u_mr"], "p_one", { inviteId: "ev_025", userId: "u_mr", take: false, reason: "No time", lapsed: false }, 7),
  row("project.lead.answered", LEAD, "p_one", { take: true }, 7),
  row("project.goal", LEAD, "p_one", { goal: "Faster changeover", doneWhen: "Under 30 minutes", doneBy: 40, brief: "Why and what." }, 7),
  row("project.start.moved", LEAD, "p_one", { dueDay: 14, why: "Waiting for the part" }, 7),
  row("project.started", LEAD, "p_one", {}, 8),
  row("project.step.added", LEAD, "p_one", { stepId: "s1", text: "Pre-stage the tools", owner: "H. Sander", ownerUserId: "u_hs", dueDay: 12, note: "On line 3", to: "todo" }, 8),
  row("project.step.moved", LEAD, "p_one", { stepId: "s1", to: "done", why: "Finished", before: null }, 9),
  row("project.step.edited", LEAD, "p_one", { stepId: "s1", text: "Pre-stage all tools", owner: "", dueDay: null, removed: false }, 9),
  row("project.linked", LEAD, "p_one", { system: "jira", url: "https://example.test/browse/CHG-1", key: "CHG-1", stepId: "s1" }, 9),
  row("project.sync", LEAD, "p_one", { system: "jira", on: true }, 9),
  row("project.commented", LEAD, "p_one", { text: "Cart is on site." }, 9),
  row("project.done", LEAD, "p_one", { note: "Live on line 3" }, 10),
  row("project.measured", LEAD, "p_one", { check: 30, value: 31, source: "MES weekly", note: "Better", impact: { yearlySavingEur: 12000 } }, 40),
  row("project.measure.confirmed", ["B. Hartmann", "u_bh"], "p_one", { check: 30 }, 41),
  row("project.rewarded", ["B. Hartmann", "u_bh"], "p_one", { rule: "fixed", amount: 500, note: "Thank you" }, 42),
  row("project.claimed", RAISER, "p_one", {}, 43),
  row("project.stopped", LEAD, "p_two", { why: "No longer needed" }, 43),
  row("clock.due", CLOCK, "c_a", { kind: "deadline", dueDay: 8, toRoleHolderId: "s_dep" }, 44),
  row("day.advanced", DESK, null, { by: 1 }, 44),
];
