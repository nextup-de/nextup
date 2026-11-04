// FX7, PILOT_CHECK D4 and D10: where people decide it is German, a mail names a real date, and who owns a case
// is decided by seat, never by a name.
import { describe, expect, it } from "vitest";
import type { Me, SeatRow } from "@/features/auth/identity";
import { emptyLog, type CaseEvent, type EventPayload } from "@/features/cases/events";
import { composeNoticeMail, type RaisedNotice } from "@/features/cases/notice";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS, SEED } from "@/features/demo/seed";
import { briefFor, briefForCase } from "@/features/ideas/brief";
import { planNotices, type PlanCtx } from "@/features/notify/plan";
import { renderTemplate } from "@/features/notify/templates";
import { createT } from "@/i18n";

const de = createT("de");
const ctx = { people: SEED.people, depts: SEED.depts, ideas: SEED.ideas };
const NOBODY_HERE: Me = { userId: "u-someone", seatIds: [], roleIds: [] };
const facts = { promiseDays: SEED.promiseDays, viewer: NOBODY_HERE, affected: [], attachments: 0, updates: 0, passTo: "M. Roth", history: "" };
const c1 = () => {
  const c = reduce(SEED, emptyLog()).cases.find((x) => x.id === "c1");
  if (!c) throw new Error("no case c1");
  return c;
};

describe("the decision card in German", () => {
  it("has German buttons on a case", () => {
    const b = briefForCase(c1(), { ...ctx, t: de }, facts);
    expect(b.actions.map((a) => a.label)).toEqual(["Ja, machen", "Nein, mit Begründung", "Weitergeben an M. Roth", "Frage stellen"]);
  });

  it("has German buttons on an idea", () => {
    const b = briefFor(SEED.ideas[0], { ...ctx, t: de });
    expect(b.actions.map((a) => a.label)).toEqual(["Freigeben", "Als Pilot starten", "Mehr Infos", "An Fachperson geben", "Ablehnen"]);
  });

  it("has no English in what the card says about the case", () => {
    const b = briefForCase(c1(), { ...ctx, t: de }, facts);
    const said = [b.recText, b.next, b.by, b.pattern, ...b.scores.flatMap((s) => [s.label, s.note]), ...b.routing.map((r) => r.why), b.feed.sentiment, ...b.questions].join(" | ");
    expect(said).not.toMatch(/\b(the|and|days?|says?|Nobody|Worth|Value|Fit|Detail|Urgency|Support|words|Pass|Within|Now)\b/);
  });

  it("stays as it was in English, and without a language", () => {
    const b = briefForCase(c1(), ctx, facts);
    expect(b.actions[0].label).toBe("Yes, do it");
    expect(b.scores.map((s) => s.label)).toEqual(["Value", "Fit", "Detail", "Urgency", "Support"]);
  });
});

describe("whose case it is", () => {
  const owned = () => {
    const c = c1();
    return { ...c, route: c.route && { ...c.route, ownerSeatId: "s-owner", ownerRoleId: "r-owner" } };
  };

  it("goes by the seat", () => {
    const viewer: Me = { userId: "u1", seatIds: ["s-owner"], roleIds: ["r-owner"] };
    expect(briefForCase(owned(), ctx, { ...facts, viewer }).rec).not.toBe("hand");
  });

  it("is not mine for sharing the owner's name", () => {
    const c = owned();
    const person = { ...SEED.people[0], name: c.route?.owner.name ?? "" };
    const b = briefForCase(c, { ...ctx, people: [person] }, { ...facts, viewer: { userId: "u2", seatIds: ["s-other"], roleIds: [] } });
    expect(b.rec).toBe("hand");
  });
});

describe("dates in mails", () => {
  const notice = (dueDate?: string): RaisedNotice => ({
    eventId: "e1", slug: "acme", day: 2,
    case: { id: "c", title: "Printer", body: "", from: "Pat", routeId: null, dueDay: 12, dueDate },
    route: { id: null, label: null, ownerName: "Owner", ownerEmail: "o@x.test", deputyName: null },
    links: { inbox: "https://x.test/leader", case: "https://x.test/cases/c" },
  });

  it("names the date on a raise", () => {
    const text = composeNoticeMail(notice("2026-11-20"), "de")?.text ?? "";
    expect(text).toContain("Antworte bis 20. Nov. 2026");
    expect(text).not.toContain("Tag 12");
  });

  it("falls back to the day number where a company has no calendar", () => {
    expect(composeNoticeMail(notice(), "de")?.text).toContain("Antworte bis Tag 12");
    expect(composeNoticeMail(notice(), "en")?.text).toContain("Answer by day 12");
  });

  it("names the date on a reminder", () => {
    const r = renderTemplate("reminder.deadline", "de", { name: "Pat", title: "Printer", day: 12, dueDate: "2026-11-20", link: "https://x.test" });
    expect(r.text).toContain("20. Nov. 2026");
    expect(r.text).not.toContain("Tag 12");
    expect(renderTemplate("reminder.start", "de", { title: "Printer", day: 12, dueDate: "2026-11-20", link: "https://x.test" }).text).toContain("20. Nov. 2026");
  });

  it("gets the date from the company's calendar when notices are planned", () => {
    const seats: SeatRow[] = [{ id: "s1", roleId: "role_owner", label: "Owner", userId: "u1", sort: 0 }];
    const routes = LOCAL_SEED.routes.map((r) => (r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s1" } : r));
    const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };
    const event = (type: CaseEvent["type"], payload: EventPayload, id: string): CaseEvent => ({ id, ts: 0, day: 0, type, actor: "Pat", actorUserId: "u2", target: "c_a", payload });
    const raise = event("case.raised", { kind: "problem", title: "Printer", routeId: "r2", assignee: "Owner", assigneeRoleHolderId: "s1" }, "e1");
    const planCtx: PlanCtx = {
      companyId: "co", state: reduce(seed, { events: [raise], day: 1 }),
      people: [{ id: "u1", email: "o@x.test", locale: "de", name: "Owner" }], prefs: [],
      company: { stage: "pilot", notifications: true, n8n: true }, subscriptions: [], baseUrl: "https://x.test",
      dateOfDay: () => "2026-11-20",
    };
    const [row] = planNotices(raise, planCtx);
    expect(row.text).toContain("20. Nov. 2026");
  });
});
