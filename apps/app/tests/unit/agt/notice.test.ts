// AGT-K1 (B2): the one notice an accepted Unblock sends (D12, D14): to the recipients the server wrote into the event, with the nudge as sent and
// the line that says it was drafted with AI, in German and English. A suggestion, a dismissal, a switch and an accepted Report or Plan plan none
// of their own (a Report and a Plan notify through the update and the step they write).
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";
import { createT } from "@/i18n";
import { planNotices, type PlanPerson } from "@/features/notify/plan";

const seats: SeatRow[] = [{ id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 }];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const NAMES: Record<string, string> = { u_lead: "Lena Lead", u_au: "Ria Raiser", u_own: "Owen Owner", u_ci: "Cem Ilg", u_hs: "Sven Sponsor", u_de: "Dora Deutsch" };
const people: PlanPerson[] = Object.entries(NAMES).map(([id, name]) => ({ id, name, locale: id === "u_de" ? "de" : "en", email: `${id}@x.test` }));
const noticePeople: NoticePerson[] = people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email }));

let n = 0;
const ev = (type: CaseEventType, by: string | null, payload: EventPayload = {}, day = 3, target = "p_one"): CaseEvent =>
  ({ id: "x" + n++, ts: 0, type, actor: by === null ? "system:agent" : NAMES[by] ?? by, actorUserId: by, target, payload, day });
const raised = ev("case.raised", "u_au", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "Owen Owner" }, 0, "c_a");
const yes = ev("case.decided", "u_own", { answer: "yes", projectId: "p_one", lead: "Lena Lead", leadUserId: "u_lead", title: "Shorter changeover" }, 0, "c_a");
const stepAdded = ev("project.step.added", "u_lead", { stepId: "s1", text: "Order the crane slot", ownerUserId: "u_ci" });
const state = (): State => {
  const s = reduce(SEED, { events: [raised, yes, stepAdded], day: 3 });
  s.projects[0].leadUserId = "u_lead";
  return s;
};
const NUDGE = "Can you take the crane slot today? The trial is on Thursday.";
const accepted = (payload: EventPayload = {}, by = "u_lead") =>
  ev("agent.accepted", by, { suggestionId: "sug1", suggestionKind: "unblock", edited: false, text: NUDGE, toUserIds: ["u_ci", "u_de"], stepId: "s1", ...payload });

const sent = (e: CaseEvent, s: State, localeOf?: (p: NoticePerson) => "en" | "de") => loopNotices({ ev: e, state: s, people: noticePeople, baseUrl: "https://app.test/acme" }, localeOf);
const rows = (e: CaseEvent, s: State) =>
  planNotices(e, { companyId: "co1", state: s, people, prefs: [], company: { stage: "pilot", notifications: true, n8n: true }, subscriptions: [], baseUrl: "https://app.test/acme" }).filter((d) => d.channel !== "inapp");

describe("AGT notice", () => {
  it("an accepted Unblock is one notice to each recipient, with the step's title, the nudge, who sent it and the link to the project", () => {
    const s = state();
    const out = sent(accepted(), s);
    expect(out.map((x) => x.userId).sort()).toEqual(["u_ci", "u_de"]);
    const mine = out.find((x) => x.userId === "u_ci")!;
    expect(mine.subject).toBe("A nudge on your step: Order the crane slot");
    expect(mine.text).toContain(NUDGE);
    expect(mine.text).toContain("Drafted with AI, sent by Lena Lead");
    expect(mine.text).toContain("https://app.test/acme/projects/p_one");
  });

  it("is in each person's language: German for a German reader", () => {
    const out = sent(accepted(), state(), (p) => (p.id === "u_de" ? "de" : "en"));
    const de = out.find((x) => x.userId === "u_de")!;
    expect(de.subject).toBe(createT("de")("projectAgent.nudgeSubject", { step: "Order the crane slot" }));
    expect(de.subject).toContain("Ein Anstoss zu Ihrem Schritt");
    expect(de.text).toContain("Mit KI entworfen, gesendet von Lena Lead");
    expect(de.text).toContain(NUDGE);
    expect(out.find((x) => x.userId === "u_ci")!.text).toContain("Drafted with AI, sent by Lena Lead");
  });

  it("never reaches the sender, even when the event names them, and never twice the same person", () => {
    const s = state();
    expect(sent(accepted({ toUserIds: ["u_lead", "u_ci", "u_ci"] }), s).map((x) => x.userId)).toEqual(["u_ci"]);
  });

  it("goes through the composed planner as a loop notice to the recipients, once each", () => {
    const e = accepted();
    const d = rows(e, state());
    expect(d.every((x) => x.template === "loop.agent.accepted")).toBe(true);
    expect(d.map((x) => x.recipientUserId).sort()).toEqual(["u_ci", "u_de"]);
  });

  it("agent.suggested, agent.dismissed and agent.switched plan none, and neither does an accepted Report or Plan", () => {
    const s = state();
    const none = [
      ev("agent.suggested", null, { suggestionKind: "unblock", textId: "at_1", stepId: "s1", refs: [] }),
      ev("agent.dismissed", "u_lead", { suggestionId: "sug1", why: "later" }),
      ev("agent.switched", "u_lead", { on: true }),
      accepted({ suggestionKind: "report", text: undefined, toUserIds: undefined, followUpId: "fu" }),
      accepted({ suggestionKind: "plan", text: undefined, toUserIds: undefined, followUpId: "fu" }),
    ];
    for (const e of none) {
      expect(sent(e, s), e.type + " " + String(e.payload.suggestionKind)).toEqual([]);
      expect(rows(e, s).filter((d) => d.template.startsWith("loop.agent")), e.type).toEqual([]);
    }
  });

  it("sends nothing for an acceptance without words or without recipients", () => {
    const s = state();
    expect(sent(accepted({ text: "  " }), s)).toEqual([]);
    expect(sent(accepted({ toUserIds: [] }), s)).toEqual([]);
    expect(sent(accepted({ toUserIds: undefined }), s)).toEqual([]);
  });
});
