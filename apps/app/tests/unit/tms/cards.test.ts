import { describe, expect, it } from "vitest";
import {
  attachment,
  cardSize,
  confirmCard,
  decidedAt,
  notSetUpCard,
  parseSubmit,
  raiseTask,
  raisedCard,
  reminderCard,
  SUBMIT_KINDS,
  textCard,
  type Card,
  type CardInput,
} from "@/features/teams/cards";
import { renderTemplate } from "@/features/notify/templates";
import { LOCALES, createT } from "@/i18n";
import { teams } from "@/i18n/messages/teams";

const input: CardInput = {
  caseId: "case-1",
  cardId: "outbox-1",
  title: "Kühlmittel-Leck an Linie 3",
  body: "Seit Schichtbeginn tropft Kühlmittel an Station 4.",
  link: "https://app.example/acme/cases/case-1",
  fromUnit: "Montage · Werk Süd",
  routeLabel: "Qualität, Leckagen",
  answerBy: "Mon 2 Nov",
  workingDays: 5,
  deputy: "Werkleitung Süd",
  seats: [
    { id: "s1", label: "Werkleitung Süd" },
    { id: "s2", label: "Instandhaltung Werk Süd" },
  ],
  role: "Qualitätsleitung Werk Süd",
  days: 5,
  raised: "Mon 26 Oct",
  due: "Mon 2 Nov",
  daysLate: 1,
  company: "Acme",
  visibility: "everyone",
};

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every node of a card, with the nodes inside Action.ShowCard. */
function walk(v: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(v)) v.forEach((x) => walk(x, out));
  else if (isNode(v)) {
    out.push(v);
    Object.values(v).forEach((x) => walk(x, out));
  }
  return out;
}

const TEXT_KEYS = new Set(["text", "title", "label", "placeholder", "errorMessage", "value"]);


/** The card with every text blanked, so two locales can be compared by shape. Choice values are ids and stay. */
function shape(v: unknown, key = "", inChoices = false): unknown {
  if (Array.isArray(v)) return v.map((x) => shape(x, key, key === "choices"));
  if (isNode(v)) {
    const keepValue = inChoices || "id" in v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "value" && keepValue ? x : shape(x, k)]));
  }
  return typeof v === "string" && TEXT_KEYS.has(key) ? "" : v;
}

const submits = (c: Card) => walk(c).filter((n) => n.type === "Action.Submit");

