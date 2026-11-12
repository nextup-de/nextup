// REG-B1: the clock split into one file per area changes nothing: the same Dues, in the same order (REG/D5).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CaseEvent } from "@/features/cases/events";
import { DRAFT_UP_DAYS, DUE_KINDS, dueNow, hasFact, idemKeyOf, INVITE_LAPSE_DAYS, INVITE_REMIND_DAYS, LEAD_REMIND_DAYS, LEAD_RETURN_DAYS, QUESTION_REMIND_DAYS, QUESTION_RETURN_DAYS, targetSeat, TRIAGE_REMIND_DAYS, type Due } from "@/features/clock/due";
import { AGENT_DUE_KINDS, agentAfterFacts, agentDues } from "@/features/clock/kinds/agent";
import { APPROVAL_DUE_KINDS, approvalAfterFacts, approvalDues } from "@/features/clock/kinds/approval";
import { CASE_DUE_KINDS, caseAfterFacts, caseDues } from "@/features/clock/kinds/case";
import { OVERLOAD_DUE_KINDS, overloadAfterFacts, overloadDues } from "@/features/clock/kinds/overload";
import { PROJECT_DUE_KINDS, projectAfterFacts, projectDues } from "@/features/clock/kinds/project";
import * as shared from "@/features/clock/kinds/shared";
import { beforeAgentRun, writeAgentDue } from "@/server/scheduler/writers/agent";
import { beforeApprovalRun, writeApprovalDue } from "@/server/scheduler/writers/approval";
import { beforeCaseRun, writeCaseDue } from "@/server/scheduler/writers/case";
import { beforeOverloadRun, writeOverloadDue } from "@/server/scheduler/writers/overload";
import { beforeProjectRun, writeProjectDue } from "@/server/scheduler/writers/project";
import { clockDuePayload, type WriterCtx } from "@/server/scheduler/writers/shared";
import { above, FIXTURES, SEATS, TODAY } from "./clock-fixture";

const due = (d: Partial<Due> & Pick<Due, "kind">): Due => ({ target: "x", dueDay: 4, idemKey: "clk:test", ...d });
const ctx: WriterCtx = { state: FIXTURES[0].state, today: TODAY, companyId: "co" };
const event = (payload: Record<string, unknown>): CaseEvent => ({ id: "e", ts: 0, type: "clock.due", actor: "system:clock", actorUserId: null, target: "x", payload, day: 0 }) as CaseEvent;

