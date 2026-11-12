// Plan SET, SET-U1 (B2): the inbox items a project draft gives - a lead the draft waits for and an invitation waiting
// for an answer, also on a started project. States come from the real reducer, built from event logs.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { INVITE_REMIND_DAYS, LEAD_REMIND_DAYS } from "@/features/clock/due";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems } from "@/features/inbox";
import { projectDraftItems } from "@/features/inbox/sources/project-draft";
import type { InboxInput } from "@/features/inbox/types";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
  { id: "seat_mr", roleId: "role_ops", label: "M. Roth", userId: "u_mr", sort: 3 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_mr: "M. Roth", u_ci: "C. Ilg" };

let n = 0;
const ev = (type: CaseEventType, target: string | null, payload: EventPayload, day: number, by: string | null): CaseEvent =>
  ({ id: "i" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload, day: number, by: string | null) => ev(type, "p_one", payload, day, by);

const raised = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
const yes = (day = 2) => ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", draft: true }, day, "u_tv");

function itemsFor(userId: string, events: CaseEvent[], day: number, flags = { projects: true, discussion: true }) {
  const state = reduce(SEED, { events: [raised, ...events], day });
  const input: InboxInput = { state, me: meFor(userId, seats), seats, today: day, demo: false, flags };
  return projectDraftItems(input);
}

describe("SET inbox items", () => {
  it("a lead the draft waits for gets one 'lead' item to take part in, due on the reminder day, linking to the draft", () => {
    const items = itemsFor("u_lb", [yes(2)], 3);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "lead", ask: "part", projectId: "p_one", title: "Idea", dueDay: 2 + LEAD_REMIND_DAYS, href: "/projects/p_one" });
    // nobody else is asked: not the decider, not a stranger
    expect(itemsFor("u_tv", [yes(2)], 3)).toEqual([]);
    expect(itemsFor("u_hs", [yes(2)], 3)).toEqual([]);
  });

  it("a taken, declined or lapsed lead gives no item", () => {
    expect(itemsFor("u_lb", [yes(2), P("project.lead.answered", { take: true }, 3, "u_lb")], 3)).toEqual([]);
    expect(itemsFor("u_lb", [yes(2), P("project.lead.answered", { take: false, reason: "no time" }, 3, "u_lb")], 3)).toEqual([]);
    expect(itemsFor("u_lb", [yes(2), P("project.lead.answered", { take: false, lapsed: true }, 6, null)], 6)).toEqual([]);
  });

  it("a pending invitee gets one 'invitation' item with ask part, due on the reminder day", () => {
    const invite = P("project.invited", { userId: "u_mr", role: "contributor" }, 4, "u_lb");
    const items = itemsFor("u_mr", [yes(2), P("project.lead.answered", { take: true }, 3, "u_lb"), invite], 4);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "invitation", ask: "part", projectId: "p_one", dueDay: 4 + INVITE_REMIND_DAYS });
    expect(items[0].href).toBe(`/projects/p_one#invite-${invite.id}`);
    expect(itemsFor("u_lb", [yes(2), invite], 4).filter((i) => i.kind === "invitation")).toEqual([]);
  });

  it("nothing once the invitation is accepted, declined or lapsed; a follower is never asked", () => {
    const invite = P("project.invited", { userId: "u_mr", role: "member" }, 4, "u_lb");
    const base = [yes(2), invite];
    expect(itemsFor("u_mr", [...base, P("project.invite.answered", { inviteId: invite.id, userId: "u_mr", take: true }, 5, "u_mr")], 5)).toEqual([]);
    expect(itemsFor("u_mr", [...base, P("project.invite.answered", { inviteId: invite.id, userId: "u_mr", take: false }, 5, "u_mr")], 5)).toEqual([]);
    expect(itemsFor("u_mr", [...base, P("project.invite.answered", { inviteId: invite.id, userId: "u_mr", take: false, lapsed: true }, 9, null)], 9)).toEqual([]);
    expect(itemsFor("u_hs", [yes(2), P("project.invited", { userId: "u_hs", role: "follower" }, 4, "u_lb")], 4)).toEqual([]);
  });

  it("a sponsor invited after the start still gets the item, linking to the Team tab, until it is answered or lapses", () => {
    const started = [yes(2), P("project.lead.answered", { take: true }, 3, "u_lb"),
      P("project.baseline", { metric: "M", unit: "u", value: 1, better: "down", source: "s" }, 3, "u_lb"),
      P("project.goal", { goal: "A goal", doneWhen: "Done when" }, 3, "u_lb"), P("project.started", {}, 4, "u_lb")];
    const invite = P("project.invited", { userId: "u_hs", role: "sponsor" }, 6, "u_lb");
    const items = itemsFor("u_hs", [...started, invite], 7);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "invitation", ask: "part", dueDay: 6 + INVITE_REMIND_DAYS, href: `/projects/p_one?tab=team#invite-${invite.id}` });
    expect(itemsFor("u_hs", [...started, invite, P("project.invite.answered", { inviteId: invite.id, userId: "u_hs", take: true }, 8, "u_hs")], 8)).toEqual([]);
    expect(itemsFor("u_hs", [...started, invite, P("project.invite.answered", { inviteId: invite.id, userId: "u_hs", take: false, lapsed: true }, 11, null)], 11)).toEqual([]);
  });

  it("two invitations of one person are two items; a stopped project asks nobody; the projects flag gates all", () => {
    const a = P("project.invited", { userId: "u_mr", role: "member" }, 4, "u_lb");
    const b = P("project.invited", { userId: "u_mr", role: "sponsor" }, 4, "u_lb");
    expect(new Set(itemsFor("u_mr", [yes(2), P("project.lead.answered", { take: true }, 3, "u_lb"), a, b], 4).map((i) => i.id)).size).toBe(2);
    expect(itemsFor("u_lb", [yes(2), P("project.stopped", { why: "no" }, 3, "u_tv")], 3)).toEqual([]);
    expect(itemsFor("u_lb", [yes(2)], 3, { projects: false, discussion: true })).toEqual([]);
  });

  it("the one inbox carries them, each once", () => {
    const state = reduce(SEED, { events: [raised, yes(2)], day: 3 });
    const items = inboxItems({ state, me: meFor("u_lb", seats), seats, today: 3, demo: false, flags: { projects: true, discussion: true } });
    expect(items.filter((i) => i.kind === "lead")).toHaveLength(1);
  });
});
