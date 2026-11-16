// The opened item in German (DESIGN_RULES §5, quiet screens): the raised date and the AI summary come out German, with the
// summary's parts as they are written (German nouns keep their capital) and days as "T", not "d".
import { describe, expect, it } from "vitest";
import { briefForCase } from "@/features/ideas/brief";
import { raisedPhrase } from "@/features/inbox/raised";
import { SEED } from "@/features/demo/seed";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { createT } from "@/i18n";

describe("the opened item in German", () => {
  const de = createT("de");
  const en = createT("en");
  const now = new Date(2026, 10, 16, 12);

  it("says when it was raised in the viewer's language", () => {
    expect(raisedPhrase(de, new Date(2026, 9, 28, 9), now, false, "de")).toBe("am 28. Okt.");
    expect(raisedPhrase(en, new Date(2026, 9, 28, 9), now, false, "en")).toBe("on 28 Oct");
    expect(raisedPhrase(de, new Date(2026, 10, 16, 9, 14), now, true, "de")).toBe("heute");
    expect(raisedPhrase(de, new Date(2026, 10, 15, 9), now, false, "de")).toBe("gestern");
  });

  it("writes the summary's parts as German, nouns capitalised and days as T", () => {
    const S = reduce(SEED, emptyLog());
    const c = S.cases.find((x) => x.id === "c1")!;
    const ctx = { people: SEED.people, depts: SEED.depts, ideas: SEED.ideas, t: de };
    const facts = { promiseDays: SEED.promiseDays, viewer: { userId: "u-reader", seatIds: [], roleIds: [] }, affected: [], attachments: 0, updates: 0, passTo: "M. Roth", history: "" };
    const summary = briefForCase(c, ctx, facts).summary;
    expect(summary).toContain("Der Fall-Score ist");
    expect(summary).not.toMatch(/\bnutzen genannt\b|\bentscheidungstyp\b|\d d\b/);
    expect(summary).toMatch(/Nutzen genannt|Wartet \d+ T|Passt zu einem Entscheidungstyp der Karte/);
  });
});
