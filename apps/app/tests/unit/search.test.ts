import { describe, expect, it } from "vitest";
import { runSearch, tokens, type SearchItem } from "@/features/search";
const item = (title: string, hay = title, group = 1): SearchItem => ({ kind: "Idea", group, title, sub: "Production", hay, right: "Sent", go: { view: "dashboard", id: title } });
describe("navbar search ranking", () => {
  it("normalizes accents, punctuation and repeated spaces", () => {
    expect(tokens("  MÜLLER,  setup-cart ")).toEqual(["muller", "setup", "cart"]);
    expect(runSearch([item("J. Müller")], "muller")).toHaveLength(1);
  });
  it("ranks exact titles above partial and body matches", () => {
    const index = [item("Other", "setup cart"), item("Setup cart for tools"), item("Setup cart")];
    expect(runSearch(index, "setup cart").map((r) => r.title)).toEqual(["Setup cart", "Setup cart for tools", "Other"]);
  });
  it("finds reordered words, owners and statuses", () => {
    expect(runSearch([item("Setup cart", "T. Vogel")], "cart vogel sent")).toHaveLength(1);
  });
  it("tolerates one typo while ranking exact matches first", () => {
    expect(runSearch([item("Setip cart"), item("Setup cart")], "setup").map((r) => r.title)).toEqual(["Setup cart", "Setip cart"]);
    expect(runSearch([item("Setup cart")], "xyz")).toEqual([]);
  });
  it("requires every query word and handles empty input", () => {
    expect(runSearch([item("Setup cart")], "setup payroll")).toEqual([]);
    expect(runSearch([item("Setup cart")], "   ")).toEqual([]);
  });
  it("caps large result sets and keeps different categories visible", () => {
    const index = Array.from({ length: 20 }, (_, i) => item("Setup " + i, "setup", i % 5));
    const results = runSearch(index, "setup");
    expect(results).toHaveLength(10);
    expect(new Set(results.map((r) => r.group)).size).toBeGreaterThan(1);
  });
});

import { SEED } from "@/features/demo/seed";
import { reduce } from "@/features/cases/reducer";
import { demoData } from "@/features/metrics";
import { navbarIndex } from "@/features/search/navbar";
import { canOpen } from "@/components/dashboard/derive";
import type { DemoContext } from "@/components/dashboard/DemoProvider";

describe("navbar index access and destinations", () => {
  const S = reduce(SEED, { day: 0, events: [] });
  const role = SEED.personas.find((p) => p.id === "member")!;
  const persona = { role, who: role.who };
  const ctx = { seed: SEED, S, D: demoData(SEED, S, true), persona, role: "member", f: () => "today", href: (path: string) => "/acme" + path, tenant: { hiddenPeople: ["T. Vogel"] } } as unknown as DemoContext;
  it("indexes only cases this viewer can open", () => {
    const actual = navbarIndex(ctx).filter((r) => r.go?.view === "dashboard").map((r) => r.go!.id).sort();
    expect(actual).toEqual(ctx.D.cases.filter((c) => canOpen(ctx, c)).map((c) => c.id).sort());
    expect(actual.length).toBeLessThan(ctx.D.cases.length);
  });
  it("links people directly to profiles and excludes hidden profiles", () => {
    const people = navbarIndex(ctx).filter((r) => r.kind === "Person");
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((r) => r.go?.view === "people" && r.go.id === r.title)).toBe(true);
    expect(people.some((r) => r.title === "T. Vogel")).toBe(false);
    expect(people.some((r) => r.title === persona.who.name)).toBe(false);
    expect(people.every((r) => r.href === "/acme/people/" + encodeURIComponent(r.title))).toBe(true);
  });
  it("links a case to the Overview with that case open", () => {
    const cases = navbarIndex(ctx).filter((r) => r.case);
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((r) => r.href === "/acme/dashboard?id=" + encodeURIComponent(r.go!.id))).toBe(true);
  });
});
