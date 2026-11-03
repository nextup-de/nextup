import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog, type EventLog, type NewEvent } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";
import { statusView, type StatusView } from "@/features/floor/status";

const first = { id: "s1", roleId: "r1", label: "Seat 1", userId: null, sort: 0 };
const second = { id: "s2", roleId: "r2", label: "Seat 2", userId: null, sort: 1 };
const seed = { ...SEED, seats: [first, second] };
const CASE = "c_floor_1";
const DESK = "u_desk";
const ctx = { roleTitleOf: (id: string | null) => (id ? `Role ${id}` : null), areaName: "Line 3" };

function viewAfter(...more: NewEvent[]): { view: StatusView; json: string } {
  let log: EventLog = emptyLog();
  const all: NewEvent[] = [
    { type: "case.raised", actor: "system:floor", target: CASE, payload: { title: "Coolant leak", body: "Secret body text", kind: "problem", routeId: null, assignee: "Seat", assigneeRoleHolderId: first.id, fromDept: "Montage", visibility: "everyone" } },
    ...more,
  ];
  for (const ev of all) log = appendEvent(log, ev);
  const kase = reduce(seed, log).cases.find((c) => c.id === CASE);
  if (!kase) throw new Error("case missing");
  const view = statusView(kase, ctx);
  return { view, json: JSON.stringify(view) };
}
const desk = (type: NewEvent["type"], payload: NewEvent["payload"] = {}): NewEvent => ({ type, actor: "Dana Desk", actorUserId: DESK, target: CASE, payload });

describe("FLR status view", () => {
  it("a new case is sent, on the desk of the area's role", () => {
    const { view } = viewAfter();
    expect(view).toMatchObject({ title: "Coolant leak", area: "Line 3", step: "sent", decision: null, question: null });
    expect(view.roleTitle).toBe(`Role ${first.roleId}`);
  });

  it("read once the desk opened it", () => {
    expect(viewAfter(desk("case.read")).view.step).toBe("read");
  });

  it("asked shows the open question and the event a reply answers", () => {
    const { view } = viewAfter(desk("case.asked", { text: "Which shift saw it?" }));
    expect(view.step).toBe("asked");
    expect(view.question).toMatchObject({ text: "Which shift saw it?" });
    expect(view.question?.eventId).toMatch(/^e_/);
  });

  it("an answered question is no longer open", () => {
    const { view } = viewAfter(desk("case.asked", { text: "Which shift?" }), { type: "case.answered", actor: "system:floor", target: CASE, payload: { text: "Nights" } });
    expect(view.question).toBeNull();
    expect(view.step).toBe("read");
  });

  it("decided yes and no show the answer and the reason", () => {
    expect(viewAfter(desk("case.decided", { answer: "no", reason: "Not this year" })).view).toMatchObject({ step: "decided", decision: { answer: "no", reason: "Not this year" } });
    expect(viewAfter(desk("case.decided", { answer: "yes", reason: "Fixing it" })).view.decision).toEqual({ answer: "yes", reason: "Fixing it" });
  });

  it("handed shows the new role title", () => {
    const { view } = viewAfter(desk("case.handed", { to: "Other seat", toRoleHolderId: second.id, why: "Not mine" }));
    expect(view.step).toBe("handed");
    expect(view.roleTitle).toBe(`Role ${second.roleId}`);
  });

  it("never carries a user name, handle, comment or the raiser", () => {
    const { json } = viewAfter(
      { type: "case.commented", actor: "Carl Commenter", actorUserId: "u_c", target: CASE, payload: { text: "private comment text" } },
      desk("case.asked", { text: "Which shift?" }),
    );
    for (const secret of ["Dana", "Carl", "u_desk", "u_c", "private comment text", "Secret body text", "system:floor"]) expect(json).not.toContain(secret);
  });
});
