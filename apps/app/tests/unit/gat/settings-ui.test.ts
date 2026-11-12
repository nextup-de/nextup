// GAT-S1: the three settings screens render the configuration they are handed (plan GAT, D12, D16, D27). Static markup of the client components
// with the server actions mocked: the fields carry the names the pure form parser reads, the demo copy cannot save, and the review switch
// turns the triage and fallback selects into 'Review role'.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/settings/approvals", () => ({ saveApprovalsAction: vi.fn(), saveRoutingReviewAction: vi.fn(), saveFallbackRoleAction: vi.fn() }));
vi.mock("@/server/actions/settings/org", () => ({ moveRouteAction: vi.fn(), removeRouteAction: vi.fn(), saveRouteAction: vi.fn() }));

import { ApprovalsSettings, type CouncilView } from "@/components/settings/ApprovalsSettings";
import { FallbackRoleForm } from "@/components/settings/FallbackRoleForm";
import { RoutingEditor } from "@/components/settings/RoutingEditor";
import { roleOptionsOf, SAMPLE_APPROVAL_CONFIG } from "@/features/approvals/settings-form";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig } from "@/features/approvals/types";
import { SAMPLE_KNOWLEDGE } from "@/features/settings/demo";
import { SETTINGS_MENU } from "@/features/settings/sections";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n";

const roles = roleOptionsOf(SAMPLE_KNOWLEDGE);
/** The opening tag that carries `name="<name>"`, so a test does not depend on the order of attributes. */
const tag = (out: string, name: string): string => out.match(new RegExp(`<(?:input|select|button)[^>]*name="${name.replace(/\./g, "\\.")}"[^>]*>`))?.[0] ?? "";
const view = (locale: Locale, node: React.ReactElement) => html(h(I18nProvider, { locale, children: node }));
const council: CouncilView = { ...SAMPLE_APPROVAL_CONFIG.councils[0], firstDate: "2027-03-02", nextDate: "2027-03-12" };
const CONFIG: ApprovalConfig = { ...SAMPLE_APPROVAL_CONFIG, review: { ...SAMPLE_APPROVAL_CONFIG.review, on: false } };
const routes = SAMPLE_KNOWLEDGE.rules.map((r) => ({ key: r.key, type: r.type }));

describe("Settings -> Approvals", () => {
  it("shows the stored review, rules and councils in the fields the parser reads", () => {
    const out = view("en", h(ApprovalsSettings, { slug: "acme", config: SAMPLE_APPROVAL_CONFIG, roles, routes, councils: [council] }));
    expect(out).toContain('name="slug" value="acme"');
    expect(tag(out, "reviewOn")).toMatch(/value="on"/);
    expect(tag(out, "reviewOn")).toMatch(/checked=""/);
    expect(out).toMatch(/name="reviewRole"[^>]*>(<option[^>]*>[^<]*<\/option>)*?<option value="r-qa" selected="">/);
    expect(tag(out, "reviewDays")).toMatch(/type="number"[^>]*value="2"|value="2"[^>]*type="number"/);
    expect(out).toContain('name="approvalDays"');
    expect(out).toContain('name="rule.0.id" value="sample-rule"');
    expect(tag(out, "rule.0.approver")).toContain("<select");
    expect(out).toMatch(/<option value="council:sample-council" selected="">Council: Investment council<\/option>/);
    expect(tag(out, "rule.0.minEur")).toContain('value="25000"');
    expect(out).toContain('name="council.0.id" value="sample-council"');
    expect(tag(out, "council.0.first")).toMatch(/type="date"/);
    expect(tag(out, "council.0.first")).toMatch(/value="2027-03-02"/);
    expect(out).toContain('name="council.0.members"');
    expect(out).toMatch(/Next meeting/);
    expect(out).toContain("Every 10 working days");
  });

  it("is a sample with saving off without a database, and in German", () => {
    const demo = view("en", h(ApprovalsSettings, { slug: "acme", config: EMPTY_APPROVAL_CONFIG, roles, routes, councils: [], demo: true }));
    expect(demo).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
    expect(demo).toContain("Sample data");
    expect(demo).not.toContain("rule.0.id");
    const de = view("de", h(ApprovalsSettings, { slug: "acme", config: SAMPLE_APPROVAL_CONFIG, roles, routes, councils: [council] }));
    expect(de).toContain("Freigaben");
    expect(de).toContain("Neue Ideen vor dem Tisch prüfen");
  });
});

describe("Settings -> Rules: the fallback role", () => {
  it("is a select of the roles while the review is off, and 'Review role' and off while it is on", () => {
    const off = view("en", h(FallbackRoleForm, { slug: "acme", roleId: "r-plant", reviewOn: false, roles }));
    expect(off).toContain('name="fallbackRole"');
    expect(off).toMatch(/<option value="r-plant" selected="">/);
    expect(off).toContain("Takes raises whose route has nobody");
    const on = view("en", h(FallbackRoleForm, { slug: "acme", roleId: "r-plant", reviewOn: true, roles }));
    expect(on).not.toContain('name="fallbackRole"');
    expect(on).toContain("Review role");
    expect(on).toMatch(/disabled=""/);
    const demo = view("en", h(FallbackRoleForm, { slug: "acme", roleId: null, reviewOn: false, roles, demo: true }));
    expect(demo).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });
});

describe("Settings -> Routing: triage role and review per route", () => {
  it("has a triage select, and a review select for each route with its stored mode", () => {
    const config: ApprovalConfig = { ...CONFIG, triageRoleId: "r-qa", review: { ...CONFIG.review, routes: { safety: "never", quality: "always" } } };
    const out = view("en", h(RoutingEditor, { slug: "acme", knowledge: SAMPLE_KNOWLEDGE, approvals: config }));
    expect(out).toContain('name="triageRole"');
    expect(out).toMatch(/<option value="r-qa" selected="">/);
    expect(out).toContain("Takes raises no route fits");
    for (const r of SAMPLE_KNOWLEDGE.rules) expect(out).toContain(`name="review.${r.key}"`);
    expect(out).toMatch(/name="review\.safety"[^>]*>(<option[^>]*>[^<]*<\/option>)*?<option value="never" selected="">/);
    expect(out).toMatch(/name="review\.quality"[^>]*>(<option[^>]*>[^<]*<\/option>)*?<option value="always" selected="">/);
    expect(out).toContain('form="routing-review-form"');
    // The review is on: the triage select is the review role and is not sent.
    const on = view("en", h(RoutingEditor, { slug: "acme", knowledge: SAMPLE_KNOWLEDGE, approvals: { ...config, review: { ...config.review, on: true } } }));
    expect(on).not.toContain('name="triageRole"');
    expect(on).toContain("Review role");
    // Without the config nothing of it is shown (the setup step uses the editor so).
    const bare = view("en", h(RoutingEditor, { slug: "acme", knowledge: SAMPLE_KNOWLEDGE }));
    expect(bare).not.toContain("triageRole");
    expect(bare).not.toContain('name="review.');
  });

  it("the Approvals page is in the settings menu next to Rules", () => {
    const keys = SETTINGS_MENU.map((s) => s.key);
    expect(keys.indexOf("approvals")).toBe(keys.indexOf("rules") + 1);
    expect(SETTINGS_MENU.find((s) => s.key === "approvals")).toMatchObject({ path: "approvals", label: "approvals.navApprovals" });
  });
});
