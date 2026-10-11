// Which requests meet the proxy (src/proxy.ts): every page, static files never. A person's page has
// a dot in its path (/acme/people/T.%20Vogel) and must not be mistaken for a file - skipped, it
// would get no login check and, on a company subdomain, no rewrite.
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

const meetsProxy = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

describe("proxy matcher", () => {
  it("runs on pages, a dotted name included", () => {
    for (const path of ["/", "/acme", "/acme/dashboard", "/acme/people/T.%20Vogel", "/people/B.%20Hartmann", "/admin", "/admin/login"]) {
      expect(meetsProxy(path), path).toBe(true);
    }
  });

  it("skips static files, Next's own assets and the API", () => {
    for (const path of ["/brand/logo.png", "/icon.png", "/apple-icon.png", "/favicon.ico", "/feed/sample-reporting-screen.webp", "/_next/static/chunks/main.js", "/_next/image", "/api/health"]) {
      expect(meetsProxy(path), path).toBe(false);
    }
  });
});
