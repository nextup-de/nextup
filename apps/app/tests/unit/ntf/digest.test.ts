import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { digestFor, digestKey, groupOn, prefChange } from "@/features/notify/digest";

// r2's owner seat is local-16 (role local-15). A second person holds the same role.
const seats: SeatRow[] = [...LOCAL_SEED.seats, { id: "s_second", roleId: "local-15", label: "Second Owner", userId: "u_second", sort: 99 }];
const raised: CaseEvent = {
  id: "e1", ts: 0, day: 0, type: "case.raised", actor: "Raiser", actorUserId: "u_raiser", target: "c_new",
  payload: { kind: "problem", title: "Test rig is double booked", routeId: "r2", assignee: "M. Roth", assigneeRoleHolderId: "local-16" },
};
const state = reduce({ ...LOCAL_SEED, seats }, { events: [raised], day: 3 });
const BASE = "https://app.test/acme";

describe("NTF digest content", () => {
  it("a second holder of r2's owner role gets r2's open cases with title, age and link", () => {
    const d = digestFor("u_second", state, seats, "en", BASE);
    expect(d).not.toBeNull();
    expect(d!.template).toBe("digest");
    expect(d!.key).toBe(digestKey("u_second", 3));
    expect(d!.recipientUserId).toBe("u_second");
    expect(d!.subject).toBe("Your NextUp digest");
    expect(d!.text).toContain("Test rig is double booked");
    expect(d!.text).toContain(`${BASE}/cases/c_new`);
    expect(d!.text).toMatch(/waiting \d+ d/);
    for (const c of state.cases.filter((x) => x.open && x.assigneeRoleId === "local-15")) expect(d!.text).toContain(c.title);
    expect((d!.data as { caseIds: string[] }).caseIds).toContain("c_new");
  });

  it("a user without a seat, and a holder of a role with nothing open, get null", () => {
    expect(digestFor("u_nobody", state, seats, "en", BASE)).toBeNull();
    expect(digestFor("demo-u-1", reduce({ ...LOCAL_SEED, seats }, { events: [], day: 3 }), [{ id: "s", roleId: "role_x", label: "X", userId: "demo-u-1", sort: 0 }], "en", BASE)).toBeNull();
  });

  it("German locale gives German text", () => {
    const d = digestFor("u_second", state, seats, "de", BASE)!;
    expect(d.locale).toBe("de");
    expect(d.subject).toBe("Ihre NextUp-Zusammenfassung");
    expect(d.text).toContain("Das wartet auf Sie:");
    expect(d.text).toContain("wartet seit");
    expect(d.text).not.toContain("waiting");
  });

  it("the digest is off until chosen; a profile change is only ever the viewer's own", () => {
    expect(groupOn("digest", [])).toBe(false);
    expect(groupOn("raised", [])).toBe(true);
    expect(groupOn("digest", [{ template: "digest", on: true }])).toBe(true);
    expect(groupOn("reminders", [{ template: "*", on: false }])).toBe(false);
    const viewer = { userId: "u1", companySlug: "acme" };
    expect(prefChange(viewer, "acme", "digest", true)).toEqual({ ok: true, userId: "u1", template: "digest", on: true });
    expect(prefChange(viewer, "other", "digest", true).ok).toBe(false);
    expect(prefChange(null, "acme", "digest", true).ok).toBe(false);
    expect(prefChange(viewer, "acme", "webhook", true).ok).toBe(false);
  });
});
