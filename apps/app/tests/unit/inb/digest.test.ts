// Plan INB, INB-F1: the digest lists what the inbox lists for the person, in the inbox's order.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems } from "@/features/inbox";
import { digestFor, digestKey } from "@/features/notify/digest";
import { CONFIRM_DAYS } from "@/features/projects/confirm";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const BASE = "https://app.test/acme";
const OPTS = { flags: { projects: true, discussion: true } };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_mgr", roleId: "role_mgr", label: "M. Chef", userId: "u_mgr", sort: 2 },
  { id: "seat_lb", roleId: "role_member", label: "L. Brandt", userId: "u_lb", sort: 3 },
  { id: "seat_x", roleId: "role_other", label: "X. Other", userId: "u_x", sort: 4 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const seed = (): ReduceSeed => ({ cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS });

let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, day = 0, by: string | null = "u_lb"): CaseEvent =>
  ({ id: "d" + n++, ts: 0, type, actor: by === null ? "system:clock" : by === "u_lb" ? "L. Brandt" : by, actorUserId: by, target, payload, day });
const raised = (id: string, more: EventPayload = {}, day = 0) => ev("case.raised", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel", ...more }, day);

const TYPED = 31;
const events = [
  raised("c_desk"),
  raised("c_ask"), ev("case.asked", "c_ask", { text: "Which line?" }, 1, "u_tv"),
  raised("c_disc"), ev("case.discussion", "c_disc", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "cost" }, 1, "u_tv"),
  raised("c_p"),
  ev("case.decided", "c_p", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" }, 0, "u_tv"),
  ev("project.baseline", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" }),
  ev("project.started", "p_one"), ev("project.done", "p_one", {}, 1),
  ev("project.measured", "p_one", { check: 30, value: 30 }, TYPED),
];
const stateAt = (day: number) => reduce(seed(), { events, day });
const digest = (userId: string, day: number, locale: "en" | "de" = "en") => digestFor(userId, stateAt(day), seats, locale, BASE, OPTS);
const inbox = (userId: string, day: number) =>
  inboxItems({ state: stateAt(day), me: meFor(userId, seats), seats, today: day, demo: false, flags: OPTS.flags });
const itemIds = (d: NonNullable<ReturnType<typeof digest>>) => (d.data as { itemIds: string[] }).itemIds;

describe("INB digest", () => {
  it("lists a desk holder's cases in the inbox's order with the same item ids, and links each into the inbox", () => {
    const d = digest("u_tv", 2)!;
    expect(itemIds(d)).toEqual(inbox("u_tv", 2).map((i) => i.id));
    expect(d.text).toContain("Case c_desk");
    expect(d.text).toContain(`${BASE}/inbox?id=c_desk`);
    expect(d.link).toBe(`${BASE}/inbox`);
    expect(d.text).toContain(`Open your inbox: ${BASE}/inbox`);
    expect(d.text).not.toContain("/leader");
    expect(d.template).toBe("digest");
    expect(d.key).toBe(digestKey("u_tv", 2));
    expect((d.data as { workday: number }).workday).toBe(2);
  });

  it("lists the question asked of a member and the confirm for a lead", () => {
    const member = digest("u_lb", 2)!;
    expect(itemIds(member)).toContain("question:c_ask");
    expect(member.text).toContain(`${BASE}/cases/c_ask`);
    const lead = digest("u_hs", TYPED)!;
    expect(itemIds(lead)).toContain("confirm:p_one");
    expect(lead.text).toContain(`${BASE}/projects/p_one`);
  });

  it("puts late items first and says so, then due tomorrow, then the rest; due today and no due day get no flag", () => {
    const early = inbox("u_tv", 2).find((i) => i.id === "case:c_desk")!;
    expect(early.dueDay).not.toBeNull();
    const dueDay = early.dueDay!;
    const title = (day: number) => digest("u_tv", day)!.text.split("\n").filter((l) => l.includes("Case c_desk"));
    expect(title(dueDay + 1)).toEqual(["  Case c_desk - late"]);
    expect(title(dueDay - 1)).toEqual(["  Case c_desk - due tomorrow"]);
    expect(title(dueDay)).toEqual(["  Case c_desk"]);
    expect(itemIds(digest("u_tv", dueDay)!)).toEqual(inbox("u_tv", dueDay).map((i) => i.id));
    const noDue = digest("u_hs", TYPED)!.text.split("\n").filter((l) => l.includes("Shorter changeover") || l.includes("Case c_p"));
    expect(noDue.every((l) => !l.includes(" - "))).toBe(true);
  });

  it("lists a late item before one raised earlier that is not late yet, as the inbox does", () => {
    const first = raised("c_later", {}, 6);
    const evs = [first, raised("c_old", {}, 0)];
    const dueOld = reduce(seed(), { events: evs, day: 2 }).cases.find((c) => c.id === "c_old")!.dueDay;
    const state = reduce(seed(), { events: evs, day: dueOld + 1 });
    const d = digestFor("u_tv", state, seats, "en", BASE, OPTS)!;
    expect(itemIds(d)).toEqual(["case:c_old", "case:c_later"]);
    expect(d.text.indexOf("Case c_old - late")).toBeGreaterThan(-1);
    expect(d.text.indexOf("Case c_old")).toBeLessThan(d.text.indexOf("Case c_later"));
  });

  it("gives a case the desk asked about one closing line, not a line of its own", () => {
    const d = digest("u_tv", 2)!;
    expect(itemIds(d)).toContain("case:c_ask");
    expect(d.text).not.toContain(`${BASE}/inbox?id=c_ask`);
    expect(d.text).toContain("Waiting for an answer to your question: Case c_ask");
    expect(d.text.indexOf("Waiting for an answer")).toBeGreaterThan(d.text.indexOf("Case c_desk"));
    expect(d.text.indexOf("Waiting for an answer")).toBeLessThan(d.text.indexOf("Open your inbox"));
  });

  it("returns null when the inbox is empty", () => {
    expect(digest("u_x", 2)).toBeNull();
    expect(digestFor("u_nobody", stateAt(2), seats, "en", BASE, OPTS)).toBeNull();
    expect(inbox("u_x", 2)).toEqual([]);
  });

  it("reads the company's flags: without the discussion step an invitee has no view line", () => {
    expect(itemIds(digest("u_hs", 2)!)).toContain("view:c_disc");
    const off = digestFor("u_hs", stateAt(2), seats, "en", BASE, { flags: { projects: true, discussion: false } });
    expect(off === null ? [] : itemIds(off)).not.toContain("view:c_disc");
  });

  it("speaks German and has the three new keys in both languages", () => {
    const d = digest("u_tv", 2, "de")!;
    expect(d.locale).toBe("de");
    expect(d.text).toContain("Wartet auf eine Antwort auf Ihre Frage: Case c_ask");
    expect(d.text).toContain(`Posteingang öffnen: ${BASE}/inbox`);
    for (const k of ["digestLate", "digestDueTomorrow", "digestPaused"] as const) {
      expect(en.mail[k]).toBeTruthy();
      expect(de.mail[k]).toBeTruthy();
    }
    expect(CONFIRM_DAYS).toBeGreaterThan(0);
  });
});
