import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "@/components/ui/elements";
import { sectionTabAt, sectionTabsFor } from "@/config/nav";

const on = () => true;
const off = () => false;
const manager = { role: "manager", serverMode: true, flag: on } as const;

describe("section tabs", () => {
  it("Dashboard and Profile each get a strip when both pages exist", () => {
    expect(sectionTabAt("/dashboard", manager)).toEqual({ section: "dashboard", tab: "ledger" });
    expect(sectionTabAt("/dashboard/kpis", manager)).toEqual({ section: "dashboard", tab: "kpis" });
    expect(sectionTabAt("/profile", manager)).toEqual({ section: "profile", tab: "profile" });
    expect(sectionTabAt("/reports", manager)).toEqual({ section: "profile", tab: "reports" });
  });

  it("the offline demo has no KPI or reports page, so one tab means no strip", () => {
    const demo = { ...manager, serverMode: false };
    expect(sectionTabsFor("dashboard", demo).map((t) => t.key)).toEqual(["ledger"]);
    expect(sectionTabAt("/dashboard", demo)).toBeNull();
    expect(sectionTabAt("/profile", demo)).toBeNull();
  });

  it("KPIs are for managers only", () => {
    expect(sectionTabsFor("dashboard", { role: "leader", serverMode: true }).map((t) => t.key)).toEqual(["ledger"]);
  });

  it("Projects keeps its tabs while the flag is on, and other pages have no strip", () => {
    expect(sectionTabAt("/projects", manager)).toEqual({ section: "projects", tab: "overview" });
    expect(sectionTabAt("/projects", { ...manager, flag: off })).toBeNull();
    expect(sectionTabAt("/feed", manager)).toBeNull();
    expect(sectionTabAt("/projects/P-4", manager)).toBeNull();
  });
});

describe("ProgressBar", () => {
  it("says its value in words and draws only the parts that exist", () => {
    const out = html(h(ProgressBar, { done: 2, doing: 1, blocked: 1, label: "2 of 4 steps done" }));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-label="2 of 4 steps done"');
    expect(out).toContain('aria-valuenow="2"');
    expect(out).toContain('aria-valuemax="4"');
    expect(out).toContain('data-part="blocked"');
    expect(out).not.toContain('data-part="open"');
  });
});
