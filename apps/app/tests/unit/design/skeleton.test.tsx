// DESIGN_RULES.md, section 9: a page's skeleton is as quiet as the page: no page title, no strip of numbers, and the
// shape of the view the address names.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageSkeleton, skeletonKindFor, skeletonKindForPathname } from "@/components/dashboard/shared/PageSkeleton";
import { I18nProvider } from "@/i18n/client";

const at = vi.hoisted(() => ({ path: "/acme/projects" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));

const render = (kind: Parameters<typeof PageSkeleton>[0]["kind"]) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(PageSkeleton, { kind }) }));
/** How many elements carry the module class `part` (vitest names it `_part_<hash>`). */
const classes = (html: string, part: string) => (html.match(new RegExp(`[" ]_${part}_[0-9a-f]+`, "g")) ?? []).length;

describe("DESIGN page skeleton", () => {
  beforeEach(() => { at.path = "/acme/projects"; });

  it("names the view an address shows", () => {
    expect(skeletonKindFor("/inbox")).toBe("inbox");
    expect(skeletonKindFor("/dashboard")).toBe("overview");
    expect(skeletonKindFor("/dashboard/kpis")).toBe("overview");
    expect(skeletonKindFor("/idea")).toBe("detail");
    expect(skeletonKindFor("/cases/c1")).toBe("detail");
    expect(skeletonKindFor("/feed")).toBe("dashboard");
    expect(skeletonKindFor("/projects")).toBe("list");
    // With the company in the address, and without it (subdomain mode).
    expect(skeletonKindForPathname("/acme/inbox")).toBe("inbox");
    expect(skeletonKindForPathname("/inbox")).toBe("inbox");
    expect(skeletonKindForPathname("/acme/idea")).toBe("detail");
  });

  it("the inbox is cards of rows: no page title and no strip of numbers above them", () => {
    const html = render("inbox");
    expect(classes(html, "card")).toBe(2);
    expect(classes(html, "stat")).toBe(0);
    expect(classes(html, "headText")).toBe(0);
  });

  it("the Dashboard is its tiles and the lines that open, whichever shape the view asked for", () => {
    at.path = "/acme/dashboard";
    for (const kind of ["overview", "dashboard", "list"] as const) {
      const html = render(kind);
      expect(classes(html, "tile"), kind).toBe(5);
      expect(classes(html, "line"), kind).toBe(2);
    }
  });

  it("an idea's page is the idea and, beside it, the viewer's move", () => {
    at.path = "/acme/idea";
    const html = render("dashboard");
    expect(classes(html, "split")).toBe(1);
    expect(classes(html, "pair")).toBe(1);
  });

  it("says it is loading, for a screen reader", () => {
    expect(render("list")).toContain('role="status"');
    expect(render("list")).toContain("Loading");
  });
});
