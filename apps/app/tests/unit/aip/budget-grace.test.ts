// Decisions Q7.4 and Q7.6: at 100 % of the month's budget only the raise path goes on, up to 120 %; a mail goes to the
// console admins once per level (70, 90, 100, 120) and month.
import { describe, expect, it } from "vitest";
import { GRACE_PCT, inGrace, monthLevel, RAISE_PATH_PURPOSES, usedUpBy, type AiBudget } from "@/features/ai/budget";
import { AI_BUDGET_TEMPLATE, aiBudgetDraft, aiBudgetKey, mailLevelOf, monthKey } from "@/features/ai/budget-mail";
import { aiGate, type AiPurpose } from "@/features/ai/gate";
import type { AiSettings } from "@/features/ai/settings";
import { gateOf, NO_PREF } from "@/features/notify/gate";
import { adminUrl } from "@/features/tenant/urls";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "m", endpoint: null, deployment: null, brainModel: "bm" };
const real = { stage: "pilot", hasDatabase: true, settings: bedrock, dpaSignedAt: new Date("2026-10-01"), assistantOn: true, aiRouting: true };
const PURPOSES: AiPurpose[] = ["assist", "routing", "coach", "brain"];
const euros = (pct: number): AiBudget => ({ capEur: 100, spentEur: pct, unpriced: [], tokensUnpriced: 0, tokenCap: 20_000_000 });
const tokens = (pct: number): AiBudget => ({ capEur: 100, spentEur: 0, unpriced: ["mistral-nemo"], tokensUnpriced: pct * 10_000, tokenCap: 1_000_000 });

describe("the raise path's grace (Q7.4)", () => {
  it("is routing, the raise-page assistant and the idea studio coach, up to 120 %", () => {
    expect(GRACE_PCT).toBe(120);
    expect([...RAISE_PATH_PURPOSES].sort()).toEqual(["assist", "coach", "routing"]);
  });

  for (const [name, at] of [["the euro budget", euros], ["the token limit of models without a price", tokens]] as const) {
    it(`${name}: each purpose at 99, 100, 119 and 120 %`, () => {
      const open = (purpose: AiPurpose, pct: number) => aiGate({ ...real, purpose, budget: at(pct) }).on;
      for (const purpose of PURPOSES) {
        const raise = purpose !== "brain";
        expect([99, 100, 119, 120].map((pct) => open(purpose, pct)), purpose).toEqual(raise ? [true, true, true, false] : [true, false, false, false]);
      }
    });

    it(`${name}: the level and the grace between 100 and 120 %`, () => {
      expect([99, 100, 119, 120].map((pct) => monthLevel(at(pct)).level)).toEqual(["warn90", "reached", "reached", "stopped"]);
      expect([99, 100, 119, 120].map((pct) => inGrace(at(pct)))).toEqual([false, true, true, false]);
    });
  }

  it("the reason names the grace for the raise path, and only there", () => {
    expect(aiGate({ ...real, purpose: "routing", budget: euros(120) })).toEqual({ on: false, why: expect.stringContaining("raising ideas") });
    expect(aiGate({ ...real, purpose: "brain", budget: euros(100) })).toEqual({ on: false, why: "This month's AI budget for this company is used up." });
  });

  it("a cap of 0 has no grace: every purpose stops from the first call", () => {
    for (const purpose of PURPOSES) expect(aiGate({ ...real, purpose, budget: { ...euros(0), capEur: 0 } }).on).toBe(false);
    expect(usedUpBy({ capEur: 0, spentEur: 0, tokensUnpriced: 0, tokenCap: 1 }, true)).toBe("budget");
  });

  it("either cap at 120 % stops the raise path, the euro cap named first", () => {
    const both = { capEur: 100, spentEur: 120, tokensUnpriced: 1200, tokenCap: 1000 };
    expect(usedUpBy(both, true)).toBe("budget");
    expect(usedUpBy({ ...both, spentEur: 110 }, true)).toBe("tokens");
    expect(usedUpBy({ ...both, spentEur: 110, tokensUnpriced: 1100 }, true)).toBeNull();
  });
});

