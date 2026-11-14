import type { DemoContext } from "@/components/dashboard/DemoProvider";
import { peopleOf } from "../../parts";

/** Seats and available company users are joined by id, never by their label. */
export function panelPeople(ctx: Pick<DemoContext, "seed" | "tenant">) {
  const people = new Map(peopleOf(ctx.seed.seats).map((p) => [p.userId, p]));
  for (const user of ctx.tenant.users ?? []) {
    if (user.id) people.set(user.id, { userId: user.id, name: user.name });
  }
  return [...people.values()];
}
