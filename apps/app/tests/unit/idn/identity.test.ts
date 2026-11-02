import { describe, expect, it } from "vitest";
import { actorLabel, holderOf, holdsRole, meFor, meOfSeat, NOBODY, seatsOfRole, usersOfRole, type SeatRow } from "@/features/auth/identity";
import { newHandle } from "@/features/auth/handle";

const seat = (id: string, roleId: string, userId: string | null, sort: number): SeatRow => ({ id, roleId, label: "L" + id, userId, sort });
const seats = [seat("s3", "r2", "u1", 2), seat("s1", "r1", "u1", 0), seat("s2", "r1", "u2", 1), seat("s4", "r1", "u2", 3), seat("s5", "r2", null, 4)];

describe("IDN identity helpers", () => {
  it("meFor gives the seat ids by sort and the role ids once", () => {
    expect(meFor("u1", seats)).toEqual({ userId: "u1", seatIds: ["s1", "s3"], roleIds: ["r1", "r2"] });
    expect(meFor("u2", seats).roleIds).toEqual(["r1"]);
  });
  it("meFor(null) is NOBODY, and so is meOfSeat of an unknown seat", () => {
    expect(meFor(null, seats)).toBe(NOBODY);
    expect(meOfSeat("nope", seats)).toBe(NOBODY);
    expect(meOfSeat("s2", seats)).toEqual({ userId: "u2", seatIds: ["s2"], roleIds: ["r1"] });
  });
  it("holderOf picks the lowest sort", () => {
    expect(holderOf(seats, "u1")?.id).toBe("s1");
    expect(holderOf(seats, "ux")).toBeNull();
  });
  it("usersOfRole skips seats without a user and duplicates", () => {
    expect(usersOfRole(seats, "r1")).toEqual(["u1", "u2"]);
    expect(usersOfRole(seats, "r2")).toEqual(["u1"]);
    expect(seatsOfRole(seats, "r1").map((s) => s.id)).toEqual(["s1", "s2", "s4"]);
  });
  it("holdsRole is false for a null role id", () => {
    expect(holdsRole(meFor("u1", seats), null)).toBe(false);
    expect(holdsRole(meFor("u1", seats), "r2")).toBe(true);
    expect(holdsRole(meFor("u2", seats), "r2")).toBe(false);
  });
  it("actorLabel gives a member's handle and a leader's name", () => {
    expect(actorLabel({ role: "member", name: "Ann", handle: "Anonymous #0042" })).toBe("Anonymous #0042");
    expect(actorLabel({ role: "leader", name: "Lea", handle: "Anonymous #0042" })).toBe("Lea");
    expect(actorLabel({ role: "member", name: "Ann", handle: null })).toBe("Ann");
  });
  it("newHandle gives an unused four-digit handle", () => {
    const h = newHandle(["Anonymous #0001"], () => 0.0001);
    expect(h).not.toBe("Anonymous #0001");
    expect(h).toMatch(/^Anonymous #\d{4}$/);
  });
});
