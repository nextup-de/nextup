// Where a loop notice opens (Kevin, 16 Nov 2026): the desk of an idea still to decide goes to the idea and its decision
// bar (#958), everyone else to the case; once decided, the desk goes to the case too.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };
const people: NoticePerson[] = [
  { id: "u_raiser", name: "Raiser", email: "r@x.test" },
  { id: "u_own", name: "Owner", email: "o@x.test" },
  { id: "u_inv", name: "Invitee", email: "i@x.test" },
];
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "e" + n++, ts: 0, day: 10, type, actor, actorUserId, target: "c_a", payload });
const raise = ev("case.raised", "Raiser", "u_raiser", { kind: "idea", title: "Shorter changeover", routeId: "r2", assignee: "Owner", assigneeRoleHolderId: "s_own" });
const BASE = "https://app.test/acme";
const tell = (...events: CaseEvent[]) => {
  const last = events[events.length - 1];
  return loopNotices({ ev: last, state: reduce(SEED, { events: [raise, ...events], day: 10 }), people, baseUrl: BASE });
};
const linkOf = (out: ReturnType<typeof tell>, id: string) => out.find((x) => x.userId === id)?.link;

describe("loop notice links", () => {
  it("the desk of an undecided idea opens the idea with its decision bar, in the mail too; the raiser the case", () => {
    const asked = ev("case.asked", "Owner", "u_own", { text: "Which line?" });
    const out = tell(asked, ev("case.answered", "Raiser", "u_raiser", { text: "Line 3" }));
    expect(linkOf(out, "u_own")).toBe(`${BASE}/idea?id=c_a`);
    const mail = out.find((x) => x.userId === "u_own")?.text ?? "";
    expect(mail).toContain(`${BASE}/idea?id=c_a`);
    expect(mail).not.toContain("/cases/c_a");
  });

  it("an invitee asked for their view opens the case, where they comment", () => {
    const out = tell(ev("case.discussion", "Owner", "u_own", { invited: ["Invitee"], invitedUserIds: ["u_inv"] }));
    expect(linkOf(out, "u_inv")).toBe(`${BASE}/cases/c_a`);
  });

  it("a decided idea opens the case for everyone", () => {
    const out = tell(ev("case.decided", "Owner", "u_own", { answer: "no", reason: "Budget spent" }));
    expect(out.length).toBeGreaterThan(0);
    for (const x of out) expect(x.link).toBe(`${BASE}/cases/c_a`);
  });
});

describe("loop notice links after a withdrawal", () => {
  it("the desk of a withdrawn idea opens the case, not the decision bar", () => {
    const out = tell(ev("case.withdrawn", "Raiser", "u_raiser", { note: "Not needed" }));
    expect(linkOf(out, "u_own")).toBe(`${BASE}/cases/c_a`);
  });
});
