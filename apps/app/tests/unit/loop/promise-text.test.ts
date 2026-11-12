import { describe, expect, it } from "vitest";
import { createT } from "@/i18n";
import type { AnswerPromise } from "@/features/cases/promise";
import { owedLine, promiseText, routingText, type PromiseNames } from "@/features/cases/promise-text";
import { dayFormatter } from "@/features/cases/rows";

const en = createT("en");
const de = createT("de");
const date = (d: number) => `D${d}`;
const names: PromiseNames = { holderRole: "Quality lead Süd", holderPeople: ["L. Brandt"], escalatedRole: null, date, today: 8 };

const base: AnswerPromise = {
  dueDay: 10, dueDate: "2026-03-11", state: "waiting", holder: "owner", holderRoleId: "r", holderSeatId: "s",
  handedDay: null, escalatedRoleId: null, answeredDay: null, expectedBy: null,
};

describe("LOOP promise text", () => {
  it("waiting names the date and the working days left", () => {
    expect(promiseText(base, names, en).answerBy).toBe("D10 · 2 working days left");
    expect(promiseText(base, names, de).answerBy).toBe("D10 · noch 2 Arbeitstage");
  });

  it("due today", () => {
    expect(promiseText({ ...base, state: "due-today" }, { ...names, today: 10 }, en).answerBy).toBe("today");
    expect(promiseText({ ...base, state: "due-today" }, { ...names, today: 10 }, de).answerBy).toBe("heute");
  });

  it("late says since when", () => {
    const p = { ...base, state: "late" as const };
    expect(promiseText(p, names, en).answerBy).toBe("D10 · late since D11");
    expect(promiseText(p, names, de).answerBy).toBe("D10 · überfällig seit D11");
  });

  it("answered on time and after the promise", () => {
    const on = { ...base, state: "answered-on-time" as const, answeredDay: 9 };
    const after = { ...base, state: "answered-late" as const, answeredDay: 12 };
    expect(promiseText(on, names, en).answerBy).toBe("Answered on D9 · within the promise");
    expect(promiseText(after, names, en).answerBy).toBe("Answered on D12 · after the promise");
    expect(promiseText(on, names, de).answerBy).toBe("Beantwortet am D9 · fristgerecht");
    expect(promiseText(after, names, de).answerBy).toBe("Beantwortet am D12 · nach der Frist");
  });

  it("the holder line has the role before the person", () => {
    expect(promiseText(base, names, en).with).toBe("Quality lead Süd · L. Brandt");
    expect(promiseText(base, names, de).with.startsWith("Quality lead Süd")).toBe(true);
  });

  it("a vacant seat says so", () => {
    const text = promiseText(base, { ...names, holderPeople: [] }, en);
    expect(text.with).toBe("Quality lead Süd · nobody yet - a manager sets this up.");
    expect(promiseText(base, { ...names, holderPeople: [] }, de).with).toBe("Quality lead Süd · noch niemand - eine Führungskraft richtet das ein.");
  });

  it("a hand-over adds the note", () => {
    const p = { ...base, state: "late" as const, holder: "deputy" as const, handedDay: 11 };
    expect(promiseText(p, names, en).note).toBe("Handed over on D11 because the answer date passed.");
    expect(promiseText(p, names, de).note).toBe("Am D11 übergeben, weil das Antwortdatum verstrichen war.");
    expect(promiseText(base, names, en).note).toBeNull();
  });

  it("the rule-off note says the deputy was told and the case stays", () => {
    const p = { ...base, state: "late" as const, escalatedRoleId: "dep" };
    expect(promiseText(p, { ...names, escalatedRole: "Deputy" }, en).note).toBe("The deputy was told on D11; the case stays with Quality lead Süd.");
    expect(promiseText(p, names, de).note).toBe("Die Vertretung wurde am D11 informiert; der Fall bleibt bei Quality lead Süd.");
  });

  it("demo mode shows the date, without working days left", () => {
    const p = { ...base, dueDate: null };
    expect(promiseText(p, names, en).answerBy).toBe("D10");
    expect(promiseText(p, names, de).answerBy).toBe("D10");
    expect(owedLine(p, names, en)).toBe("They owe you an answer by D10");
  });

  // A sample case raised six days ago is due on day -1: the page used to read "day -1 of the demo · late since day 0".
  it("a past due day on the demo clock reads as dates, never as a zero or negative day", () => {
    const p = { ...base, dueDay: -3, dueDate: null, state: "late" as const, escalatedRoleId: "dep" };
    const now = new Date(2026, 10, 6, 12);
    for (const [t, locale] of [[en, "en"], [de, "de"]] as const) {
      const text = promiseText(p, { ...names, date: dayFormatter(now, 0, locale), today: 0 }, t);
      const owed = owedLine(p, { ...names, date: dayFormatter(now, 0, locale), today: 0 }, t);
      for (const line of [text.answerBy, text.note ?? "", owed]) expect(line).not.toMatch(/-\d|\b0\b|demo/i);
    }
    const text = promiseText(p, { ...names, date: dayFormatter(now, 0, "en"), today: 0 }, en);
    expect(text.answerBy).toBe("3 Nov · late since 4 Nov");
    expect(text.note).toBe("The deputy was told on 4 Nov; the case stays with Quality lead Süd.");
    const yesterday = promiseText({ ...p, dueDay: -1 }, { ...names, date: dayFormatter(now, 0, "de"), today: 0 }, de);
    expect(yesterday.answerBy).toBe("gestern · überfällig seit heute");
  });

  it("routing text names the AI or the keywords as the source", () => {
    const n = { roleOfRoute: (id: string | null) => (id === "a" ? "Quality lead" : "Engineering lead"), date };
    const ai = routingText([{ kind: "proposed", routeId: "a", source: "llm" }, { kind: "sent", routeId: "b", chosenBy: "raiser" }], n, en);
    expect(ai).toEqual(["Proposed · Quality lead · by the AI", "Sent to · Engineering lead · chosen by the raiser"]);
    const kw = routingText([{ kind: "proposed-sent", routeId: "a", source: "keywords" }], n, en);
    expect(kw).toEqual(["Proposed and sent to Quality lead · by keywords"]);
    const moved = routingText([{ kind: "moved", routeId: "b", day: 12 }], n, de);
    expect(moved).toEqual(["Verschoben an · Engineering lead · D12"]);
    expect(routingText([{ kind: "proposed", routeId: "a", source: "keywords" }], n, de)[0]).toBe("Vorgeschlagen · Quality lead · nach Stichwörtern");
  });
});
