import { describe, expect, it } from "vitest";
import { personHref } from "@/features/people/links";
import { resolvePersonParam, type PersonCandidate } from "@/features/people/resolve";
import { navbarIndex } from "@/features/search/navbar";
import { meFor } from "@/features/auth/identity";
import { LOCAL_SEED } from "@/features/demo";
import { reduce } from "@/features/cases/reducer";
import { demoData } from "@/features/metrics";
import type { DemoContext } from "@/components/dashboard/DemoProvider";

const users: PersonCandidate[] = [
  { id: "u-active", handle: null, active: true },
  { id: "u-me", handle: null, active: true },
  { id: "u-anon", handle: "Anonymous #4471", active: true },
  { id: "u-gone", handle: null, active: false },
];

describe("MET person links", () => {
  it("opens the page for an active user id", () => {
    expect(resolvePersonParam("u-active", users, "u-me")).toEqual({ kind: "page", userId: "u-active" });
  });

  it("sends the viewer's own id to /profile", () => {
    expect(resolvePersonParam("u-me", users, "u-me")).toEqual({ kind: "redirect", to: "profile" });
  });

  it("does not find a display name or a handle, and never redirects a legacy name URL", () => {
    const named = [{ id: "u1", handle: null, active: true }];
    expect(resolvePersonParam("T. Vogel", named, "u9")).toEqual({ kind: "notFound" });
    expect(resolvePersonParam("T.%20Vogel", named, null)).toEqual({ kind: "notFound" });
    expect(resolvePersonParam("Anonymous #4471", users, "u-me")).toEqual({ kind: "notFound" });
  });

  it("does not find a user with a handle, a deactivated user or an unknown id", () => {
    expect(resolvePersonParam("u-anon", users, "u-me")).toEqual({ kind: "notFound" });
    expect(resolvePersonParam("u-gone", users, "u-me")).toEqual({ kind: "notFound" });
    expect(resolvePersonParam("u-other-company", users, "u-me")).toEqual({ kind: "notFound" });
  });

  it("links by opaque id and keeps two people with the same display name apart", () => {
    const tenant = { personLinks: { a1: "Alex Meier", a2: "Alex Meier" } };
    expect(personHref(tenant, "a1")).toBe("/people/a1");
    expect(personHref(tenant, "a2")).toBe("/people/a2");
    expect(personHref(tenant, "Alex Meier")).toBeNull();
    expect(personHref(tenant, "toString")).toBeNull();
    expect(personHref({}, "a1")).toBeNull();
  });

  it("indexes people for the search by id and never puts a display name in an href", () => {
    const SEED = LOCAL_SEED;
    const role = SEED.personas.find((p) => p.id === "member")!;
    const S = reduce(SEED, { day: 0, events: [] });
    const ctx = {
      seed: SEED, S, D: demoData(SEED, S, true), persona: { role, who: role.who }, actorUserId: role.who.userId ?? null,
      me: meFor(role.who.userId ?? null, SEED.seats), role: "member", f: () => "today", href: (path: string) => "/acme" + path,
      tenant: { personLinks: { p1: "T. Vogel", p2: "T. Vogel" } },
    } as unknown as DemoContext;
    const people = navbarIndex(ctx).filter((r) => r.kind === "Person");
    expect(people.map((r) => r.href).sort()).toEqual(["/acme/people/p1", "/acme/people/p2"]);
    expect(people.some((r) => r.href.includes("Vogel"))).toBe(false);
  });
});
