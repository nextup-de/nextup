// Plan REM, REM-K1: with the AI off, the coach's questions and its 'to go' lines come in the viewer's locale; German uses Sie.
import { expect, it } from "vitest";
import { benchmark, type BenchmarkContext } from "@/features/ideas/benchmarks";
import { coachMock, toGo } from "@/features/ideas/coach";
import { LOCAL_SEED } from "@/features/demo";
import { createT } from "@/i18n";

const ctx: BenchmarkContext = { routes: LOCAL_SEED.routes, goals: LOCAL_SEED.goals, cases: [], spendLimitEur: 500 };
const FIRST = "We lose forty minutes at every changeover on line 4";
const SECOND = FIRST + "\nA one-week trial with a quick-change fixture would save 20 minutes per shift, costing about 300 euros.";
const read = (text: string, locale: "en" | "de") => benchmark({ text, affected: [], attachments: 0 }, ctx, locale);

// Words of the English coach that must not be left in a German reply (the idea's own words and the company's goal names are data).
const ENGLISH = /First read|weakest bar|It needs|points to find|still open|Still at|Up \d+ to|I still need|Ready when you are|That is over the line/;

it("REM coach asks in German", () => {
  const first = coachMock(null, read(FIRST, "de"), 70, FIRST, 0, "de");
  expect(first).toContain("Erste Einschätzung: 39 von 100.");
  expect(first).toContain("Was die Kennzahlen schon erkennen:");
  expect(first).toContain("Was sie noch nicht erkennen: welchem Unternehmensziel sie dient");
  // The one question is the benchmark's own, in German, with the reason the person who decides asks it.
  expect(first).toContain("ist die schwächste Kennzahl bei 15. Nennen Sie eine Zahl für den Nutzen (Minuten, €, %).");
  expect(first).toContain("Eine Zahl macht aus einer Meinung einen Fall.");
  expect(first).not.toMatch(ENGLISH);

  const prev = read(FIRST, "de");
  const now = read(SECOND, "de");
  const better = coachMock(prev, now, 70, SECOND, 0, "de");
  expect(better).toContain("Plus 47 auf 86 - Strategische Passung wurde stärker, denn die Idee dient dem Ziel");
  expect(better).toContain("Damit ist die Schwelle überschritten");
  expect(better).toContain("Ergänzen Sie, wem sie noch hilft (Betroffene).");
  expect(better).not.toMatch(ENGLISH);

  // Nothing moved on the same open point: the question comes again, with the suggested answers when the page shows some.
  const again = coachMock(now, now, 70, "ok", 2, "de");
  expect(again).toContain("Weiter bei 86.");
  expect(again).toContain("Das brauche ich noch: Ergänzen Sie, wem sie noch hilft (Betroffene). Wählen Sie unten eine vorgeschlagene Antwort");
  expect(again).not.toMatch(ENGLISH);

  // A slip of the keyboard, and a ready idea.
  expect(coachMock(null, read("asdkjhfgkjh sdfkjhsdf kjhsdkfjh", "de"), 70, "asdkjhfgkjh sdfkjhsdf kjhsdkfjh", 0, "de")).toContain("Tippfehler");
  const ready = read(`${SECOND} Betroffen sind die Schichtleitung und die Bediener.`, "de");
  const readyFull = { ...ready, parts: ready.parts.map((p) => ({ ...p, missing: [] })), overall: 90 };
  expect(coachMock(now, readyFull, 70, "x", 0, "de")).toContain("Bereit, wenn Sie es sind");

  // German speaks to the person as Sie: never du, dein, euch.
  for (const text of [first, better, again]) expect(text).not.toMatch(/\b(du|dein|deine|deinen|dir|euch|ihr)\b/i);
  // Every coach key exists in both languages (the catalog types it, this keeps the German from falling back).
  const en = createT("en");
  const de = createT("de");
  expect(de("ideas.coachWhyDecider")).not.toBe(en("ideas.coachWhyDecider"));
  expect(de("ideas.coachReady", { site: "NextUp" })).toContain("NextUp");
});

it("REM coach to-go lines in German", () => {
  expect(toGo(62, 70, "de")).toBe("8 Punkte bis zur Veröffentlichung");
  expect(toGo(69, 70, "de")).toBe("1 Punkt bis zur Veröffentlichung");
  expect(toGo(70, 70, "de")).toBe("Bereit zur Veröffentlichung");
  expect(toGo(80, 70, "de")).toBe("Bereit zur Veröffentlichung");
});

it("REM coach English unchanged", () => {
  // Without a locale, and with "en": the same words as before the coach read its texts from the catalog.
  expect(toGo(62, 70)).toBe("8 points to publish");
  expect(toGo(69, 70, "en")).toBe("1 point to publish");
  expect(toGo(70, 70)).toBe("Ready to publish");
  const first = coachMock(null, read(FIRST, "en"), 70, FIRST, 0);
  expect(first).toBe(coachMock(null, read(FIRST, "en"), 70, FIRST, 0, "en"));
  expect(first).toBe([
    "First read: 39 of 100. It needs 70 to publish, so there are 31 points to find. What the benchmarks can already see: the owner of “Fixture, tooling or line layout” would decide it and nothing like it has been raised before. What they cannot see yet: which company goal it serves, a number on the upside and a first small step.",
    "Impact & reach is the weakest bar at 15. Put a number on the upside (minutes, €, %). A number is what turns an opinion into a case. It does not have to be exact - a rough figure with how you got to it is worth more than a precise one nobody believes.",
  ].join("\n\n"));
  const now = read(SECOND, "en");
  expect(coachMock(read(FIRST, "en"), now, 70, SECOND)).toContain("Up 47 to 86 - strategic fit got stronger, because the idea now serves “Every changeover under 20 minutes” and puts a figure on the goal. That is over the line");
  expect(coachMock(now, now, 70, "ok", 2)).toContain("I still need this: add who else it helps (Affected). Pick a suggested answer below and edit it so it is true for your line, or write your own.");
});
