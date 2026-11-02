import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { LOCAL_SEED } from "@/features/demo";
import { bindDemoIds, localDemoSeed, userByLabel, type DemoUser } from "@/features/demo/identity";
import { SEED } from "@/features/demo/seed";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";

const ID_KEYS = new Set([
  "fromUserId", "assigneeRoleHolderId", "actorUserId", "toRoleHolderId", "invitedUserIds", "leadUserId",
  "userId", "toUserId", "memberUserIds", "authorUserIds", "ownerUserId",
]);
const stripIds = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(stripIds);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !ID_KEYS.has(k)).map(([k, v]) => [k, stripIds(v)]));
  return x;
};

describe("IDN demo content on ids", () => {
  it("bindDemoIds fills ids and leaves every label as it was", () => {
    const seats: SeatRow[] = [
      { id: "s1", roleId: "r1", label: "T. Vogel", userId: null, sort: 0 },
      { id: "s2", roleId: "r2", label: "H. Sander", userId: null, sort: 1 },
    ];
    const users: DemoUser[] = [
      { id: "u1", name: "T. Vogel", handle: null },
      { id: "u2", name: "J. Schmidt", handle: "Anonymous #4471" },
    ];
    const bound = bindDemoIds(SEED, seats, users);
    expect(stripIds(bound)).toEqual(stripIds(SEED));
    expect(bound.cases.some((c) => c.fromUserId === "u2")).toBe(true);
    expect(bound.cases.some((c) => c.assigneeRoleHolderId === "s1")).toBe(true);
  });

  it("userByLabel gives null when two users share the label", () => {
    const users: DemoUser[] = [{ id: "a", name: "Sam", handle: null }, { id: "b", name: "Sam", handle: null }];
    expect(userByLabel(users, "Sam")).toBeNull();
    expect(userByLabel(users, "Nobody")).toBeNull();
    expect(userByLabel([users[0]], " Sam ")).toBe("a");
  });

  it("the local seed gives every route an owner seat and every persona a user", () => {
    expect(LOCAL_SEED.routes.length).toBeGreaterThan(0);
    for (const r of LOCAL_SEED.routes) expect(r.ownerSeatId ?? null).not.toBeNull();
    for (const p of LOCAL_SEED.personas) expect(p.who.userId ?? null).not.toBeNull();
  });

  it("the member's cases carry their user id", () => {
    const member = LOCAL_SEED.personas.find((p) => p.id === "member")!.who;
    const mine = LOCAL_SEED.cases.filter((c) => c.from === member.handle);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) expect(c.fromUserId).toBe(member.userId);
    for (const c of LOCAL_SEED.cases.filter((x) => x.from !== member.handle)) expect(c.fromUserId === null || c.fromUserId !== member.userId).toBe(true);
  });

  it("the leader persona holds the role of route r1's owner seat", () => {
    const leader = LOCAL_SEED.personas.find((p) => p.id === "leader")!.who;
    const r1 = LOCAL_SEED.routes.find((r) => r.id === "r1")!;
    const roleId = LOCAL_SEED.seats.find((s) => s.id === r1.ownerSeatId)!.roleId;
    expect(meFor(leader.userId ?? null, LOCAL_SEED.seats).roleIds).toContain(roleId);
  });

  it("is deterministic and the static demo has owner seats", () => {
    expect(localDemoSeed(SEED)).toEqual(localDemoSeed(SEED));
    for (const r of STATIC_DEMO_SEED.routes) expect(r.ownerSeatId ?? null).not.toBeNull();
  });
});