describe("REG clock split", () => {
  it("dueNow on the fixed states is what it was before the split", async () => {
    const out = FIXTURES.map((f) => ({ name: f.name, dues: dueNow(f.state, f.today, above) }));
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./snapshot/clock-golden.json");
  });

  it("the kinds of the five areas, as a set, are the kinds there were before the split", () => {
    const snapshot = JSON.parse(readFileSync("tests/unit/reg/snapshot/clock.json", "utf8")) as { dueKinds: string[] };
    expect([...DUE_KINDS].sort()).toEqual([...snapshot.dueKinds].sort());
    expect(new Set(DUE_KINDS).size).toBe(DUE_KINDS.length);
    expect([...CASE_DUE_KINDS]).toEqual(["deadline", "checkin", "handover", "escalation", "question", "unanswered", "triage", "revisit", "appeal", "view"]);
    expect([...PROJECT_DUE_KINDS]).toEqual(["start", "measure", "confirm", "lead", "invite", "draft", "late", "blocked", "quiet", "stalled", "update", "vacant"]);
    for (const none of [AGENT_DUE_KINDS, APPROVAL_DUE_KINDS, OVERLOAD_DUE_KINDS]) expect(none).toEqual([]);
  });

  it("each area has its Dues function and its AfterFacts predicate; the stubs give nothing", () => {
    const s = FIXTURES[0].state;
    for (const [dues, after] of [[caseDues, caseAfterFacts], [projectDues, projectAfterFacts], [agentDues, agentAfterFacts], [approvalDues, approvalAfterFacts], [overloadDues, overloadAfterFacts]] as const) {
      expect(typeof dues(s, TODAY, above)).toBe("object");
      expect(typeof after(due({ kind: "deadline" }))).toBe("boolean");
    }
    for (const dues of [agentDues, approvalDues, overloadDues]) expect(dues(s, TODAY, above)).toEqual([]);
    for (const after of [agentAfterFacts, approvalAfterFacts, overloadAfterFacts]) expect(after(due({ kind: "handover", lapse: true }))).toBe(false);
    // the case area: hand-overs and the unanswered return go behind the facts; the project area: the lapses
    expect(["deadline", "checkin", "handover", "escalation", "question", "unanswered", "triage"].map((kind) => caseAfterFacts(due({ kind: kind as Due["kind"] })))).toEqual([false, false, true, false, false, true, false]);
    expect(projectAfterFacts(due({ kind: "lead", lapse: true }))).toBe(true);
    expect(projectAfterFacts(due({ kind: "lead" }))).toBe(false);
    expect(caseDues(s, TODAY, above).every((d) => CASE_DUE_KINDS.includes(d.kind as never))).toBe(true);
    expect(projectDues(s, TODAY, above).every((d) => PROJECT_DUE_KINDS.includes(d.kind as never))).toBe(true);
  });

  it("every constant and helper is still exported from due.ts", () => {
    expect([QUESTION_REMIND_DAYS, QUESTION_RETURN_DAYS, TRIAGE_REMIND_DAYS, LEAD_REMIND_DAYS, LEAD_RETURN_DAYS, INVITE_REMIND_DAYS, INVITE_LAPSE_DAYS, DRAFT_UP_DAYS]).toEqual([3, 5, 1, 2, 4, 2, 5, 3]);
    expect([idemKeyOf, hasFact, targetSeat]).toEqual([shared.idemKeyOf, shared.hasFact, shared.targetSeat]);
  });

  it("idemKeyOf and hasFact give today's keys without a step id and append or match it with one", () => {
    expect(idemKeyOf("deadline", "c_1", 7)).toBe("clk:deadline:c_1:7");
    expect(idemKeyOf("measure", "p_1", 7, 2)).toBe("clk:measure:p_1:7:2");
    expect(idemKeyOf("measure", "p_1", 7, 2, "s_1")).toBe("clk:measure:p_1:7:2:s_1");
    expect(idemKeyOf("start", "p_1", 7, undefined, "s_1")).toBe("clk:start:p_1:7:s_1");
    const history = [event({ kind: "measure", dueDay: 7, check: 2, stepId: "s_1" }), event({ kind: "start", dueDay: 3 })];
    expect(hasFact(history, "start", 3)).toBe(true);
    expect(hasFact(history, "measure", 7, 2)).toBe(true); // no step id asked: any
    expect(hasFact(history, "measure", 7, 2, "s_1")).toBe(true);
    expect(hasFact(history, "measure", 7, 2, "s_2")).toBe(false);
    expect(hasFact(history, "start", 3, undefined, "s_1")).toBe(false);
    expect(hasFact(history, "measure", 8)).toBe(false);
  });

  it("writeCaseDue gives case.handed to the fact's seat, nothing for a gone seat, and case.unanswered", () => {
    const seat = SEATS.find((s) => s.id === "seat_dep")!;
    expect(writeCaseDue(due({ kind: "handover", toRoleHolderId: "seat_dep" }), ctx)).toEqual({ type: "case.handed", payload: { to: seat.label, toRoleHolderId: "seat_dep", why: "deadline" } });
    expect(writeCaseDue(due({ kind: "handover", why: "escalation", toRoleHolderId: "seat_dep" }), ctx)).toMatchObject({ payload: { why: "escalation" } });
    expect(writeCaseDue(due({ kind: "handover", why: "vacant", toRoleHolderId: "seat_dep" }), ctx)).toMatchObject({ payload: { why: "vacant" } });
    expect(writeCaseDue(due({ kind: "handover", toRoleHolderId: "seat_gone" }), ctx)).toEqual({ skip: true });
    expect(writeCaseDue(due({ kind: "handover", toRoleHolderId: null }), ctx)).toEqual({ skip: true });
    expect(writeCaseDue(due({ kind: "unanswered" }), ctx)).toEqual({ type: "case.unanswered", payload: {} });
    for (const kind of ["deadline", "checkin", "escalation", "question", "triage", "start", "measure", "confirm", "lead", "invite", "draft"] as const) expect(writeCaseDue(due({ kind }), ctx), kind).toBeNull();
  });

  it("writeProjectDue gives the lead's and the invitee's lapse as the answer, and nothing for a reminder", () => {
    expect(writeProjectDue(due({ kind: "lead", lapse: true, askId: "y1", userId: "u_lead" }), ctx)).toEqual({ type: "project.lead.answered", payload: { take: false, lapsed: true, askId: "y1" } });
    expect(writeProjectDue(due({ kind: "lead", lapse: true }), ctx)).toEqual({ type: "project.lead.answered", payload: { take: false, lapsed: true } });
    expect(writeProjectDue(due({ kind: "invite", lapse: true, inviteId: "i1", userId: "u_x" }), ctx)).toEqual({ type: "project.invite.answered", payload: { inviteId: "i1", userId: "u_x", take: false, lapsed: true } });
    for (const kind of ["lead", "invite", "draft", "start", "measure", "confirm"] as const) expect(writeProjectDue(due({ kind }), ctx), kind).toBeNull();
    for (const kind of ["handover", "unanswered", "deadline"] as const) expect(writeProjectDue(due({ kind }), ctx), kind).toBeNull();
  });

  it("the stub writers return null and their hooks do nothing", async () => {
    for (const write of [writeAgentDue, writeApprovalDue, writeOverloadDue]) {
      for (const kind of ["handover", "unanswered", "lead", "invite", "deadline"] as const) expect(write(due({ kind, lapse: true }), ctx)).toBeNull();
    }
    for (const before of [beforeCaseRun, beforeProjectRun, beforeAgentRun, beforeApprovalRun, beforeOverloadRun]) await expect(before("co", 3)).resolves.toBeUndefined();
  });

  it("clockDuePayload copies every set optional field, and leaves out target, idemKey and what is not set", () => {
    expect(clockDuePayload(due({ kind: "deadline", dueDay: 9 }))).toEqual({ kind: "deadline", dueDay: 9 });
    const full = due({ kind: "invite", dueDay: 9, check: 3, toRoleHolderId: null, userId: "u_x", inviteId: "i1", askId: "y1", stepId: "s1", originEventId: "e1" });
    const payload = clockDuePayload(full);
    expect(payload).toEqual({ kind: "invite", dueDay: 9, check: 3, toRoleHolderId: null, userId: "u_x", inviteId: "i1", askId: "y1", stepId: "s1", originEventId: "e1" });
    expect(Object.keys(payload)).toEqual(["kind", "dueDay", "check", "toRoleHolderId", "userId", "inviteId", "askId", "stepId", "originEventId"]);
    expect(clockDuePayload(due({ kind: "lead", userId: undefined, askId: undefined }))).toEqual({ kind: "lead", dueDay: 4 });
    // why and lapse belong to the events a hand-over and a lapse become, never to a fact (as before the split)
    expect(clockDuePayload(due({ kind: "handover", why: "vacant" }))).toEqual({ kind: "handover", dueDay: 4 });
    expect(clockDuePayload(due({ kind: "lead", lapse: true }))).toEqual({ kind: "lead", dueDay: 4 });
  });
});
