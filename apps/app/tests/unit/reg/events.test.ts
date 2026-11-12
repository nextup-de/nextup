// REG-A1: the event types and the app event list in one file per area (plan REG, decisions D5 and D8).
import { describe, expect, it } from "vitest";
import type { EventPayload } from "@/features/cases/events";
import { AGENT_EVENT_TYPES } from "@/features/cases/events/agent";
import { APPROVAL_EVENT_TYPES } from "@/features/cases/events/approval";
import { CASE_EVENT_TYPES } from "@/features/cases/events/case";
import { OVERLOAD_EVENT_TYPES } from "@/features/cases/events/overload";
import { PROJECT_EVENT_TYPES } from "@/features/cases/events/project";
import { APP_EVENT_TYPES, CORE_APP_EVENT_TYPES, isAppEventType, logFromRows, type AppEventType } from "@/features/cases/persist";
import type { State } from "@/features/cases/reducer";
import type { Seed } from "@/features/demo/types";
import { prepareAgentAppend } from "@/server/actions/append/agent";
import { prepareApprovalAppend } from "@/server/actions/append/approval";
import { prepareCaseAppend } from "@/server/actions/append/case";
import { prepareOverloadAppend } from "@/server/actions/append/overload";
import { prepareProjectAppend } from "@/server/actions/append/project";
import type { AppendCtx } from "@/server/actions/append/shared";
import { REPLAY_ROWS } from "./events-replay";
import snapshot from "./snapshot/events.json";

describe("REG events split", () => {
  const recorded: string[] = snapshot.appEventTypes;
  it("every case.* app type is in CASE_EVENT_TYPES and every project.* one in PROJECT_EVENT_TYPES", () => {
    expect([...CASE_EVENT_TYPES].sort()).toEqual(recorded.filter((t) => t.startsWith("case.")));
    expect([...PROJECT_EVENT_TYPES].sort()).toEqual(recorded.filter((t) => t.startsWith("project.")));
    expect([...CORE_APP_EVENT_TYPES].sort()).toEqual(recorded.filter((t) => !t.startsWith("case.") && !t.startsWith("project.")));
  });
  it("the agent, approval and overload lists are empty until AGT, GAT and OVL", () => {
    expect(AGENT_EVENT_TYPES).toEqual([]);
    expect(APPROVAL_EVENT_TYPES).toEqual([]);
    expect(OVERLOAD_EVENT_TYPES).toEqual([]);
  });
  it("APP_EVENT_TYPES as a set equals the snapshot recorded before the split, with no type twice", () => {
    expect([...APP_EVENT_TYPES].sort()).toEqual(recorded);
    expect(new Set(APP_EVENT_TYPES).size).toBe(APP_EVENT_TYPES.length);
  });
  it("isAppEventType answers as before", () => {
    for (const t of recorded) expect(isAppEventType(t), t).toBe(true);
    for (const t of ["case.unanswered", "case.building", "case.shipped", "clock.due", "case.deleted", ""]) expect(isAppEventType(t), t).toBe(false);
  });
});

describe("REG events replay", () => {
  it("round-trips the fixed pre-REG log through logFromRows exactly as recorded, and accepts every app type", async () => {
    const log = logFromRows(REPLAY_ROWS, 3);
    await expect(JSON.stringify(log, null, 2)).toMatchFileSnapshot("./snapshot/events-replay.json");
    for (const r of REPLAY_ROWS) {
      if (r.type === "case.unanswered" || r.type === "clock.due") expect(isAppEventType(r.type), r.type).toBe(false);
      else expect(isAppEventType(r.type), r.type).toBe(true);
    }
  });
});

describe("REG append hooks", () => {
  const ctx = (type: AppEventType, payload: EventPayload, target: string | null): AppendCtx => ({
    companyId: "co1", viewer: { userId: "u1", role: "leader" }, type, target, payload,
    state: { cases: [], projects: [] } as unknown as State, seed: {} as unknown as Seed, locale: "en",
  });
  const hooks = [prepareCaseAppend, prepareProjectAppend, prepareAgentAppend, prepareApprovalAppend, prepareOverloadAppend];
  it("each of the five hooks returns the payload it got, unchanged, for a case, a project and a core event", async () => {
    const contexts = [
      ctx("case.decided", { answer: "yes", projectId: "p_one", lead: "L. Brandt", draft: true }, "c_a"),
      ctx("project.started", {}, "p_one"),
      ctx("idea.cosigned", {}, "i_a"),
    ];
    expect(hooks).toHaveLength(5);
    for (const c of contexts) {
      for (const hook of hooks) {
        const out = await hook(c);
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.payload).toBe(c.payload);
      }
    }
  });
});
