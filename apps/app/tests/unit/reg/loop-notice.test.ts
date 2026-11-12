// REG-C2: the loop mail builders split into one file per area change no mail (REG/D5).
import { describe, expect, it } from "vitest";
import { loopMails } from "@/features/loop/notice";
import { AGENT_NOTICES } from "@/features/loop/notice/agent";
import { APPROVAL_NOTICES } from "@/features/loop/notice/approval";
import { CASE_NOTICES } from "@/features/loop/notice/case";
import { OVERLOAD_NOTICES } from "@/features/loop/notice/overload";
import { PROJECT_NOTICES } from "@/features/loop/notice/project";
import { BASE_URL, EVENTS, PEOPLE, STATE } from "./loop-notice-fixture";

describe("REG loop notice split", () => {
  it("loopMails on the fixed events is what it was before the split, in German and English", async () => {
    const out = EVENTS.map(({ name, ev }) => {
      const args = { ev, state: STATE, people: PEOPLE, baseUrl: BASE_URL };
      return { name, de: loopMails(args, "de"), en: loopMails(args, "en") };
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./snapshot/loop-notice-golden.json");
  });

  it("every case.* type the old switch handled has a builder in CASE_NOTICES, and every project.* one in PROJECT_NOTICES", () => {
    const caseTypes = ["case.discussion", "case.invited", "case.checkin", "case.asked", "case.answered", "case.unanswered", "case.withdrawn", "case.handed", "case.decided", "case.reopened", "case.appealed", "case.appeal.decided", "case.override"];
    const projectTypes = [
      "project.handed", "project.stopped", "project.lead.answered", "project.invited", "project.invite.answered", "project.start.moved", "project.member",
      "project.started", "project.done", "project.measured", "project.measure.confirmed", "project.rewarded",
      // A project that keeps moving (plan MOV, D23); project.howwework tells nobody.
      "project.lead.changed", "project.doneby.moved", "project.paused", "project.resumed", "project.update", "project.lead.vacated",
    ];
    expect(Object.keys(CASE_NOTICES).sort()).toEqual([...caseTypes].sort());
    expect(Object.keys(PROJECT_NOTICES).sort()).toEqual([...projectTypes].sort());
    for (const type of caseTypes) expect(typeof (CASE_NOTICES as Record<string, unknown>)[type], type).toBe("function");
    for (const type of projectTypes) expect(typeof (PROJECT_NOTICES as Record<string, unknown>)[type], type).toBe("function");
  });

  it("the agent, approval and overload areas are empty until their phases fill them", () => {
    for (const map of [AGENT_NOTICES, APPROVAL_NOTICES, OVERLOAD_NOTICES]) expect(map).toEqual({});
  });

  it("a type that is no own key of a map (an inherited name) sends nothing", () => {
    const ev = { id: "x", type: "constructor", actor: "T. Vogel", actorUserId: "u_tv", target: "c_asked", payload: {} };
    expect(loopMails({ ev: ev as never, state: STATE, people: PEOPLE, baseUrl: BASE_URL })).toEqual([]);
  });
});
