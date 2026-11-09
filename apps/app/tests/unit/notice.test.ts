// The email a route owner gets when a case is raised. buildRaisedNotice and composeNoticeMail are
// pure, so this needs no server and no mail relay.
import { describe, expect, it } from "vitest";
import { bodyBelowTitle, buildRaisedNotice, composeNoticeMail, NOTICE_ACTOR, noticeKey, readableComment } from "@/features/cases/notice";
import { commentsOn } from "@/features/cases/selectors";
import type { EventLog } from "@/features/cases/events";
import { createT } from "@/i18n";
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

  it("says the title, each detail and the case link once (the raise page repeats the title as the first paragraph)", () => {
    const m = composeNoticeMail(notice({ body: "line 3 stops.\n\nSensor on belt 3 broken\nsince 6 am\n\nSensor on belt 3 broken\nsince 6 am" }));
    const count = (s: string) => m!.text.split(s).length - 1;
    expect(count("Line 3 stops")).toBe(1);
    expect(count("line 3 stops")).toBe(0);
    expect(count("Sensor on belt 3 broken")).toBe(1);
    expect(count("http://acme.localhost/cases/c_1")).toBe(1);
    // every line of the body is quoted the same way
    expect(m!.text).toContain("  Sensor on belt 3 broken\n  since 6 am");
  });
});

describe("bodyBelowTitle", () => {
  it("keeps a first paragraph that says more than the title", () => {
    expect(bodyBelowTitle("Line 3 stops every night\n\nmore", "Line 3 stops")).toBe("Line 3 stops every night\n\nmore");
    expect(bodyBelowTitle("Line 3 stops!\n\nmore", "Line 3 stops")).toBe("more");
    expect(bodyBelowTitle("", "Line 3 stops")).toBe("");
  });
});

describe("noticeKey", () => {
  it("is the key the old n8n workflow wrote back with, so its notes still pair with their raise", () => {
    expect(noticeKey("e_1")).toBe("notify:e_1");
  });
});

describe("the raise notice's note on the case (TMS-L2)", () => {
  // As the channels write it: the text in the owner's language, which always said "by email".
  const note = (id: string, channel?: "mail" | "teams") => ({ id, ts: 0, day: 1, type: "case.commented" as const, actor: NOTICE_ACTOR, actorUserId: null, target: "c1",
    payload: { text: "Routenverantwortliche Person per E-Mail benachrichtigt.", ...(channel ? { channel } : {}) } });
  const log = { day: 1, events: [note("e1", "teams"), note("e2", "mail"), note("e3"),
    { id: "e4", ts: 0, day: 1, type: "case.commented" as const, actor: "M. Roth", actorUserId: "u4", target: "c1", payload: { text: "Can do Friday." } }] } as EventLog;

  it("names the channel that carried it, in the reader's language, from NextUp", () => {
    const en = commentsOn(log, "c1").map((m) => readableComment(m, createT("en")));
    expect(en.map((m) => [m.by, m.text])).toEqual([
      ["NextUp", "Route owner notified in Teams."],
      ["NextUp", "Route owner notified by email."],
      ["NextUp", "Route owner notified by email."], // a note from before the channel was stored: those were mail
      ["M. Roth", "Can do Friday."], // a person's comment is shown as written
    ]);
    const de = commentsOn(log, "c1").map((m) => readableComment(m, createT("de")));
    expect(de[0].text).toBe("Routenverantwortliche Person in Teams benachrichtigt.");
    expect(de[3].text).toBe("Can do Friday.");
  });
});
