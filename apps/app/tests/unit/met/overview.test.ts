import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import type { ClockSpec } from "@/features/clock";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import * as overviewModule from "@/features/metrics/overview";
import { deskLabel, openSince, pageOf } from "@/features/overview/rows";

const roles = [{ id: "r-eng", title: "Engineering lead" }, { id: "r-ops", title: "Operations lead" }, { id: "r-vac", title: "Quality lead" }];
const seat = (id: string, roleId: string, userId: string | null, label: string, sort: number): SeatRow => ({ id, roleId, label, userId, sort });
const seats: SeatRow[] = [
  seat("s1", "r-eng", "u1", "Mara Keller", 1),
  seat("s2", "r-ops", "u2", "Jonas Weber", 2), seat("s3", "r-ops", "u3", "Ines Roth", 3),
  seat("s4", "r-eng", "u4", "Tom Vogel", 4), seat("s5", "r-eng", "u5", "Lena Berg", 5),
  seat("s6", "r-vac", null, "", 6),
];
const kase = (over: Partial<ReducedCase>) => ({ assigneeRoleId: null, escalated: null, raisedDay: 0, dueDay: 0, overdue: false, ...over }) as ReducedCase;

describe("MET overview on real events", () => {
  it("names the role first and at most two holders, then +n", () => {
    const ops = deskLabel(kase({ assigneeRoleId: "r-ops" }), seats, roles);
    expect(ops).toEqual({ role: "Operations lead", names: ["Jonas Weber", "Ines Roth"], more: 0, escalation: null });
    const eng = deskLabel(kase({ assigneeRoleId: "r-eng" }), seats, roles);
    expect(eng).toEqual({ role: "Engineering lead", names: ["Mara Keller", "Tom Vogel"], more: 1, escalation: null });
    const one = deskLabel(kase({ assigneeRoleId: "r-ops" }), seats.filter((x) => x.id !== "s3"), roles);
    expect(one.names).toEqual(["Jonas Weber"]);
    expect(one.more).toBe(0);
  });

  it("shows a vacant role alone", () => {
    expect(deskLabel(kase({ assigneeRoleId: "r-vac" }), seats, roles)).toEqual({ role: "Quality lead", names: [], more: 0, escalation: null });
  });

  it("puts the escalation role on its own line", () => {
    const esc = { to: "x", from: "y", day: 3, live: true, toSeatId: "s2", toRoleId: "r-ops" };
    const label = deskLabel(kase({ assigneeRoleId: "r-eng", escalated: esc }), seats, roles);
    expect(label.role).toBe("Engineering lead");
    expect(label.escalation).toBe("Operations lead");
  });

  it("has no role for a case without a seat", () => {
    expect(deskLabel(kase({}), seats, roles)).toEqual({ role: null, names: [], more: 0, escalation: null });
  });

  it("gives the date and working days in workdays mode, and no date in the demo", () => {
    const clock: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
    const c = kase({ raisedDay: 400, dueDay: 405, overdue: true });
    const since = openSince(c, 409, clock);
    expect(since).toEqual({ date: dateOfWorkday(400, DEFAULT_CALENDAR), days: 9, pastPromise: 4 });
    expect(openSince(kase({ raisedDay: 400, dueDay: 405 }), 403, clock)).toMatchObject({ days: 3, pastPromise: 0 });
    expect(openSince(c, 409, { mode: "demo" })).toEqual({ date: null, days: 9, pastPromise: 4 });
  });

  it("pages 120 rows as 50, 50 and 20", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect([1, 2, 3].map((p) => pageOf(rows, p).length)).toEqual([50, 50, 20]);
    expect(pageOf(rows, 2)[0]).toBe(50);
    expect(pageOf(rows, 4)).toEqual([]);
  });

  it("has dropped the stand-ins", { timeout: 60_000 }, () => {
    const src = path.join(__dirname, "../../../src");
    expect(fs.existsSync(path.join(src, "components/dashboard/team/overviewPreview.ts"))).toBe(false);
    expect(fs.existsSync(path.join(src, "components/dashboard/manager/OverviewView.tsx"))).toBe(false);
    expect("desks" in overviewModule).toBe(false);
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /from\s+["'][^"']*overviewPreview["']/.test(fs.readFileSync(p, "utf8"))) importers.push(p);
      }
    };
    walk(src);
    expect(importers).toEqual([]);
  });
});
