// REG-C1 (D5): the notify registries are split into one file per area; nothing the planner writes may change.
import { describe, expect, it } from "vitest";
import * as agent from "@/features/notify/areas/agent";
import * as approval from "@/features/notify/areas/approval";
import * as kase from "@/features/notify/areas/case";
import * as overload from "@/features/notify/areas/overload";
import * as project from "@/features/notify/areas/project";
import { DUTY_TEMPLATES } from "@/features/notify/channels";
import { FOLLOWS, LOOP_TEMPLATES } from "@/features/notify/digest";
import { LOOP_TYPES, planNotices } from "@/features/notify/plan";
import { REMINDER_KINDS } from "@/features/notify/templates";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import snapshot from "./snapshot/notices.json";
import { FIXTURE_EVENTS, fixtureCtx } from "./notices-fixture";

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe("REG notices split", () => {
  it("planNotices on the fixed fixture events gives the golden recorded before the split", async () => {
    const golden = FIXTURE_EVENTS.map((ev) => ({
      id: ev.id, type: ev.type,
      teamsOff: planNotices(ev, fixtureCtx(false)),
      teamsOn: planNotices(ev, fixtureCtx(true)),
    }));
    await expect(JSON.stringify(golden, null, 2)).toMatchFileSnapshot("./snapshot/notices-golden.json");
  });

  it("the composed registries equal the snapshot recorded before the split", () => {
    expect(sorted(LOOP_TYPES)).toEqual(snapshot.loopTypes);
    expect(sorted(LOOP_TEMPLATES)).toEqual(snapshot.loopTemplates);
    expect(FOLLOWS).toEqual(snapshot.follows);
    expect(sorted(REMINDER_KINDS)).toEqual(snapshot.reminderKinds);
    expect(sorted(DUTY_TEMPLATES)).toEqual(snapshot.dutyTemplates);
    expect(sorted(LOOP_MAIL_TYPES)).toEqual(snapshot.loopMailTypes);
  });

  it("each area file exports the names of D10, and the overload area declares OVL's lists and nothing else", () => {
    const areas = { CASE: kase, PROJECT: project, AGENT: agent, APPROVAL: approval, OVERLOAD: overload } as Record<string, Record<string, unknown>>;
    for (const [name, mod] of Object.entries(areas)) {
      for (const part of ["LOOP_TYPES", "LOOP_TEMPLATES", "FOLLOWS", "REMINDER_KINDS", "REMINDER_TEXTS", "REMINDER_AUDIENCE", "DUTY_TEMPLATES", "LOOP_MAIL_TYPES"]) {
        expect(mod, `${name}_${part}`).toHaveProperty(`${name}_${part}`);
      }
    }
    // The overload area (plan OVL, D22): five loop types, four of them templates of the loop group and org.seat.vacant a duty template; no reminders and no
    // texts or audiences until OVL-N1.
    expect(overload.OVERLOAD_LOOP_TYPES).toEqual(["person.away", "desk.overloaded", "desk.covered", "desk.cleared", "org.seat.vacant"]);
    expect(overload.OVERLOAD_LOOP_TEMPLATES).toEqual(["loop.person.away", "loop.desk.overloaded", "loop.desk.covered", "loop.desk.cleared"]);
    expect(overload.OVERLOAD_LOOP_MAIL_TYPES).toEqual(["person.away", "desk.overloaded", "desk.covered", "desk.cleared", "org.seat.vacant"]);
    expect(overload.OVERLOAD_DUTY_TEMPLATES).toEqual(["loop.org.seat.vacant"]);
    expect(Object.keys(overload.OVERLOAD_FOLLOWS).sort()).toEqual(overload.OVERLOAD_LOOP_TEMPLATES.slice().sort());
    expect(Object.values(overload.OVERLOAD_FOLLOWS)).toEqual(overload.OVERLOAD_LOOP_TEMPLATES.map(() => "loop.case.decided"));
    for (const none of [overload.OVERLOAD_REMINDER_KINDS]) expect(none).toEqual([]);
    for (const none of [overload.OVERLOAD_REMINDER_TEXTS, overload.OVERLOAD_REMINDER_AUDIENCE]) expect(Object.keys(none)).toEqual([]);
    // The approval area (plan GAT): three loop notices, three duty reminders; their texts and audiences exist for every kind, the real audiences come with GAT-C1.
    expect(approval.APPROVAL_LOOP_TYPES).toEqual(["case.reviewed", "case.provisional", "case.approval"]);
    expect(approval.APPROVAL_LOOP_TEMPLATES).toEqual(["loop.case.reviewed", "loop.case.provisional", "loop.case.approval"]);
    expect(approval.APPROVAL_LOOP_MAIL_TYPES).toEqual(["case.reviewed", "case.provisional", "case.approval"]);
    expect(approval.APPROVAL_REMINDER_KINDS).toEqual(["review", "approval", "council"]);
    expect(approval.APPROVAL_DUTY_TEMPLATES).toEqual(["reminder.review", "reminder.approval", "reminder.council"]);
    // The agent area (plan AGT): one loop notice, an accepted Unblock; no reminders, no duty notices.
    expect(agent.AGENT_LOOP_TYPES).toEqual(["agent.accepted"]);
    expect(agent.AGENT_LOOP_TEMPLATES).toEqual(["loop.agent.accepted"]);
    expect(agent.AGENT_LOOP_MAIL_TYPES).toEqual(["agent.accepted"]);
    expect(agent.AGENT_FOLLOWS).toEqual({ "loop.agent.accepted": "loop.project.member" });
    for (const none of [agent.AGENT_REMINDER_KINDS, agent.AGENT_DUTY_TEMPLATES]) expect(none).toEqual([]);
    for (const none of [agent.AGENT_REMINDER_TEXTS, agent.AGENT_REMINDER_AUDIENCE]) expect(Object.keys(none)).toEqual([]);
    expect(kase.CASE_REMINDER_KINDS).toEqual(["deadline", "checkin", "escalation", "question", "triage", "appeal", "view"]);
    expect(project.PROJECT_REMINDER_KINDS).toEqual(["start", "measure", "confirm", "lead", "invite", "draft", "late", "blocked", "quiet", "stalled", "update", "vacant", "reward"]);
    expect(Object.keys(kase.CASE_REMINDER_AUDIENCE).sort()).toEqual([...kase.CASE_REMINDER_KINDS].sort());
    expect(Object.keys(project.PROJECT_REMINDER_TEXTS).sort()).toEqual(project.PROJECT_REMINDER_KINDS.map((k) => `reminder.${k}`).sort());
    // A kind, a loop type and a duty template live in one area only.
    const kinds = [...kase.CASE_REMINDER_KINDS, ...project.PROJECT_REMINDER_KINDS, ...approval.APPROVAL_REMINDER_KINDS];
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(DUTY_TEMPLATES.filter((t) => t !== "raised")).toEqual([...kase.CASE_DUTY_TEMPLATES, ...project.PROJECT_DUTY_TEMPLATES, ...approval.APPROVAL_DUTY_TEMPLATES, ...overload.OVERLOAD_DUTY_TEMPLATES]);
  });
});
