// The email a route owner gets when a case is raised. buildRaisedNotice and composeNoticeMail are
// pure, so this needs no server and no mail relay.
import { describe, expect, it } from "vitest";
import { buildRaisedNotice, composeNoticeMail, noticeKey } from "@/features/cases/notice";
import { LOCAL_SEED } from "@/features/demo";

const seed = LOCAL_SEED;
const route = seed.routes[0];
const ownerSeat = seed.seats.find((s) => s.id === route.ownerSeatId)!;

function notice(over: { people?: { id: string; name: string; email: string }[]; routeId?: string; body?: string } = {}) {
  return buildRaisedNotice({
    slug: "acme",
    eventId: "e_1",
    caseId: "c_1",
    payload: {
      title: "Line 3 stops",
      body: over.body ?? "every shift",
      routeId: over.routeId ?? route.id,
      fromDept: "Production",
    },
    seed,
    people: over.people ?? [{ id: ownerSeat.userId!, name: "Someone Else", email: "owner@acme.example" }],
    day: 2,
    baseUrl: "http://acme.localhost",
  });
}

describe("buildRaisedNotice", () => {
  it("resolves the route owner and their address, which is what the email needs", () => {
    const n = notice();
    expect(n.route.ownerName).toBe(route.owner.name);
    expect(n.route.ownerEmail).toBe("owner@acme.example");
    expect(n.case.dueDay).toBe(2 + seed.promiseDays);
    expect(n.links.case).toBe("http://acme.localhost/cases/c_1");
  });

  it("finds the owner by the seat's user id, never by name", () => {
    const n = notice({ people: [{ id: "other", name: ownerSeat.label, email: "wrong@acme.example" }] });
    expect(n.route.ownerEmail).toBeNull();
    expect(n.route.ownerName).toBe(ownerSeat.label);
  });

  it("has no owner email when nobody matches", () => {
    expect(notice({ routeId: "no-such-route", people: [] }).route.ownerEmail).toBeNull();
  });
});

describe("composeNoticeMail", () => {
  it("goes to the owner, names the case, and links straight to it", () => {
    const m = composeNoticeMail(notice());
    expect(m?.to).toBe("owner@acme.example");
    expect(m?.subject).toBe("New case on your desk: Line 3 stops");
    expect(m?.text).toContain(route.owner.name);
    expect(m?.text).toContain("every shift");
    expect(m?.text).toContain(`Answer by day ${2 + seed.promiseDays}`);
    expect(m?.text).toContain("http://acme.localhost/cases/c_1");
  });

  it("is null when there is nobody to write to, so nothing is sent to nowhere", () => {
    expect(composeNoticeMail(notice({ people: [] }))).toBeNull();
  });

  it("leaves out an empty body rather than printing a blank quote", () => {
    const m = composeNoticeMail(notice({ body: "" }));
    expect(m?.text).not.toMatch(/\n {2}\n/);
  });
});

describe("noticeKey", () => {
  it("is the key the old n8n workflow wrote back with, so its notes still pair with their raise", () => {
    expect(noticeKey("e_1")).toBe("notify:e_1");
  });
});
