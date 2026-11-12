// OVL-G1 (B2): a log written before OVL reduces to the same State as before, apart from the new empty `overload` (plan OVL, decision D6). The log is the
// fixed pre-REG list of one EventRow of every type the app may append (tests/unit/reg/events-replay.ts), reduced with a fixed seed: no appendEvent, no
// Date.now. The golden in ./snapshot/replay.json was written from the reducer at the base commit, before any OVL change.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { logFromRows } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import { REPLAY_ROWS } from "../reg/events-replay";

const SEATS: SeatRow[] = [
  { id: "s_vogel", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head" },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_vogel", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
export const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES };
export const DAY = 14;

it("OVL replay writes the golden of a pre-OVL log", async () => {
  const state = reduce(SEED, logFromRows(REPLAY_ROWS, DAY));
  await expect(JSON.stringify(state, null, 2)).toMatchFileSnapshot("./snapshot/replay.json");
});
