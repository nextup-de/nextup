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

  it("each area file exports the names of D10, and the stubs are empty", () => {
    const areas = { CASE: kase, PROJECT: project, AGENT: agent, APPROVAL: approval, OVERLOAD: overload } as Record<string, Record<string, unknown>>;
    for (const [name, mod] of Object.entries(areas)) {
      for (const part of ["LOOP_TYPES", "LOOP_TEMPLATES", "FOLLOWS", "REMINDER_KINDS", "REMINDER_TEXTS", "REMINDER_AUDIENCE", "DUTY_TEMPLATES", "LOOP_MAIL_TYPES"]) {
        expect(mod, `${name}_${part}`).toHaveProperty(`${name}_${part}`);
      }
    }
    for (const mod of [agent, approval, overload]) {
      for (const value of Object.values(mod)) expect(Array.isArray(value) ? value : Object.keys(value as object)).toEqual([]);
    }
    expect(kase.CASE_REMINDER_KINDS).toEqual(["deadline", "checkin", "escalation", "question", "triage", "appeal", "view"]);
    expect(project.PROJECT_REMINDER_KINDS).toEqual(["start", "measure", "confirm", "lead", "invite", "draft", "late", "blocked", "quiet", "stalled", "update", "vacant", "reward"]);
    expect(Object.keys(kase.CASE_REMINDER_AUDIENCE).sort()).toEqual([...kase.CASE_REMINDER_KINDS].sort());
    expect(Object.keys(project.PROJECT_REMINDER_TEXTS).sort()).toEqual(project.PROJECT_REMINDER_KINDS.map((k) => `reminder.${k}`).sort());
    // A kind, a loop type and a duty template live in one area only.
    const kinds = [...kase.CASE_REMINDER_KINDS, ...project.PROJECT_REMINDER_KINDS];
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(DUTY_TEMPLATES.filter((t) => t !== "raised")).toEqual([...kase.CASE_DUTY_TEMPLATES, ...project.PROJECT_DUTY_TEMPLATES]);
  });
});
