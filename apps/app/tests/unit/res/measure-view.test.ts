// RES-U2: what the result part and a step's sheet read off a project (D14-D17, D19): who may send a result back, confirm it or enter it again, what
// happened to it, the baseline's confirmation and the recognition date; and who may ask the sponsor and what was asked.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { helpView, measureView } from "@/features/projects/measure-view";
import type { IdViewer } from "@/features/projects/views";
import { ev, project, SEATS, startedLog, stateOf } from "./project-fixture";

const viewer = (userId: string | null, role: IdViewer["role"] = "member"): IdViewer => ({ userId, role, me: meFor(userId, SEATS) });
const LEAD = viewer("u_lb", "leader");
const SPONSOR = viewer("u_ci");
const DEPUTY = viewer("u_hs", "leader"); // holds the route's deputy role in the fixture
const MANAGER = viewer("u_boss", "manager");
const STRANGER = viewer("u_stranger");
const P = (type: Parameters<typeof ev>[0], payload: Parameters<typeof ev>[3] = {}, day = 33, actor = "L. Brandt") => ev(type, actor, "p_one", payload, day);

/** Started, done on day 2, the 30-day check typed by the lead on day 33; C. Ilg is the accepted sponsor. */
const measured = P("project.measured", { check: 30, value: 30, source: "typed" }, 33);
function world(more: ReturnType<typeof ev>[] = [], today = 40) {
  const s = stateOf([...startedLog(), P("project.done", {}, 2), measured, ...more], today);
  const p = project(s);
  p.sponsorUserId = "u_ci";
  p.memberUserIds = [];
  return { s, p };
}
const flagsOf = (w: ReturnType<typeof world>, who: IdViewer) => measureView(w.p, w.s, who, 40).measures[0];

