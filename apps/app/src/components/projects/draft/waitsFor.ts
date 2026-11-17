// The name a baseline waits for, as a draft and the Baseline panel say it (D16): "M. Roth", "M. Roth or H. Sander", or "a manager"
// when nobody else is there. Display only: who may confirm is the rights' call (features/projects/permissions).
import type { State } from "@/features/cases/reducer";
import { baselineWaitsFor } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import type { Locale, T } from "@/i18n";

export function waitsForName(p: ReducedProject, state: Pick<State, "rules" | "routes" | "seats">, t: T, locale: Locale): string {
  const names = baselineWaitsFor(p, state).map((id) => state.seats.find((s) => s.userId === id)?.label ?? "").filter(Boolean);
  if (!names.length) return t("projectDraft.aManager");
  return new Intl.ListFormat(locale, { type: "disjunction" }).format([...new Set(names)]);
}
