// /admin with no database. The point is that the demo rows are real rows - same shape, links that
// resolve - and that they never claim to be something a customer could act on.
import { afterEach, describe, expect, it } from "vitest";
import { demoCompanies, demoPilotRequests } from "@/features/admin/demo";
import { DEMO_COMPANIES } from "@/features/tenant/demo-companies";
import { dashboardUrl, landingUrl } from "@/features/tenant/urls";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("demo companies", () => {
  it("lists the tenants that actually resolve, and nothing else", () => {
    expect(demoCompanies().map((c) => c.slug)).toEqual(DEMO_COMPANIES.map((c) => c.slug));
  });

  it("counts the people the demo company really has", () => {
    const acme = demoCompanies().find((c) => c.slug === "acme");
    expect(acme?.people).toBe(DEMO_COMPANIES[0].users.length);
    expect(acme?.events).toBeGreaterThan(0);
  });

  it("links each company at its address for the mode it is running in", () => {
    process.env.TENANT_MODE = "path";
    process.env.APP_DOMAIN = "localhost:3000";
    expect(demoCompanies()[0].url).toBe("http://localhost:3000/acme");

    process.env.TENANT_MODE = "subdomain";
    process.env.APP_DOMAIN = "nextup.example";
    process.env.PUBLIC_SCHEME = "https";
    expect(demoCompanies()[0].url).toBe("https://acme.nextup.example");
  });
});

describe("demo pilot requests", () => {
  it("shows both states, newest first", () => {
    const rows = demoPilotRequests();
    expect(rows.some((r) => r.handledAt === null)).toBe(true);
    expect(rows.some((r) => r.handledAt !== null)).toBe(true);
    const dates = rows.map((r) => Date.parse(r.createdAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it("uses example.com addresses, so a stray reply reaches nobody real", () => {
    expect(demoPilotRequests().every((r) => r.email.endsWith("@example.com"))).toBe(true);
  });
});

describe("where the admin bar points", () => {
  it("stays relative in path mode and leaves the host in subdomain mode", () => {
    process.env.TENANT_MODE = "path";
    expect(landingUrl()).toBe("/");
    expect(dashboardUrl("acme")).toBe("/acme/dashboard");

    process.env.TENANT_MODE = "subdomain";
    process.env.APP_DOMAIN = "nextup.example";
    process.env.PUBLIC_SCHEME = "https";
    expect(landingUrl()).toBe("https://nextup.example");
    expect(dashboardUrl("acme")).toBe("https://acme.nextup.example/dashboard");
  });
});
