// What the parts of Musterwerk's working day share (plan.ts, approval.ts, draft.ts): the people, the seeded random numbers and the
// writer of one event. Pure.
import type { CaseEventType, EventPayload } from "@/features/cases/events";

export type LifePerson = { id: string; name: string; dept: string; role: string };
/** Who an event is written as: a person, or the settle operation (`system:approvals`, no user id). */
export type LifeActor = { id: string | null; name: string };

/** The settle operation's name: the only writer of the decision that ends a parallel approval (server/actions/approvals.ts). */
export const SETTLE: LifeActor = { id: null, name: "system:approvals" };

export type Rng = { next(): number; int(min: number, max: number): number; pick<T>(xs: readonly T[]): T; chance(p: number): boolean };
export function rngOf(label: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p };
}

/** Writes one event of the day; `key` is unique for the day (it becomes the idemKey life:<date>:<key>). */
export type At = (key: string, type: CaseEventType, by: LifeActor, targetId: string, payload?: EventPayload) => void;

/** What every part of the day reads: who is who, whose desks and projects are theirs, and a random source per label. */
export type DayCtx = {
  today: number;
  people: readonly LifePerson[];
  personById: ReadonlyMap<string, LifePerson>;
  /** People who acted in the app themselves: nothing is written as them. */
  humans: ReadonlySet<string>;
  /** The demo accounts: nothing is written as them either; they get things to click. */
  focus: ReadonlySet<string>;
  /** A seeded random source for this day and label: a new draw each day. */
  rng: (label: string) => Rng;
  /** A seeded random source for the label alone, the same every day: what is drawn once (how long an approver takes, whether a run is sent back). */
  stable: (label: string) => Rng;
  at: At;
};

/** A colleague the simulation may write as: known, never a real person, never a demo account. */
export const simulated = (ctx: Pick<DayCtx, "personById" | "humans" | "focus">, userId: string | null | undefined): LifePerson | null => {
  const p = userId ? ctx.personById.get(userId) ?? null : null;
  return p && !ctx.humans.has(p.id) && !ctx.focus.has(p.id) ? p : null;
};
