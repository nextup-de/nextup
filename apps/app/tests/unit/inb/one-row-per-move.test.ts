// A project lead's move is one inbox row: no generic "move" row next to the lead ask of a draft, or next to the weekly update
// of a running project. A move of its own ("Mark it done") stays (fix of 13 Nov).
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems, type InboxSourceInput } from "@/features/inbox";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_member", label: "L. Brandt", userId: "u_lb", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner" } : x));
const CLOCK: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: CLOCK };
const wd = (iso: string): number => workdayOf(new Date(`${iso}T12:00:00Z`), DEFAULT_CALENDAR);

const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_ci: "C. Ilg" };
let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload, day: number, by: string): CaseEvent =>
  ({ id: "o" + n++, ts: 0, type, actor: NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, by = "u_lb") => ev(type, "p_one", payload, day, by);
const raise = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
const yes = (more: EventPayload = {}) => ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover", ...more }, 0, "u_tv");
const baseline = P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 0);

const idsOf = (events: CaseEvent[], day: number, userId = "u_lb") => {
  const input: InboxSourceInput = { state: reduce(SEED, { events, day }), me: meFor(userId, seats), seats, today: day, demo: false, flags: { projects: true, discussion: true }, role: "leader" };
  return inboxItems(input).map((i) => i.id).filter((id) => id.endsWith(":p_one"));
};

describe("one inbox row per project move", () => {
  it("a lead asked to take a draft has the lead ask, and the move only after the yes", () => {
    const draft = [raise, yes({ draft: true })];
    expect(idsOf(draft, 1)).toEqual(["lead:p_one"]);
    expect(idsOf([...draft, P("project.lead.answered", { take: true }, 1)], 2)).toEqual(["move:p_one"]);
  });

  it("a running project's lead has the weekly update instead of working the board, and the board again once it is sent", () => {
    const started = wd("2026-06-17"); // a Wednesday: the check-in weekday
    const checkIn = wd("2026-06-24");
    const running = [raise, yes(), baseline, P("project.started", {}, started), P("project.step.added", { stepId: "s1", text: "Step" }, started)];
    expect(idsOf(running, checkIn - 1)).toEqual(["move:p_one"]);
    expect(idsOf(running, checkIn)).toEqual(["move:update:p_one"]);
    expect(idsOf([...running, P("project.update", { text: "On track", week: checkIn }, checkIn)], checkIn)).toEqual(["move:p_one"]);
  });

  it("keeps Mark it done next to the update: it is a move of its own", () => {
    const started = wd("2026-06-17");
    const checkIn = wd("2026-06-24");
    const allDone = [raise, yes(), baseline, P("project.started", {}, started), P("project.step.added", { stepId: "s1", text: "Step" }, started),
      P("project.step.moved", { stepId: "s1", to: "done" }, started + 1)];
    expect(idsOf(allDone, checkIn).sort()).toEqual(["move:p_one", "move:update:p_one"]);
  });
});

describe("inbox kind labels", () => {
  const KINDS = ["kindLead", "kindInvitation", "kindApproval", "kindStalled", "kindVacant", "kindUpdate", "kindAppeal", "kindHelp", "kindBaseline", "kindSuggestion"] as const;

  it("every kind has its own words, in both languages", () => {
    for (const k of KINDS) {
      expect(en.inbox[k], k).toBeTruthy();
      expect(de.inbox[k], k).toBeTruthy();
    }
    const enWords = [...KINDS, "kindCase", "kindIdea", "kindView", "kindQuestion", "kindConfirm", "kindReward", "kindMove", "kindComment"].map((k) => en.inbox[k as keyof typeof en.inbox]);
    expect(new Set(enWords).size).toBe(enWords.length);
  });
});
