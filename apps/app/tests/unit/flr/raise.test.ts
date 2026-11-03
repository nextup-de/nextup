import { describe, expect, it } from "vitest";
import { signFloorCookie, verifyFloorCookie } from "@/features/floor/cookies";
import { checkRaise, floorRaisePayload, groupReference, newReference, pickSeat } from "@/features/floor/raise";

const seat = (id: string, userId: string | null, sort: number) => ({ id, label: `Seat ${id}`, userId, sort });

describe("FLR raise", () => {
  it("pickSeat chooses the first holder with an active user, else the first holder, else vacant", () => {
    const holders = [seat("c", "u3", 2), seat("a", "u1", 0), seat("b", null, 1)];
    expect(pickSeat(holders, ["u3"])?.id).toBe("c");
    expect(pickSeat(holders, ["u1", "u3"])?.id).toBe("a");
    expect(pickSeat(holders, [])?.id).toBe("a");
    expect(pickSeat([], ["u1"])).toBeNull();
  });

  it("floorRaisePayload builds the case.raised payload of D7", () => {
    expect(floorRaisePayload({ title: "Leak", body: "", kind: "problem", seat: { id: "s1", label: "Seat 1" }, unitName: "Montage" })).toEqual({
      title: "Leak", body: "", kind: "problem", routeId: null, assignee: "Seat 1", assigneeRoleHolderId: "s1", fromDept: "Montage", visibility: "everyone",
    });
  });

  it("newReference gives eight digits", () => {
    for (let i = 0; i < 200; i++) expect(newReference()).toMatch(/^\d{8}$/);
    expect(groupReference("00481730")).toBe("0048 1730");
  });

  it("checkRaise bounds the title, the body and the kind", () => {
    expect(checkRaise({ kind: "idea", title: "  Hi  ", body: " x " })).toEqual({ ok: true, value: { kind: "idea", title: "Hi", body: "x" } });
    expect(checkRaise({ kind: "other", title: "Hi" })).toEqual({ ok: false, field: "kind" });
    expect(checkRaise({ kind: "problem", title: "   " })).toEqual({ ok: false, field: "title" });
    expect(checkRaise({ kind: "problem", title: "x".repeat(121) })).toEqual({ ok: false, field: "title" });
    expect(checkRaise({ kind: "problem", title: "x".repeat(120), body: "y".repeat(2001) })).toEqual({ ok: false, field: "body" });
  });

  it("the floor cookies verify only with the right secret and before their expiry", () => {
    const raw = signFloorCookie({ uid: "u1", exp: 1000 }, "secret-a");
    expect(verifyFloorCookie(raw, "secret-a", 999)).toMatchObject({ uid: "u1" });
    expect(verifyFloorCookie(raw, "secret-b", 999)).toBeNull();
    expect(verifyFloorCookie(raw, "secret-a", 1000)).toBeNull();
    expect(verifyFloorCookie(raw + "x", "secret-a", 999)).toBeNull();
    expect(verifyFloorCookie(undefined, "secret-a", 999)).toBeNull();
    expect(verifyFloorCookie("garbage", "secret-a", 999)).toBeNull();
  });
});
