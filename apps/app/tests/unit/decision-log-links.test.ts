// The decision log's links (report v1.4 "Links"): on a one-company stack the company is the host, not a path
// segment, so a link that carries the slug answers 404. The page hands in companyPrefix(), never the slug.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionLog, type DecisionLine } from "@/components/decisions/DecisionLog";
import { companyPrefix } from "@/features/tenant/urls";
import { createT } from "@/i18n";

const line: DecisionLine = {
  caseId: "c1", title: "Shared rig calendar", kind: "idea", dateLabel: "3 Nov", answer: "yes", reason: "", note: "",
  roleTitle: "Maintenance lead", roleFormer: false, personName: "M. Roth", project: { id: "p_c1", label: "P-1" },
};
const render = (base: string) => renderToStaticMarkup(DecisionLog({
  t: createT("en"), base, lines: [line], total: 30, page: 1, pageSize: 25,
  filters: { period: "90", answer: "", project: "", q: "" }, projectsOn: true, filtered: false,
}));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

describe("decision log links", () => {
  it("on a one-company stack: case, project and next page without the slug", () => {
    const base = companyPrefix("musterwerk", { TENANT_MODE: "single", COMPANY_SLUG: "musterwerk" });
    expect(base).toBe("");
    const links = hrefs(render(base));
    expect(links).toEqual(expect.arrayContaining(["/cases/c1", "/projects/p_c1", "/decisions?page=2"]));
    expect(links.some((h) => h.includes("musterwerk"))).toBe(false);
  });

  it("in path mode: the slug in front, as before", () => {
    const links = hrefs(render(companyPrefix("acme", { TENANT_MODE: "path" })));
    expect(links).toEqual(expect.arrayContaining(["/acme/cases/c1", "/acme/projects/p_c1", "/acme/decisions?page=2"]));
  });
});