describe("TMS cards", () => {
  const builders: [string, (l: "en" | "de") => Card][] = [
    ["raised", (l) => raisedCard(input, l)],
    ["raised idea", (l) => raisedCard({ ...input, kind: "idea" }, l)],
    ["reminder desk", (l) => reminderCard({ ...input, variant: "desk" }, l)],
    ["reminder escalation", (l) => reminderCard({ ...input, variant: "escalation" }, l)],
    ["text", (l) => textCard({ subject: "S", text: "T", link: input.link }, l)],
    ["raise task", (l) => raiseTask({ ...input, title: "", visibility: "private" }, l)],
    ["confirm raised", (l) => confirmCard({ ...input, sandbox: true }, l)],
    ["confirm yes", (l) => confirmCard({ ...input, outcome: "yes", time: "14:20" }, l)],
    ["confirm handed", (l) => confirmCard({ ...input, outcome: "handed", time: "14:20" }, l)],
    ["not set up", (l) => notSetUpCard({ company: "Acme", reason: "unknown" }, l)],
  ];

  it.each(builders)("%s is Adaptive Card 1.5, under 28 KB, with at most 3 top-level actions", (_n, build) => {
    for (const locale of LOCALES) {
      const c = build(locale);
      expect(c.type).toBe("AdaptiveCard");
      expect(c.version).toBe("1.5");
      expect(cardSize(c)).toBeLessThan(28 * 1024);
      expect((c.actions ?? []).length).toBeLessThanOrEqual(3);
      for (const n of walk(c)) {
        if (n.type === "TextBlock") {
          expect(["small", "default", "medium", "large", undefined]).toContain(n.size);
          expect(["default", "accent", "good", "warning", "attention", undefined]).toContain(n.color);
        }
        expect(n.type).not.toBe("Action.Execute");
      }
      expect(JSON.stringify(c)).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });

  it("measures size in UTF-8 bytes and wraps a card as an attachment", () => {
    const c = textCard({ subject: "ä", text: "€", link: "https://x.test" }, "en");
    expect(cardSize(c)).toBe(Buffer.byteLength(JSON.stringify(c), "utf8"));
    expect(cardSize(c)).toBeGreaterThan(JSON.stringify(c).length);
    expect(attachment(c)).toEqual({ contentType: "application/vnd.microsoft.card.adaptive", content: c });
  });

  it("stays under 28 KB with a long body, long title and 150 seats", () => {
    const seats = Array.from({ length: 150 }, (_, i) => ({ id: `seat-${i}`, label: `Rolle ${i} ${"ü".repeat(60)}` }));
    const c = raisedCard({ ...input, title: "t".repeat(5000), body: "ü".repeat(20000), seats }, "de");
    expect(cardSize(c)).toBeLessThan(28 * 1024);
  });

  it("submits answer and handover with caseId and cardId, and nothing else", () => {
    for (const c of [raisedCard(input, "en"), reminderCard({ ...input, variant: "desk" }, "en")]) {
      expect(c.actions?.map((a) => a.type)).toEqual(["Action.ShowCard", "Action.ShowCard", "Action.OpenUrl"]);
      expect(c.actions?.[0]?.style).toBe("positive");
      const found = submits(c);
      expect(found.map((s) => (s.data as Node).kind).sort()).toEqual([...SUBMIT_KINDS].sort());
      for (const s of found) {
        expect(s.data).toMatchObject({ caseId: "case-1", cardId: "outbox-1" });
        expect(s.style).toBe("positive");
      }
    }
  });

  it("offers an idea no yes, and a way to say yes in NextUp", () => {
    const choices = (c: Card) => {
      const set = walk(c).find((n) => n.id === "answer");
      return (set?.choices as Node[]).map((x) => x.value);
    };
    expect(choices(raisedCard(input, "en"))).toEqual(["yes", "no", "ask"]);
    const idea = raisedCard({ ...input, kind: "idea" }, "en");
    expect(choices(idea)).toEqual(["no", "ask"]);
    expect(walk(idea).some((n) => n.type === "Action.OpenUrl" && n.title === "Say yes in NextUp")).toBe(true);
  });

  it("lists at most 150 seats to hand over to, else sends the person to NextUp", () => {
    const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `R${i}` }));
    const choicesOf = (c: Card) => (walk(c).find((n) => n.id === "toSeatId")?.choices as Node[] | undefined) ?? null;
    expect(choicesOf(raisedCard({ ...input, seats: seatsOf(150) }, "en"))).toHaveLength(150);
    const many = raisedCard({ ...input, seats: seatsOf(151) }, "en");
    expect(choicesOf(many)).toBeNull();
    expect(submits(many).map((s) => (s.data as Node).kind)).toEqual(["answer"]);
    expect(JSON.stringify(many)).toContain("More than 150 roles");
  });

  it("limits the raise form: title 120, body 2000", () => {
    const c = raiseTask({ company: "Acme", body: "x".repeat(5000), title: "y".repeat(500) }, "en");
    const byId = (id: string) => walk(c).find((n) => n.id === id) as Node;
    expect(byId("title").maxLength).toBe(120);
    expect(byId("title").isRequired).toBe(true);
    expect(byId("body").maxLength).toBe(2000);
    expect((byId("title").value as string).length).toBeLessThanOrEqual(120);
    expect((byId("body").value as string).length).toBeLessThanOrEqual(2000);
    expect((byId("visibility").choices as Node[]).map((x) => x.value)).toEqual(["everyone", "private"]);
    expect(byId("kind").value).toBe("problem");
  });

  it("limits the answer text to 1000 and the why to 500", () => {
    const c = raisedCard(input, "en");
    expect((walk(c).find((n) => n.id === "text") as Node).maxLength).toBe(1000);
    expect((walk(c).find((n) => n.id === "why") as Node).maxLength).toBe(500);
  });

  it("shows the late number in attention, the sandbox line, and the right kind line", () => {
    const r = reminderCard({ ...input, variant: "escalation", daysLate: 2 }, "en");
    expect(JSON.stringify(r)).toContain("Escalated to you");
    expect(walk(r).some((n) => n.color === "attention" && n.text === "2 days late")).toBe(true);
    expect(JSON.stringify(reminderCard({ ...input, variant: "desk" }, "en"))).toContain("Past the promise");
    expect(JSON.stringify(confirmCard({ ...input, sandbox: true }, "en"))).toContain("Sandbox: the case is saved");
    expect(JSON.stringify(confirmCard({ ...input }, "en"))).not.toContain("Sandbox");
  });

  it("renders a mail template as a text card", () => {
    const r = renderTemplate("reminder.checkin", "de", { title: "Idee", link: "https://x.test/c" });
    const c = textCard({ subject: r.subject, text: r.text, link: r.link }, "de");
    expect(JSON.stringify(c)).toContain(r.subject);
    expect(c.actions?.[0]).toMatchObject({ type: "Action.OpenUrl", url: "https://x.test/c", title: "In NextUp öffnen" });
  });

  it.each(builders)("%s differs between German and English only in text", (_n, build) => {
    const en = build("en");
    const de = build("de");
    expect(shape(de)).toEqual(shape(en));
    expect(JSON.stringify(de)).not.toEqual(JSON.stringify(en));
  });

  it("takes every fixed text from the teams namespace, in both languages", () => {
    // Every text of a card is either the caller's data or a catalog string: a hard-coded English text would
    // stay the same in German.
    const dynamic = new Set<string>(
      [...Object.values(input).flatMap((v) => (typeof v === "string" ? [v] : [])), ...(input.seats ?? []).map((x) => x.label)],
    );
    for (const [name, build] of builders) {
      const en = walk(build("en"));
      const de = walk(build("de"));
      en.forEach((n, i) => {
        for (const k of TEXT_KEYS) {
          const a = n[k];
          const b = de[i]?.[k];
          if (typeof a !== "string" || n.type === "Input.ChoiceSet" || a.length === 0) continue;
          if (k === "value") continue; // an id, or a fact value the shape test covers
          if (dynamic.has(a) || [...dynamic].some((d) => a.includes(d) && b?.toString().includes(d))) continue;
          if (name === "text") continue;
          expect(b, `${name}.${k}: ${a}`).not.toBe(a);
        }
      });
    }
    for (const locale of LOCALES) {
      const t = createT(locale);
      expect(t("teams.raisedTask", { title: "X" })).toContain("X");
      expect(t("teams.refused", { reason: "R" })).toContain("R");
      for (const key of ["welcome", "howToRaise", "teamsOff"] as const) expect(t(`teams.${key}`)).not.toBe(`teams.${key}`);
    }
    expect(Object.keys(teams.de).sort()).toEqual(Object.keys(teams.en).sort());
  });

  it("parses what a card sends back", () => {
    expect(parseSubmit({ kind: "answer", caseId: "c", cardId: "o", answer: "no", text: "  because " })).toEqual({
      kind: "answer", caseId: "c", cardId: "o", answer: "no", text: "because",
    });
    expect(parseSubmit({ kind: "answer", caseId: "c", cardId: "o", answer: "yes", text: "" })).toEqual({
      kind: "answer", caseId: "c", cardId: "o", answer: "yes",
    });
    expect(parseSubmit({ kind: "handover", caseId: "c", cardId: "o", toSeatId: "s1", why: "away" })).toEqual({
      kind: "handover", caseId: "c", cardId: "o", toSeatId: "s1", why: "away",
    });
    expect(parseSubmit({ kind: "handover", caseId: "c", cardId: "o", toSeatId: "s1" })).toEqual({
      kind: "handover", caseId: "c", cardId: "o", toSeatId: "s1",
    });
  });

  it("refuses unknown kinds, missing ids, bad answers and over-long text", () => {
    const ok = { kind: "answer", caseId: "c", cardId: "o", answer: "no" };
    expect(parseSubmit(ok)).not.toBeNull();
    for (const bad of [
      null, undefined, "x", 3, [], {},
      { ...ok, kind: "delete" },
      { ...ok, kind: undefined },
      { ...ok, caseId: "" },
      { ...ok, cardId: undefined },
      { ...ok, caseId: 5 },
      { ...ok, caseId: "x".repeat(200) },
      { ...ok, answer: "maybe" },
      { ...ok, answer: undefined },
      { ...ok, text: "x".repeat(1001) },
      { ...ok, text: 7 },
      { kind: "handover", caseId: "c", cardId: "o" },
      { kind: "handover", caseId: "c", cardId: "o", toSeatId: "" },
      { kind: "handover", caseId: "c", cardId: "o", toSeatId: "s", why: "x".repeat(501) },
    ]) {
      expect(parseSubmit(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseSubmit({ ...ok, text: "x".repeat(1000) })).not.toBeNull();
  });

  it("names when an earlier answer was given: the time today, date and time before (TMS-L1)", () => {
    const at = Date.UTC(2026, 10, 8, 1, 10);
    expect(decidedAt(at, "de", Date.UTC(2026, 10, 8, 9, 0), "UTC")).toBe("01:10");
    expect(decidedAt(at, "en", Date.UTC(2026, 10, 8, 9, 0), "UTC")).toBe("01:10");
    expect(decidedAt(at, "de", Date.UTC(2026, 10, 10, 9, 0), "UTC")).toBe("08.11., 01:10");
    const t = createT("de");
    expect(t("teams.refusedAnswered", { name: "Julia Rossi", time: "01:10" })).toBe("Dieser Fall wurde schon von Julia Rossi um 01:10 beantwortet.");
  });
});
