// Host -> tenant resolution and the access decision: everything src/proxy.ts does, tested without
// Next. The proxy itself is a thin shell over these two functions.
import { describe, expect, it } from "vitest";
import { decide, isValidSlug, resolveRequest, isReservedSlug } from "@/features/auth/request";
import { ROLE_HOME } from "@/config/roles";

const ROOT = "nextup.serviweb.ch";
const sub = (host: string, path: string) => resolveRequest(host, path, "subdomain", ROOT);
const viaPath = (path: string) => resolveRequest(ROOT, path, "path", ROOT);

describe("subdomain mode", () => {
  it("maps a company subdomain to the [company] segment", () => {
    expect(sub("acme." + ROOT, "/leader")).toEqual({
      kind: "tenant", slug: "acme", appPath: "/leader", rewriteTo: "/acme/leader",
    });
  });

  it("handles the bare subdomain root", () => {
    expect(sub("acme." + ROOT, "/")).toEqual({
      kind: "tenant", slug: "acme", appPath: "/", rewriteTo: "/acme",
    });
  });

  it("ignores the port", () => {
    expect(sub("acme." + ROOT + ":443", "/raise").kind).toBe("tenant");
  });

  it("is case-insensitive about the host", () => {
    expect(sub("ACME." + ROOT.toUpperCase(), "/leader")).toMatchObject({ slug: "acme" });
  });

  it("treats the apex and www as not-a-tenant", () => {
    expect(sub(ROOT, "/pricing").kind).toBe("pass");
    expect(sub("www." + ROOT, "/").kind).toBe("pass");
  });

  it("routes admin to its own surface, outside [company]", () => {
    expect(sub("admin." + ROOT, "/companies")).toEqual({
      kind: "admin", appPath: "/companies", rewriteTo: "/admin/companies",
    });
  });

  it("never treats a reserved host as a company", () => {
    for (const label of ["n8n", "mail", "api", "static"]) {
      expect(sub(label + "." + ROOT, "/").kind).toBe("pass");
    }
  });

  it("ignores a host that is not under our root domain at all", () => {
    expect(sub("acme.evil.example", "/leader").kind).toBe("pass");
    expect(sub("nextup.serviweb.ch.evil.example", "/").kind).toBe("pass");
  });

  it("does not accept a deeper nested label", () => {
    expect(sub("a.b." + ROOT, "/").kind).toBe("pass");
  });
});

describe("path mode", () => {
  it("maps the first segment to the company", () => {
    expect(viaPath("/acme/leader")).toEqual({
      kind: "tenant", slug: "acme", appPath: "/leader", rewriteTo: null,
    });
  });

  it("leaves marketing and auth alone", () => {
    for (const p of ["/", "/pricing", "/login", "/contact", "/invite/abc"]) {
      expect(viaPath(p).kind).toBe("pass");
    }
  });

  it("routes /admin to the admin surface", () => {
    expect(viaPath("/admin/companies")).toEqual({
      kind: "admin", appPath: "/companies", rewriteTo: null,
    });
  });
});

describe("slug rules", () => {
  it("accepts ordinary company slugs", () => {
    for (const s of ["acme", "globex", "a1", "bosch-rexroth", "x".repeat(32)]) {
      expect(isValidSlug(s)).toBe(true);
    }
  });

  it("rejects anything that would collide or confuse", () => {
    for (const s of ["", "a", "-acme", "acme-", "Acme", "ac me", "ac.me", "x".repeat(33), "admin", "www", "api", "login"]) {
      expect(isValidSlug(s)).toBe(false);
    }
  });

  it("keeps the reserved list and the validator in agreement", () => {
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("acme")).toBe(false);
  });
});

describe("decide", () => {
  const leader = { slug: "acme", role: "leader" as const };
  const member = { slug: "acme", role: "member" as const };
  const manager = { slug: "acme", role: "manager" as const };

  it("always lets the login page through", () => {
    expect(decide("/login", null, "acme")).toEqual({ kind: "allow" });
  });

  it("sends an anonymous visitor to login", () => {
    expect(decide("/leader", null, "acme")).toEqual({ kind: "login", to: "/login" });
  });

  it("refuses a cookie issued for a DIFFERENT company", () => {
    // The isolation property: globex's cookie is worthless on acme.
    expect(decide("/leader", { slug: "globex", role: "manager" }, "acme")).toEqual({
      kind: "login", to: "/login",
    });
  });

  it("enforces ROLE_ACCESS", () => {
    expect(decide("/manager", member, "acme")).toEqual({ kind: "home", to: ROLE_HOME.member });
    expect(decide("/settings/members", leader, "acme")).toEqual({ kind: "home", to: ROLE_HOME.leader });
    expect(decide("/leader", member, "acme")).toEqual({ kind: "home", to: ROLE_HOME.member });
  });

  it("lets each role reach what it owns", () => {
    expect(decide("/manager", manager, "acme")).toEqual({ kind: "allow" });
    expect(decide("/leader", leader, "acme")).toEqual({ kind: "allow" });
    expect(decide("/leader", manager, "acme")).toEqual({ kind: "allow" }); // managers may view the inbox
    expect(decide("/raise", member, "acme")).toEqual({ kind: "allow" });
  });

  it("allows shared pages for anyone signed in", () => {
    for (const p of ["/problems", "/ideas", "/progress", "/cases/c1", "/"]) {
      expect(decide(p, member, "acme")).toEqual({ kind: "allow" });
    }
  });
});