describe("the budget warning mail (Q7.6)", () => {
  it("crosses a level at 70, 90, 100 and 120 %, whichever cap is further", () => {
    expect([0, 69, 70, 89, 90, 99, 100, 119, 120, 500].map((pct) => mailLevelOf(euros(pct))?.level ?? null)).toEqual([null, null, 70, 70, 90, 90, 100, 100, 120, 120]);
    expect(mailLevelOf(tokens(91))).toEqual({ level: 90, by: "tokens" });
    expect(mailLevelOf({ ...tokens(91), spentEur: 95 })).toEqual({ level: 90, by: "budget" });
    expect(mailLevelOf({ ...tokens(101), spentEur: 95 })).toEqual({ level: 100, by: "tokens" });
  });

  it("one key per company, month (UTC) and level", () => {
    const now = new Date("2026-11-30T23:30:00Z");
    expect(monthKey(now)).toBe("2026-11");
    expect(aiBudgetKey("c1", now, 90)).toBe("ai.budget:c1:2026-11:90");
    expect(aiBudgetKey("c1", new Date("2026-12-01T00:00:00Z"), 90)).toBe("ai.budget:c1:2026-12:90");
  });

  it("says the level, spent against cap, what pauses and where to look, in the recipient's language", () => {
    const base = { key: "k", userId: "u", address: "a@x.example", company: "Acme", budget: euros(100), link: "https://x.example/admin/assistant", now: new Date("2026-11-11T10:00:00Z") };
    const en = aiBudgetDraft({ ...base, locale: "en", level: 100, by: "budget" });
    expect(en).toMatchObject({ channel: "mail", template: AI_BUDGET_TEMPLATE, key: "k", recipientUserId: "u", address: "a@x.example", subject: "AI budget of Acme at 100 %", link: base.link });
    expect(en.text).toContain("€100 of €100 (100 %)");
    expect(en.text).toContain("Ideas can still be raised with AI help");
    expect(en.text).toContain("https://x.example/admin/assistant");
    expect(en.data).toMatchObject({ level: 100, by: "budget", month: "2026-11" });
    const stopped = aiBudgetDraft({ ...base, locale: "en", level: 120, by: "budget", budget: euros(120) });
    expect(stopped.text).toContain("All AI is paused until 1 Dec 2026");
    const de = aiBudgetDraft({ ...base, locale: "de", level: 70, by: "tokens", budget: tokens(70) });
    expect(de.subject).toBe("KI-Budget von Acme bei 70 %");
    expect(de.text).toContain("Modelle ohne Preis: 700.000 von 1.000.000 Tokens (70 %).");
    expect(de.text).toContain("Noch ist nichts pausiert.");
  });

  it("is an operations mail: it goes out whatever the switch and the person's choice, but never from a sandbox", () => {
    const company = { stage: "pilot", notifications: false, n8n: false };
    expect(gateOf(company, "mail", AI_BUDGET_TEMPLATE, { template: false, all: false })).toEqual({ send: true });
    expect(gateOf({ ...company, stage: "live" }, "mail", AI_BUDGET_TEMPLATE, NO_PREF)).toEqual({ send: true });
    expect(gateOf({ ...company, stage: "sandbox" }, "mail", AI_BUDGET_TEMPLATE)).toEqual({ send: false, reason: "sandbox" });
    // Other templates are unchanged.
    expect(gateOf(company, "mail", "digest", { template: true, all: null })).toEqual({ send: false, reason: "switched off" });
  });

  it("links to /admin/assistant on the stack's own host", () => {
    expect(adminUrl("/assistant", { TENANT_MODE: "single", APP_ORIGIN: "https://acme.sellux.ch/" })).toBe("https://acme.sellux.ch/admin/assistant");
    expect(adminUrl("/assistant", { APP_ORIGIN: "https://nextup.example" })).toBe("https://nextup.example/admin/assistant");
    expect(adminUrl("/assistant", { TENANT_MODE: "subdomain", APP_ORIGIN: "https://nextup.example" })).toBe("https://admin.nextup.example/assistant");
  });
});
