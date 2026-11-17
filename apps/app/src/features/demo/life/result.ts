// What a result in Musterwerk's day is worth, and its second person (plan.ts runs both). The lead types the 30-day check with what it
// saves a year - euros, or working hours where the measure is a time - and a colleague who may confirm it does so on one of the next
// working days, so the Dashboard's "Saved per year" (features/metrics/impact.ts) fills from confirmed results as it would at a customer.
// Pure.
import type { State } from "@/features/cases/reducer";
import type { MeasureImpact } from "@/features/projects/measure-source";
import type { ReducedProject } from "@/features/projects/types";
import type { LifeIdea } from "./catalog";
import { confirmerOf } from "./draft";
import { simulated, type DayCtx, type Rng } from "./shared";

/** Units of a measure that is a time: its project saves working hours, which the company's hour cost prices. */
const TIME_UNITS = new Set(["h", "min"]);

/**
 * What the result saves a year, scaled by how well it worked (`share`: the measured move over the move the idea expects, about 0.6 to 1.3).
 * A time measure saves 150 to 1,200 hours, rounded to 10; any other saves 6,000 to 48,000 euros, rounded to 100.
 */
export function impactOf(idea: LifeIdea | null, share: number, r: Rng): MeasureImpact {
  const size = (0.125 + r.next() * 0.875) * Math.max(share, 0.5);
  if (idea && TIME_UNITS.has(idea.project.unit)) return { hoursPerYear: Math.max(10, Math.round((1_200 * size) / 10) * 10) };
  return { savingEurPerYear: Math.max(100, Math.round((48_000 * size) / 100) * 100) };
}

/** A working day after the result was typed a second person gets to it: half the days, for sure on the fourth. */
const due = (r: Rng, today: number, since: number): boolean => today - since >= 1 && (r.chance(0.5) || today - since >= 4);

const ASK_SAVING = "Bitte noch eintragen, was das Ergebnis pro Jahr spart (Euro oder Arbeitsstunden).";

/**
 * The day's second person for a project's results. A typed result a colleague typed is confirmed by someone who may confirm it. One typed
 * without what it saves (the generator's, and the simulation's before 17 Nov) is first sent back once with that question, and its lead
 * types it again the next working day with the same number and the yearly saving (plan RES, D14: one re-entry).
 */
export function resultDay(p: ReducedProject, idea: LifeIdea | null, state: State, ctx: DayCtx): void {
  if (p.stopped) return;
  const lead = simulated(ctx, p.leadUserId);
  for (const m of p.measures) {
    const r = ctx.rng(`${p.id}:result:${m.check}`);
    // The lead answers a send-back with the saving.
    if (m.sentBack && !m.reentered) {
      const asked = m.questions.at(-1)?.day ?? m.day;
      if (lead && ctx.today - asked >= 1) {
        ctx.at(`${p.id}:reentered${m.check}`, "project.measured", lead, p.id, {
          check: m.check, value: m.value, source: "manual", note: m.note || "Gemessen wie die Ausgangslage.", impact: impactOf(idea, 1, r), measureEventId: m.eventId ?? undefined,
        });
      }
      continue;
    }
    // A number a real person or a demo account typed waits for the people in the app.
    if (m.confirmed || m.managerOnly || m.sourceKind !== "typed" || (m.byUserId !== null && simulated(ctx, m.byUserId) === null)) continue;
    if (!due(r, ctx.today, m.day)) continue;
    const by = confirmerOf(p, state, ctx, m.byUserId);
    if (!by) continue;
    const ask = m.impact === null && !m.reentered && m.questions.length === 0 && lead !== null;
    if (ask) ctx.at(`${p.id}:questioned${m.check}`, "project.measure.questioned", by, p.id, { check: m.check, why: ASK_SAVING, measureEventId: m.eventId ?? undefined });
    else ctx.at(`${p.id}:confirmed${m.check}`, "project.measure.confirmed", by, p.id, { check: m.check, measureEventId: m.eventId ?? undefined });
  }
}
