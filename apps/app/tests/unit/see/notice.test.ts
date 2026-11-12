// SEE-J1 (B3): the raiser's mail that a discussion started names the day the decision is expected (D13); no other mail changes (D21).
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";
import { dateOfWorkday } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const people: NoticePerson[] = [
  { id: "u_au", name: "Ria Raiser", email: "au@x.test" }, { id: "u_own", name: "Owen Owner", email: "own@x.test" }, { id: "u_dep", name: "Dana Deputy", email: "dep@x.test" },
];
let n = 0;
const ev = (type: CaseEventType, by: string, payload: EventPayload = {}, day = 3): CaseEvent => ({ id: "m" + n++, ts: 0, type, actor: by, actorUserId: by, target: "c_a", payload, day });
const raised = ev("case.raised", "u_au", { kind: "idea", title: "Shorter changeover", body: "text", routeId: "r1", assignee: "Owen Owner", assigneeRoleHolderId: "s_own" }, 0);

function mails(workdays: boolean) {
  const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, ...(workdays ? { clock: { mode: "workdays" as const, calendar: DEFAULT_CALENDAR } } : {}) };
  const discussion = ev("case.discussion", "u_own", { invited: ["Dana Deputy"], invitedUserIds: ["u_dep"], missing: "The saving" }, workdays ? 20 : 3);
  const state = reduce(seed, { events: [raised, discussion], day: workdays ? 20 : 3 });
  const out = loopNotices({ ev: discussion, state, people, baseUrl: "https://app.test" }, () => "en");
  return { state, raiser: out.find((x) => x.userId === "u_au")!, invitee: out.find((x) => x.userId === "u_dep")!, lastDay: state.cases[0].discussion!.lastDay };
}

describe("SEE discussion notice", () => {
  it("tells the raiser the day the decision is expected, in the day-number form of a company without a calendar", () => {
    const { raiser, lastDay } = mails(false);
    expect(lastDay).toBeGreaterThan(0);
    expect(raiser.text).toContain(`Decision expected by day ${lastDay}`);
    // After the check-in line and before what is still missing.
    expect(raiser.text.indexOf("Decision expected by")).toBeGreaterThan(raiser.text.indexOf("check-in every"));
    expect(raiser.text.indexOf("Decision expected by")).toBeLessThan(raiser.text.indexOf("Still missing"));
  });

  it("names the date as a calendar date in a company with a calendar", () => {
    const { raiser, lastDay } = mails(true);
    const [y, m, d] = dateOfWorkday(lastDay, DEFAULT_CALENDAR).split("-");
    expect(raiser.text).toContain(`Decision expected by ${d}/${m}/${y}`);
  });

  it("changes no other mail of the discussion: the invitee's mail has no such line", () => {
    const { invitee } = mails(false);
    expect(invitee.text).not.toContain("Decision expected by");
  });
});
