// DESIGN_RULES.md, section 5: plain copy (no emoji, no exclamation marks) and the formal German "Sie", checked over the two catalogs.
import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { againstAllowList, flatten } from "./guard";

const EN = flatten(en as never);
const DE = flatten(de as never);
const keysWhere = (catalog: Record<string, string>, test: (text: string) => boolean) => Object.entries(catalog).filter(([, v]) => test(v)).map(([k]) => k);

// Informal German address: du, dich, dir, dein-, euch, euer-. ("ihr" is also "her" and "their": not checked.)
const INFORMAL = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure|euren|eurem|eurer|Du|Dich|Dir|Dein|Deine|Euch|Euer|Eure)\b/;

/** German strings that still say du. Each is a draft of plan SET written before the rule was checked; the list can only shrink. */
const INFORMAL_ALLOWED: Record<string, string> = {
};

describe("DESIGN copy", () => {
  it("both catalogs hold the same keys (the rule's premise: every string is in en and de)", () => {
    expect(Object.keys(DE).sort()).toEqual(Object.keys(EN).sort());
  });

  it("no string has an emoji, in either language", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    expect([...keysWhere(EN, (v) => emoji.test(v)), ...keysWhere(DE, (v) => emoji.test(v))]).toEqual([]);
  });

  it("no string has an exclamation mark, in either language", () => {
    expect([...keysWhere(EN, (v) => v.includes("!")), ...keysWhere(DE, (v) => v.includes("!"))]).toEqual([]);
  });

  it("German copy says Sie, never du: an informal string is a violation unless it is listed, and a listed one that was fixed must go", () => {
    const { fresh, fixed } = againstAllowList(keysWhere(DE, (v) => INFORMAL.test(v)), INFORMAL_ALLOWED);
    expect({ fresh, fixed }).toEqual({ fresh: [], fixed: [] });
  });

  it("the formal address is really in use (the check above has something to guard)", () => {
    expect(keysWhere(DE, (v) => /\bSie\b/.test(v)).length).toBeGreaterThan(100);
  });
});
