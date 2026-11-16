// DESIGN_RULES.md, section 4: an area's pages sit in its side view on a laptop or monitor, hidden at the start; the strip
// of tabs is then a phone's alone.
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AreaFrame, AreaSideSlot } from "@/components/shell/AreaFrame";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { hasSideView, SECTION_TABS, SIDE_VIEW_SECTIONS, type SectionKey } from "@/config/nav";
import { I18nProvider } from "@/i18n/client";
import { read } from "./guard";

vi.mock("next/navigation", () => ({ usePathname: () => "/acme/dashboard", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ href: (p: string) => "/acme" + p, role: "manager", serverMode: true }) }));

const render = (node: React.ReactNode) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: node }));

describe("DESIGN side view", () => {
  it("every section in the list is a real section with pages, and Projects keeps its own frame", () => {
    for (const section of SIDE_VIEW_SECTIONS) expect(SECTION_TABS[section].length).toBeGreaterThan(1);
    expect(hasSideView("dashboard")).toBe(true);
    expect(hasSideView("profile")).toBe(true);
    expect(hasSideView("projects")).toBe(false); // components/projects/ProjectsFrame.tsx
  });

  it("starts hidden: the page and one button to show it, no page links and no list drawn", () => {
    const page = h(Fragment, null, h("p", null, "the page"), h(AreaSideSlot, { children: "the page's list" }));
    const out = render(h(AreaFrame, { section: "dashboard", active: "ledger", children: page }));
    expect(out).toContain('data-sb="hidden"');
    expect(out).toContain("the page");
    expect(out).toContain('aria-label="Show sidebar"');
    expect(out).not.toContain("/acme/dashboard/kpis");
    expect(out).not.toContain("the page&#x27;s list");
  });

  it("the strip of a side-view section is marked, so only a phone draws it; other strips are not", () => {
    const strip = (section: SectionKey, active: string, side: boolean) => render(h(SectionTabs, { section, active, side }));
    expect(strip("dashboard", "ledger", true)).toContain('data-side="true"');
    expect(strip("inbox", "inbox", false)).not.toContain("data-side");
    const css = read("src/components/shell/SimpleShell.module.css");
    expect(css).toMatch(/@media \(min-width: 761px\) \{\s*\.sectionTabs\[data-side="true"\] \{ display: none; \}/);
    expect(read("src/components/shell/AreaFrame.module.css")).toMatch(/@media \(max-width: 760px\) \{\s*\.side, \.show \{ display: none; \}/);
  });
});
