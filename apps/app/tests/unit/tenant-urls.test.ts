// The URL helpers every mode-dependent link goes through (src/features/tenant/urls.ts).
import { describe, expect, it } from "vitest";
import {
  adminBase,
  appHost,
  appOrigin,
  companyPrefix,
  companyUrl,
  dashboardUrl,
  landingUrl,
  rootDomain,
  servedOverHttps,
  singleCompany,
  tenantMode,
} from "@/features/tenant/urls";

const PATH = { TENANT_MODE: "path", APP_DOMAIN: "localhost:3000" };
const SUB = { TENANT_MODE: "subdomain", APP_DOMAIN: "nextup.serviweb.ch", PUBLIC_SCHEME: "https" };
const SINGLE = { TENANT_MODE: "single", COMPANY_SLUG: "acme", APP_ORIGIN: "https://nextup.bigcorp.local/" };

describe("tenantMode", () => {
  it("defaults to path and knows the other two", () => {
    expect(tenantMode({})).toBe("path");
    expect(tenantMode({ TENANT_MODE: "nonsense" })).toBe("path");
    expect(tenantMode(SUB)).toBe("subdomain");
    expect(tenantMode(SINGLE)).toBe("single");
  });
});

describe("appOrigin", () => {
  it("prefers APP_ORIGIN, without a trailing slash", () => {
    expect(appOrigin(SINGLE)).toBe("https://nextup.bigcorp.local");
    expect(appHost(SINGLE)).toBe("nextup.bigcorp.local");
    expect(servedOverHttps(SINGLE)).toBe(true);
  });

  it("falls back to PUBLIC_SCHEME + APP_DOMAIN", () => {
    expect(appOrigin(PATH)).toBe("http://localhost:3000");
    expect(appOrigin(SUB)).toBe("https://nextup.serviweb.ch");
    expect(servedOverHttps(PATH)).toBe(false);
    expect(rootDomain(SUB)).toBe("nextup.serviweb.ch");
  });
});

describe("links per mode", () => {
  it("path mode carries the slug", () => {
    expect(companyPrefix("acme", PATH)).toBe("/acme");
    expect(companyUrl("acme", PATH)).toBe("http://localhost:3000/acme");
    expect(dashboardUrl("acme", PATH)).toBe("/acme/dashboard");
    expect(adminBase(PATH)).toBe("/admin");
    expect(landingUrl(PATH)).toBe("/");
  });

  it("subdomain mode makes the company the host", () => {
    expect(companyPrefix("acme", SUB)).toBe("");
    expect(companyUrl("acme", SUB)).toBe("https://acme.nextup.serviweb.ch");
    expect(dashboardUrl("acme", SUB)).toBe("https://acme.nextup.serviweb.ch/dashboard");
    expect(adminBase(SUB)).toBe("");
    expect(landingUrl(SUB)).toBe("https://nextup.serviweb.ch");
  });

  it("single mode serves one company at the origin, admin as a path", () => {
    expect(singleCompany(SINGLE)).toBe("acme");
    expect(singleCompany(PATH)).toBeNull();
    expect(companyPrefix("acme", SINGLE)).toBe("");
    expect(companyUrl("acme", SINGLE)).toBe("https://nextup.bigcorp.local");
    expect(dashboardUrl("acme", SINGLE)).toBe("/dashboard");
    expect(adminBase(SINGLE)).toBe("/admin");
    expect(landingUrl(SINGLE)).toBe("/");
    expect(landingUrl({ ...SINGLE, LANDING_URL: "https://sellux.ch" })).toBe("https://sellux.ch");
  });
});
