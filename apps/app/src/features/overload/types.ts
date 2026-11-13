// The shapes of overload and absence (plan OVL, D16, D18, D19): who is away, which desk carries too much, and what a desk's work is. Types only; the
// logic is in reduce.ts, away.ts, load.ts and pinned.ts. Roles, not people (D3): a desk is a role; a span names its person by user id and carries no reason;
// a desk load names no user and no name.

/** One absence of a person (D15, D16): working-day numbers, ended early by person.back. `setBy` is the user id of whoever set it. */
export type AwaySpan = { awayId: string; userId: string; from: number; to: number; setBy: string | null; endedDay: number | null };

/** One time a desk reached the up level (D16): since which day, at which level, the seat that was appointed to cover it, and the day it cleared. */
export type DeskEpisode = { roleId: string; since: number; level: 20 | 30; coverSeatId: string | null; clearedDay: number | null };

/** What the six OVL events reduce into. */
export type OverloadState = { away: AwaySpan[]; desks: DeskEpisode[] };

/** One open piece of work on a desk (D18): a case to decide, the current step of an approval, a result to confirm. `key` makes it count once. */
export type WorkItem = { key: string; roleId: string; late: boolean };

/** How loaded a desk is (D18): normal, triage (from `triage` items per holder or enough late ones), up, overflow. */
export type DeskLevel = "normal" | "triage" | "up" | "overflow";

/** One desk's load, per role (D18): counts only, never a user id or a name. */
export type DeskLoad = { roleId: string; open: number; late: number; pinned: number; holders: number; perHolder: number; level: DeskLevel };
