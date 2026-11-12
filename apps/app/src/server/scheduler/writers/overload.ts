// The overload area of the scheduler's writes (REG/D6; plan OVL, D15, D26): what the clock writes for absence and overload. A hand-over for an absence or an
// overflow is a case.handed with the reason, by the clock; a desk that carries too much and one that is eased are the desk's own events, with the role
// as target. Pure: no database import. A hand-over to a seat that is gone is skipped, as the case area's is.
import type { Due } from "@/features/clock/due";
import { deskLoads } from "@/features/overload/load";
import type { WriterCtx, WriterResult } from "./shared";

export const writeOverloadDue: (d: Due, ctx: WriterCtx) => WriterResult = (d, ctx) => {
  if (d.kind === "away" || d.kind === "overflow") {
    const seat = ctx.state.seats.find((s) => s.id === d.toRoleHolderId);
    if (!seat) return { skip: true }; // the seat is gone
    return { type: "case.handed", payload: { to: seat.label, toRoleHolderId: seat.id, why: d.kind } };
  }
  if (d.kind === "overloaded") {
    // The load numbers of the snapshot the Due was computed from: how many open items, for how many present holders.
    const load = deskLoads(ctx.state, ctx.today).find((l) => l.roleId === d.target);
    return { type: "desk.overloaded", payload: { roleId: d.target, level: d.check === 30 ? 30 : 20, perHolder: load?.perHolder ?? 0, holders: load?.holders ?? 0 } };
  }
  if (d.kind === "cleared") return { type: "desk.cleared", payload: { roleId: d.target } };
  return null;
};

export const beforeOverloadRun: (companyId: string, day: number) => Promise<void> = async () => {};
