// Long lists in the console: find a row, and show one page of them. Pure, so a list of 2000 people
// behaves the way the unit tests say. Search ignores case and accents and takes the words in any order.
import { hits, normalizeSearch, tokens } from "@/features/search";
import { lockedOut } from "./nav";
import type { CompanyRow, PersonRow } from "./rows";

/** True when every word of `query` is somewhere in `text`. An empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  const words = tokens(query);
  return words.length === 0 || hits(normalizeSearch(text), words);
}

export type ListPage<Row> = { rows: Row[]; page: number; pages: number; from: number; to: number; total: number };

/** One page of `rows`. A page past the end (the list shrank) answers the last page there is. */
export function pageOf<Row>(rows: readonly Row[], page: number, size: number): ListPage<Row> {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = current * size;
  const end = Math.min(total, start + size);
  return { rows: rows.slice(start, end), page: current, pages, from: total ? start + 1 : 0, to: end, total };
}

/** What the people dropdown searches: a person's name, email and role. */
export function searchPeople(people: readonly PersonRow[], query: string): PersonRow[] {
  return people.filter((p) => matchesSearch(`${p.name} ${p.email} ${p.role}`, query));
}

export type PersonAction = "code" | "grant" | "revoke" | "reset";

/** Who of the selected people each action reaches. Console access and the second factor are for active people only. */
export function actionTargets(selected: readonly PersonRow[]): Record<PersonAction, PersonRow[]> {
  const active = selected.filter((p) => p.active);
  return {
    code: [...selected],
    grant: active.filter((p) => !p.isStackAdmin),
    revoke: active.filter((p) => p.isStackAdmin),
    reset: active.filter((p) => p.hasTotp),
  };
}

/** The two groups an admin comes here for: who cannot sign in, and who can open the console. */
export function peopleGroups(company: Pick<CompanyRow, "persons" | "entraTenantId">): { locked: PersonRow[]; admins: PersonRow[] } {
  return { locked: lockedOut(company), admins: company.persons.filter((p) => p.active && p.isStackAdmin) };
}

/** At most `limit` names, and how many were left out. */
export function someNames(names: readonly string[], limit: number): { names: string[]; more: number } {
  return { names: names.slice(0, limit), more: Math.max(0, names.length - limit) };
}