describe("RES measure view", () => {
  it("an unconfirmed typed result may be confirmed or sent back by the sponsor, the deputy's desk and a manager, and by nobody else", () => {
    const w = world();
    for (const who of [SPONSOR, DEPUTY, MANAGER]) {
      expect(flagsOf(w, who), who.userId ?? "").toMatchObject({ canConfirm: true, canQuestion: true, canReenter: false, sentBack: false, reentered: false, managerOnly: false });
    }
    for (const who of [LEAD, STRANGER]) expect(flagsOf(w, who), who.userId ?? "").toMatchObject({ canConfirm: false, canQuestion: false, canReenter: false });
    // who typed it never confirms it, though the rules would let them otherwise
    w.p.measures[0].byUserId = "u_hs";
    expect(flagsOf(w, DEPUTY)).toMatchObject({ canConfirm: false, canQuestion: false });
    expect(flagsOf(w, MANAGER)).toMatchObject({ canConfirm: true, canQuestion: true });
  });

  it("the sponsor is told they may confirm it as sponsor; the deputy and the manager are not", () => {
    const w = world();
    expect(flagsOf(w, SPONSOR).sponsorMay).toBe(true);
    expect(flagsOf(w, DEPUTY).sponsorMay).toBe(false);
    expect(flagsOf(w, MANAGER).sponsorMay).toBe(false);
    expect(flagsOf(w, LEAD).sponsorMay).toBe(false);
  });

  it("a confirmed result is closed: nobody confirms or sends it back", () => {
    const w = world([P("project.measure.confirmed", { check: 30 }, 34, "H. Sander")]);
    expect(w.p.measures[0].confirmed).toBe(true);
    for (const who of [SPONSOR, DEPUTY, MANAGER, LEAD]) expect(flagsOf(w, who), who.userId ?? "").toMatchObject({ canConfirm: false, canQuestion: false, canReenter: false });
  });

  it("a first doubt sends it back: only the lead may enter the check again, and the question is kept", () => {
    const w = world([P("project.measure.questioned", { check: 30, why: "Is that in minutes?" }, 34, "H. Sander")]);
    const lead = flagsOf(w, LEAD);
    expect(lead).toMatchObject({ sentBack: true, reentered: false, managerOnly: false, canReenter: true, canConfirm: false, canQuestion: false });
    expect(lead.questions).toEqual([{ day: 34, why: "Is that in minutes?", byUserId: "u_hs" }]);
    // a manager may do what the lead may on a project (the rights say so); nobody else enters it again, and a number sent back is confirmed by nobody
    expect(flagsOf(w, MANAGER)).toMatchObject({ canReenter: true, canConfirm: false });
    for (const who of [SPONSOR, DEPUTY, STRANGER]) expect(flagsOf(w, who), who.userId ?? "").toMatchObject({ canReenter: false, canConfirm: false });
  });

  it("the re-entry keeps the earlier number, and who may confirm may send it back once more", () => {
    const first = measured;
    const again = P("project.measured", { check: 30, value: 28, source: "typed", measureEventId: first.id }, 36);
    const w = world([P("project.measure.questioned", { check: 30, why: "Is that in minutes?" }, 34, "H. Sander"), again]);
    const f = flagsOf(w, SPONSOR);
    expect(f).toMatchObject({ sentBack: false, reentered: true, managerOnly: false, canConfirm: true, canQuestion: true, canReenter: false, revisionId: again.id });
    expect(f.previous).toEqual([{ value: 30, day: 33, byUserId: "u_lb" }]);
  });

  it("a second doubt makes it a manager's alone: nobody sends it back again, and only a manager confirms", () => {
    const w = world([
      P("project.measure.questioned", { check: 30, why: "one" }, 34, "H. Sander"), P("project.measured", { check: 30, value: 28, source: "typed" }, 36),
      P("project.measure.questioned", { check: 30, why: "two" }, 37, "H. Sander"),
    ]);
    expect(flagsOf(w, MANAGER)).toMatchObject({ managerOnly: true, canConfirm: true, canQuestion: false, canReenter: false });
    for (const who of [SPONSOR, DEPUTY, LEAD]) expect(flagsOf(w, who), who.userId ?? "").toMatchObject({ managerOnly: true, canConfirm: false, canQuestion: false, sponsorMay: false });
    expect(flagsOf(w, MANAGER).canReenter).toBe(false); // it was entered again once already
    expect(flagsOf(w, MANAGER).questions.map((q) => q.why)).toEqual(["one", "two"]);
  });

  it("the recognition date is the reward day plus 10 while the reward is due, and nothing before or after", () => {
    // both checks measured, the later one better than the baseline and confirmed by a second person
    const both = [P("project.measured", { check: 90, value: 28, source: "typed" }, 34)];
    const before = world(both);
    expect(measureView(before.p, before.s, MANAGER, 40).recognitionDueDay).toBeNull();
    const due = world([...both, P("project.measure.confirmed", { check: 90 }, 35, "H. Sander")]);
    expect(due.p).toMatchObject({ rewardDue: true, rewardDueDay: 35 });
    expect(measureView(due.p, due.s, MANAGER, 40).recognitionDueDay).toBe(45);
    const given = world([...both, P("project.measure.confirmed", { check: 90 }, 35, "H. Sander"), P("project.rewarded", {}, 36, "B. Hartmann")]);
    expect(measureView(given.p, given.s, MANAGER, 40).recognitionDueDay).toBeNull();
  });

  describe("the baseline", () => {
    const planning = (more: ReturnType<typeof ev>[] = []) => {
      const s = stateOf([startedLog()[0], startedLog()[1], P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 9), ...more], 12);
      const p = project(s);
      p.sponsorUserId = "u_ci";
      return { s, p };
    };
    const view = (w: ReturnType<typeof planning>, who: IdViewer) => measureView(w.p, w.s, who, 12).baseline;

    it("waits for a second person while a reward is possible: the sponsor and the deputy may confirm it, the lead and a stranger may not", () => {
      const w = planning();
      expect(view(w, LEAD)).toMatchObject({ needsConfirm: true, confirmed: null, canConfirm: false });
      for (const who of [SPONSOR, DEPUTY]) expect(view(w, who), who.userId ?? "").toMatchObject({ needsConfirm: true, canConfirm: true });
      expect(view(w, STRANGER).canConfirm).toBe(false);
      // a manager confirms only where there is no sponsor and the deputy's desk is empty
      expect(view(w, MANAGER).canConfirm).toBe(false);
      w.p.sponsorUserId = null;
      w.s.routes = w.s.routes.map((r) => ({ ...r, deputyRoleId: null, deputySeatId: null }));
      expect(view(w, MANAGER).canConfirm).toBe(true);
    });

    it("once confirmed it says by whom and when, and nothing waits; a company that gives no reward never waits", () => {
      const w = planning([P("project.baseline.confirmed", {}, 10, "H. Sander")]);
      expect(view(w, LEAD)).toEqual({ needsConfirm: false, confirmed: { byName: "H. Sander", day: 10 }, canConfirm: false, revisionId: w.p.baseline?.eventId ?? null });
      const none = planning();
      none.s.rules = { ...none.s.rules, reward: { ...none.s.rules.reward, kind: "none" } };
      expect(view(none, SPONSOR).needsConfirm).toBe(false);
    });
  });

  describe("Ask the sponsor", () => {
    const running = (more: ReturnType<typeof ev>[] = []) => {
      const s = stateOf([...startedLog(), P("project.step.added", { stepId: "s1", text: "Order the cart" }, 11), P("project.step.added", { stepId: "s2", text: "Train", to: "done" }, 11), ...more], 20);
      const p = project(s);
      p.sponsorUserId = "u_ci";
      p.memberUserIds = ["u_hs"];
      return { s, p };
    };
    const help = (w: ReturnType<typeof running>, id: string, who: IdViewer) => helpView(w.p, w.p.steps.find((x) => x.id === id)!, w.s, who, (r) => "Role " + r);

    it("the lead and a member may ask on a step that is still open; nobody else, and not on a done step or a project that does not run", () => {
      const w = running();
      for (const who of [LEAD, DEPUTY]) expect(help(w, "s1", who).canAsk, who.userId ?? "").toBe(true);
      expect(help(w, "s1", STRANGER).canAsk).toBe(false);
      expect(help(w, "s2", LEAD).canAsk).toBe(false); // done
      w.p.status = "measuring";
      expect(help(w, "s1", LEAD).canAsk).toBe(false);
    });

    it("lists the asks of that step with who was asked and whether it was answered", () => {
      const ask = P("project.help.asked", { stepId: "s1", text: "I need a budget decision" }, 14);
      const w = running([ask, P("project.commented", { text: "Approved" }, 16, "C. Ilg")]);
      w.p.sponsorUserId = "u_ci";
      // reduced before the sponsor was set by hand: the ask went to the sponsor of the reducer's state, so build it from the reduced ask
      w.p.helpAsks = [{ id: ask.id, stepId: "s1", text: "I need a budget decision", day: 14, byUserId: "u_lb", toUserId: "u_ci", toRoleId: null, answeredDay: 16 }];
      expect(help(w, "s1", LEAD).asks).toEqual([{ text: "I need a budget decision", day: 14, toName: "C. Ilg", answeredDay: 16 }]);
      expect(help(w, "s2", LEAD).asks).toEqual([]);
      // an ask that went to a role names the role
      w.p.helpAsks = [{ id: "x", stepId: "s1", text: "Stuck", day: 15, byUserId: "u_lb", toUserId: null, toRoleId: "role_owner", answeredDay: null }];
      expect(help(w, "s1", LEAD).asks).toEqual([{ text: "Stuck", day: 15, toName: "Role role_owner", answeredDay: null }]);
    });
  });
});
