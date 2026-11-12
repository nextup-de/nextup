// AGT-U1 (B2): the lead's inbox row for the agent's open suggestions (D18): one `suggestion` row, ask part, per project with open suggestions,
// linking to the Agent tab; nothing for anyone else and nothing once they are answered or expired. A caller without the agent state gets none.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { agentStateOf } from "@/features/agent/reduce";
import { inboxItems } from "@/features/inbox";
import { ev, project, SEATS, startedLog, stateOf } from "./fixture";

const log = (extra: ReturnType<typeof ev>[] = []) => {
  const sug = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "unblock", textId: "t1", stepId: "s1", refs: [] }, 31);
  const second = ev("agent.suggested", "system:agent", "p_one", { suggestionKind: "report", textId: "t2", week: 30, refs: [] }, 33);
  return { sug, second, events: [...startedLog(), sug, second, ...extra] };
};
const rows = (userId: string, role: "leader" | "manager" | "member", events: ReturnType<typeof ev>[], day = 34, over: { agent?: boolean; demo?: boolean; projects?: boolean } = {}) => {
  const state = stateOf(events, day);
  const p = project(state);
  p.sponsorUserId = "u_hs";
  const agent = over.agent === false ? undefined : agentStateOf({ events, day }, state);
  return inboxItems({ state, me: meFor(userId, SEATS), seats: SEATS, today: day, demo: over.demo ?? false, role, flags: { projects: over.projects ?? true, discussion: true }, agent })
    .filter((i) => i.kind === "suggestion");
};

describe("AGT inbox", () => {
  it("gives the lead one suggestion row for the project, ask part, linking to the Agent tab", () => {
    const l = log();
    const out = rows("u_lb", "leader", l.events);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "agent:p_one", ask: "part", kind: "suggestion", projectId: "p_one", href: "/projects/p_one?tab=agent", title: "Changeover cart", pinned: false });
    // the oldest open suggestion expires first: made on day 31, five working days
    expect(out[0].dueDay).toBe(36);
    expect(out[0].late).toBe(false);
    expect(rows("u_lb", "leader", l.events, 38)[0]).toMatchObject({ dueDay: 36, late: true });
  });

  it("gives nothing to anyone but the lead: not the sponsor, a manager, a team member or the raiser", () => {
    const l = log();
    for (const [id, role] of [["u_hs", "leader"], ["u_boss", "manager"], ["u_ci", "member"], ["u_js", "member"], ["u_tv", "leader"]] as const) expect(rows(id, role, l.events), id).toEqual([]);
  });

  it("gives nothing once every suggestion is answered or expired, and the due day follows the oldest one still open", () => {
    const l = log();
    const dismissed = ev("agent.dismissed", "L. Brandt", "p_one", { suggestionId: l.sug.id }, 34);
    const one = rows("u_lb", "leader", [...l.events, dismissed]);
    expect(one).toHaveLength(1);
    expect(one[0].dueDay).toBe(38); // the report of day 33 is the oldest that is left
    const expired = ev("agent.dismissed", "system:agent", "p_one", { suggestionId: l.second.id, why: "expired" }, 38);
    expect(rows("u_lb", "leader", [...l.events, dismissed, expired], 38)).toEqual([]);
    const accepted = ev("agent.accepted", "L. Brandt", "p_one", { suggestionId: l.second.id, suggestionKind: "report", edited: false, followUpId: "x", week: 30 }, 34);
    expect(rows("u_lb", "leader", [...l.events, dismissed, accepted])).toEqual([]);
  });

  it("gives nothing without the agent's state (no flag, the demo), with the projects flag off, in demo data, or on a stopped project", () => {
    const l = log();
    expect(rows("u_lb", "leader", l.events, 34, { agent: false })).toEqual([]);
    expect(rows("u_lb", "leader", l.events, 34, { projects: false })).toEqual([]);
    expect(rows("u_lb", "leader", l.events, 34, { demo: true })).toEqual([]);
    expect(rows("u_lb", "leader", [...l.events, ev("project.stopped", "L. Brandt", "p_one", { why: "no longer needed here" }, 34)])).toEqual([]);
  });
});
