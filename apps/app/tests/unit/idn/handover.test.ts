// IDN-S1: a hand-over names a seat. The picker offers seats, the event carries the seat id (and its label as `to`),
// and the search marks a case as your move for anyone who holds the owner's role.
import { describe, expect, it } from "vitest";
import { meFor, type Me } from "@/features/auth/identity";
import { handPayload } from "@/features/cases/hand";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { handCandidates } from "@/components/shell/InputSheet";
import { navbarIndex } from "@/features/search/navbar";
import type { DemoContext } from "@/components/dashboard/DemoProvider";
import { demoData } from "@/features/metrics";
import { createT } from "@/i18n";

const seats = LOCAL_SEED.seats;
const t = createT("en");
const deptName = (id: string) => LOCAL_SEED.depts.find((d) => d.id === id)?.name ?? id;
const r1 = LOCAL_SEED.routes.find((r) => r.id === "r1")!;
const leader: Me = meFor(seats.find((s) => s.id === r1.ownerSeatId)!.userId, seats);

describe("IDN hand-over by seat", () => {
  it("the picker offers seats: the deputy with the deputy sub-line, never the leader's own", () => {
    const cands = handCandidates(r1, LOCAL_SEED.routes, seats, leader, t, deptName);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      const seat = seats.find((s) => s.id === c.id);
      expect(seat, "the id is a seat").toBeDefined();
      expect(c.label).toBe(seat!.label);
      expect(leader.seatIds, "never the leader's own seat").not.toContain(c.id);
    }
    expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length);
    const deputy = cands.find((c) => c.id === r1.deputySeatId);
    expect(deputy, "the deputy's seat").toBeDefined();
    expect(deputy!.sub).toBe(t("shell.handDeputyYours"));
  });

  it("a hand-over sends the seat id and the seat's label as `to`", () => {
    const p = handPayload(seats, r1.deputySeatId!, "You know the line better");
    expect(p.toRoleHolderId).toBe(r1.deputySeatId);
    expect(p.to).toBe(seats.find((s) => s.id === r1.deputySeatId)!.label);
    expect(p.why).toBe("You know the line better");
  });

  it("the navbar marks a case as your move for a second holder of the owner role", () => {
    const S = reduce(LOCAL_SEED, { day: 0, events: [] });
    const role = seats.find((s) => s.id === r1.ownerSeatId)!.roleId;
    const second = { id: "seat_second", roleId: role, label: "A. Second", userId: "u_second", sort: 999 };
    const seatsPlus = [...seats, second];
    const me = meFor("u_second", seatsPlus);
    const persona = LOCAL_SEED.personas.find((p) => p.id === "leader")!;
    const seed = { ...LOCAL_SEED, seats: seatsPlus };
    const ctx = {
      seed, S, D: demoData(seed, S, true), persona: { role: persona, who: persona.who }, actorUserId: "u_second", me, role: "leader",
      f: () => "today", href: (p: string) => "/acme" + p, tenant: {}, log: { events: [], day: 0 }, flag: () => true,
    } as unknown as DemoContext;
    const onOwnersDesk = S.cases.filter((c) => c.open && c.assigneeRoleId === role).map((c) => c.id);
    expect(onOwnersDesk.length).toBeGreaterThan(0);
    const moves = navbarIndex(ctx).filter((h) => h.case?.yourMove && h.go?.view === "dashboard").map((h) => h.go!.id);
    for (const id of onOwnersDesk) expect(moves, id).toContain(id);
  });
});
