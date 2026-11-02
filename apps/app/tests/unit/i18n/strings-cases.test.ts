import { describe, expect, it } from "vitest";
import { composeNoticeMail, type RaisedNotice } from "@/features/cases/notice";
import { loopMails, type Person } from "@/features/loop/notice";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { catalogIssues, inlineStrings } from "./inline";

const OWNED = [
  "src/features/cases/notice.ts",
  "src/features/cases/permissions.ts",
  "src/features/cases/rows.ts",
  "src/features/cases/discussion.ts",
  "src/features/loop/notice.ts",
  "src/server/case-notice.ts",
  "src/server/loop-notice.ts",
  "src/server/actions/events.ts",
];

describe("LNG strings cases mail", () => {
  it("has no inline user-facing string in the owned source files", async () => {
    expect(await inlineStrings(OWNED)).toEqual([]);
  }, 60_000);
  it("has complete cases and mail namespaces", () => {
    expect(catalogIssues("cases")).toEqual([]);
    expect(catalogIssues("mail")).toEqual([]);
  });
});

const notice: RaisedNotice = {
  eventId: "e1",
  slug: "acme",
  day: 3,
  case: { id: "c1", title: "Broken scanner", body: "It does not read.", from: "Ops", routeId: "r1", dueDay: 6 },
  route: { id: "r1", label: "Equipment", ownerName: "A. Owner", ownerEmail: "a@x.ch", deputyName: "B. Deputy" },
  links: { inbox: "https://x/leader", case: "https://x/cases/c1" },
};

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "n" + type, ts: 0, type, actor, actorUserId: actor === "T. Vogel" ? "u_tv" : null, target, payload, day });
const people: Person[] = [
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
];
const raised = ev("case.raised", "Anonymous #4471", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" });
const discussion = ev("case.discussion", "T. Vogel", "c_m", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "The saving" });
const mailFor = (locale?: "de" | "en") => {
  const log: EventLog = { events: [raised, discussion], day: 0 };
  return loopMails({ ev: discussion, state: reduce(SEED, log), people, baseUrl: "https://acme.sellux.ch" }, locale);
};

describe("LNG mails in the recipient language", () => {
  it("composes the raise notice in German and leaves English unchanged", () => {
    expect(composeNoticeMail(notice, "en")).toEqual(composeNoticeMail(notice));
    const mail = composeNoticeMail(notice, "de");
    expect(mail?.subject).toBe(de.mail.noticeSubject.replace("{title}", notice.case.title));
    expect(mail?.text).toContain(de.mail.noticeIntro);
    expect(mail?.text).not.toContain(en.mail.noticeIntro);
    expect(mail?.subject).not.toContain("New case");
  });

  it("composes a loop mail in German and leaves English unchanged", () => {
    expect(mailFor("en")).toEqual(mailFor());
    const [german] = mailFor("de");
    expect(german.subject).toBe(de.mail.viewSubject.replace("{title}", "Shorter changeover"));
    expect(german.text).toContain("Es fehlt noch");
    expect(german.text).not.toContain("Still missing");
    expect(mailFor()[0].subject).toBe("Your view is asked: Shorter changeover");
  });

  it("picks the language per recipient", () => {
    const out = mailFor("de");
    const mixed = loopMails({ ev: discussion, state: reduce(SEED, { events: [raised, discussion], day: 0 }), people, baseUrl: "x" }, (email) => (email.startsWith("hs") ? "de" : "en"));
    expect(mixed[0].subject).toBe(out[0].subject.replace(/.*/, de.mail.viewSubject.replace("{title}", "Shorter changeover")));
  });
});
