// The case page's timeline: one sentence per event, built from the event's facts, in both languages. No event type shows raw.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { timelineSentence, type TimelineFacts } from "@/features/cases/timeline";
import { createT } from "@/i18n";
import { formatEuro } from "@/i18n/format";

const facts = (locale: "en" | "de"): TimelineFacts => ({
  other: () => null,
  money: (eur) => formatEuro(locale, eur),
  approver: (s) => (s.roleId === "role_budget" ? "Budget holder" : ""),
  answeredStep: (runId, stepId) => (runId === "run1" && stepId === "run1:0" ? "Budget holder" : ""),
});
const ev = (type: CaseEventType, payload: EventPayload = {}): CaseEvent => ({ id: "e1", ts: 0, day: 3, type, actor: "K. Yilmaz", actorUserId: "u_ky", target: "c1", payload });
const say = (type: CaseEventType, payload: EventPayload = {}, locale: "en" | "de" = "en") => timelineSentence(ev(type, payload), createT(locale), facts(locale));

const EVERY: [CaseEventType, EventPayload][] = [
  ["case.costed", { eur: 4800, basis: "Supplier quote" }],
  ["case.provisional", { approvals: [{ kind: "budget", roleId: "role_budget" }], note: "If the budget carries it.", lead: "L. Becker" }],
  ["case.provisional", { approvals: [{ kind: "budget", roleId: "role_budget" }], supplement: true }],
  ["case.approval", { runId: "run1", stepId: "run1:0", approvalAnswer: "conditions", conditions: "Two quotes first" }],
  ["case.approval", { runId: "gone", stepId: "gone:0", approvalAnswer: "no", reason: "Not this year" }],
  ["case.reviewed", { outcome: "forward" }],
  ["case.reviewed", { outcome: "forward", auto: true }],
  ["case.appealed", { text: "Please look again." }],
  ["case.appeal.decided", { uphold: true, reason: "Still no budget." }],
  ["case.appeal.decided", { uphold: false, reason: "The numbers moved." }],
  ["case.reopened", { why: "revisit" }],
  ["case.reopened", { why: "stopped" }],
  ["case.invite.declined", { why: "Not my line" }],
  ["case.commented", { text: "MES agrees." }],
  ["case.commented", { text: "New numbers.", rescore: true }],
  ["case.affected", { why: "Line 2 too" }],
  ["case.unaffected", {}],
];

describe("case timeline sentences", () => {
  it("never prints a raw event type, in English or German", () => {
    for (const [type, payload] of EVERY) {
      for (const locale of ["en", "de"] as const) {
        const s = say(type, payload, locale);
        expect(s, `${type} ${locale}`).not.toContain(type);
        expect(s, `${type} ${locale}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("says the amount and how it was estimated", () => {
    expect(say("case.costed", { eur: 4800, basis: "Supplier quote" })).toBe("K. Yilmaz estimated the cost at €4,800 (Supplier quote)");
    expect(say("case.costed", { eur: 4800 }, "de")).toMatch(/^K\. Yilmaz hat die Kosten auf 4\.800\s€ geschätzt$/);
  });

  it("names the approvers of a provisional yes, and the draft's lead", () => {
    expect(say("case.provisional", { approvals: [{ kind: "budget", roleId: "role_budget" }], note: "If the budget carries it.", lead: "L. Becker" }))
      .toBe("K. Yilmaz said yes, subject to approval by Budget holder: “If the budget carries it.” · the draft is led by L. Becker");
    expect(say("case.provisional", { approvals: [{ kind: "role", roleId: "unknown" }] })).toBe("K. Yilmaz said yes, subject to approval");
  });

  it("says an approval's answer, its conditions or its reason, and who it answered for", () => {
    expect(say("case.approval", { runId: "run1", stepId: "run1:0", approvalAnswer: "conditions", conditions: "Two quotes first" }))
      .toBe("K. Yilmaz answered for Budget holder: Approved with conditions: “Two quotes first”");
    expect(say("case.approval", { runId: "gone", stepId: "gone:0", approvalAnswer: "no", reason: "Not this year" }))
      .toBe("K. Yilmaz answered the approval: Not approved — Not this year");
    expect(say("case.approval", { runId: "run1", stepId: "run1:0", approvalAnswer: "yes", present: 7 }, "de"))
      .toBe("K. Yilmaz hat für Budget holder geantwortet: Freigegeben · 7 anwesend");
  });

  it("says how a second look ended, with its reason", () => {
    expect(say("case.appeal.decided", { uphold: true, reason: "Still no budget." })).toBe("K. Yilmaz took the second look and kept the no — Still no budget.");
    expect(say("case.appeal.decided", { uphold: false, reason: "The numbers moved." }, "de")).toBe("K. Yilmaz hat nach dem zweiten Blick den Fall wieder geöffnet — Grund: The numbers moved.");
  });

  it("names a reasoned no's category before its reason; an old no reads as before", () => {
    expect(say("case.decided", { answer: "no", category: "not-now", reason: "After the audit." })).toBe("K. Yilmaz answered “no” — Not now: After the audit.");
    expect(say("case.decided", { answer: "no", reason: "A gate finds it later." })).toBe("K. Yilmaz answered “no” — A gate finds it later.");
  });
});
