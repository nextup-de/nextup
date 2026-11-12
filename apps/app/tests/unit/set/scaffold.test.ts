// SET-G1: the scaffold of the project draft. No behaviour: the types, the names and the empty values every later
// SET task builds on.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES, needsProjectsFlag } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DRAFT_UP_DAYS, INVITE_LAPSE_DAYS, INVITE_REMIND_DAYS, LEAD_REMIND_DAYS, LEAD_RETURN_DAYS, type Due, type DueKind } from "@/features/clock/due";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { DUTY_TEMPLATES, isDuty } from "@/features/notify/channels";
import { followsTemplate, NOTIFY_GROUPS, prefChange } from "@/features/notify/digest";
import { gateOf, NO_PREF } from "@/features/notify/gate";
import { LOOP_TYPES } from "@/features/notify/plan";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import { latestTemplate, TEMPLATES, templateSteps } from "@/features/templates/library";
import type { Invite, ReducedProject, Step, StepRole } from "@/features/projects/types";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "g" + n++, ts: 0, type, actor, actorUserId, target, payload, day: 0 });

const NEW_EVENTS = ["project.lead.answered", "project.template", "project.invited", "project.invite.answered", "project.goal", "project.start.moved"] as const;
const NEW_LOOP = NEW_EVENTS.filter((t) => t !== "project.template" && t !== "project.goal").map((t) => `loop.${t}`);
const NEW_DUTIES = ["reminder.lead", "reminder.invite", "reminder.draft"];

describe("SET scaffold", () => {
  it("the six draft events are app events behind the projects flag", () => {
    for (const t of NEW_EVENTS) {
      expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
      expect(needsProjectsFlag(t, {}), t).toBe(true);
    }
  });

  it("the four notice events are loop events, listed as loop templates that follow loop.project.member", () => {
    expect(NEW_LOOP).toHaveLength(4);
    for (const t of NEW_LOOP) {
      expect(NOTIFY_GROUPS.loop, t).toContain(t);
      expect(followsTemplate(t), t).toBe("loop.project.member");
      expect(LOOP_TYPES.has(t.slice("loop.".length)), t).toBe(true);
      expect(LOOP_MAIL_TYPES.has(t.slice("loop.".length) as CaseEventType), t).toBe(true);
    }
    for (const t of NEW_DUTIES) expect(followsTemplate(t), t).toBe("reminder.start");
  });

  it("the new reminders are duties: an opt-out does not stop them, the preference refuses to switch them off, the gates still apply", () => {
    const company = { stage: "pilot", notifications: true, n8n: false };
    const optedOut = { template: false, all: false };
    for (const t of NEW_DUTIES) {
      expect(DUTY_TEMPLATES, t).toContain(t);
      expect(isDuty(t), t).toBe(true);
      expect(gateOf(company, "mail", t, optedOut), t).toEqual({ send: true });
      expect(gateOf({ ...company, stage: "sandbox" }, "mail", t, NO_PREF), t).toEqual({ send: false, reason: "sandbox" });
      expect(gateOf({ ...company, notifications: false }, "mail", t, NO_PREF), t).toEqual({ send: false, reason: "switched off" });
      expect(prefChange({ userId: "u1", companySlug: "acme" }, "acme", t, false), t).toEqual({ ok: false, error: "duty" });
    }
  });

  it("a project from a legacy yes has the empty draft values", () => {
    const raised = ev("case.raised", "Anonymous #4471", "u_js", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
    const yes = ev("case.decided", "T. Vogel", "u_tv", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" });
    const [p] = reduce(SEED, { events: [raised, yes], day: 0 }).projects;
    expect(p).toMatchObject({
      draft: false, leadState: "taken", leadAskedDay: null, template: null, invites: [], sponsorUserId: null, followerUserIds: [],
      goal: null, startDay: null, approvalsPendingSince: null, raiserNote: "", deciderUserId: null, status: "planning",
    });
  });

  it("the clock names the new kinds and keeps the identity of each cycle in the fact", () => {
    const kinds: DueKind[] = ["lead", "invite", "draft"];
    expect(kinds).toHaveLength(3);
    expect([LEAD_REMIND_DAYS, LEAD_RETURN_DAYS, INVITE_REMIND_DAYS, INVITE_LAPSE_DAYS, DRAFT_UP_DAYS]).toEqual([2, 4, 2, 5, 3]);
    const due: Due = { kind: "invite", target: "p_one", dueDay: 7, userId: "u_hs", inviteId: "g1", lapse: true, idemKey: "clk:invite:p_one:g1:lapse" };
    const lead: Due = { kind: "lead", target: "p_one", dueDay: 3, userId: "u_lb", askId: "g0", idemKey: "clk:lead:p_one:g0" };
    expect([due.inviteId, lead.askId]).toEqual(["g1", "g0"]);
    const fact: EventPayload = { kind: "invite", dueDay: 7, userId: "u_hs", inviteId: "g1", lapse: true, askId: "g0" };
    expect(fact.inviteId).toBe("g1");
  });

  it("the new payload fields and types type-check as fixtures", () => {
    const role: StepRole = "sponsor";
    const step: Step = { id: "s1", text: "Quote", owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "x", movedDay: 0, startedDay: null, doneDay: null, external: null, role };
    const goal: NonNullable<ReducedProject["goal"]> = { goal: "Faster changeover", doneWhen: "Under 30 minutes", doneBy: 40, brief: "Why and what." };
    const invite: Invite = { id: "g1", userId: "u_hs", role: "contributor", state: "lapsed", day: 2, reason: "" };
    const payloads: EventPayload[] = [
      { draft: true, raiserNote: "Thanks, you lead it", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb" },
      { take: false, reason: "No time", lapsed: true },
      { key: "quick-win", version: 1, title: "Quick win" },
      { userId: "u_hs", role: "sponsor" },
      { inviteId: "g1", userId: "u_hs", take: true },
      { goal: goal.goal, doneWhen: goal.doneWhen, doneBy: 40, brief: goal.brief },
      { dueDay: 12, why: "Waiting for the part" },
    ];
    expect([step.role, goal.doneBy, invite.state, payloads]).toHaveLength(4);
    const escalation: ReducedProject["escalated"] = { to: "Head", toSeatId: null, toRoleId: null, from: "Lead", day: 3, live: true, what: "draft" };
    expect(escalation?.what).toBe("draft");
  });

  it("the template library has a placeholder version 1 per key, no steps, and answers for unknown names", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(["8d", "investment", "quick-win"]);
    for (const [key, all] of Object.entries(TEMPLATES)) {
      expect(all.map((t) => [t.key, t.version, t.steps, t.agent])).toEqual([[key, 1, [], false]]);
      expect(latestTemplate(key)?.version).toBe(1);
    }
    expect(templateSteps("quick-win", 1)).toEqual([]);
    expect(templateSteps("nope", 1)).toEqual([]);
    expect(templateSteps("quick-win", 9)).toEqual([]);
    expect(templateSteps("toString", 1)).toEqual([]);
    expect(latestTemplate("nope")).toBeNull();
  });

  it("the projectDraft namespace is in both languages", () => {
    expect(en.projectDraft.title).toBe("Draft");
    expect(de.projectDraft.title).toBe("Entwurf");
    expect(en.projectDraft.beingSetUp).toBe("Accepted · being set up by {role}, start expected {date}");
    expect(de.projectDraft.beingSetUp).toBe("Angenommen · wird von {role} aufgesetzt, Start geplant am {date}");
  });
});
