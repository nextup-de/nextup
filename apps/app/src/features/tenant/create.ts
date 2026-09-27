// Creating a company: the rules, as pure functions. The database write lives in
// src/server/actions/admin.ts; everything that can be decided without a database is here so it
// can be tested without one.
import type { Role } from "@/config/roles";
import { isReservedSlug, isValidSlug } from "@/features/auth/request";
import type { Seed } from "@/features/demo/types";

export type NewPerson = { name: string; email: string; role: Role; dept?: string; handle?: string };

export type NewCompany = {
  slug: string;
  name: string;
  mark?: string;
  template: "demo" | "empty";
  people: NewPerson[];
};

export type Problem = { field: string; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Everything wrong with this request, so the form can show it all at once. */
export function validateNewCompany(input: NewCompany): Problem[] {
  const problems: Problem[] = [];
  // Validated as given, not silently lowercased: the form normalises with normaliseSlug() as you
  // type, so by the time this runs a difference is a real mistake worth showing.
  const slug = input.slug.trim();

  if (!slug) {
    problems.push({ field: "slug", message: "A company needs a slug - it becomes the subdomain." });
  } else if (isReservedSlug(slug)) {
    problems.push({ field: "slug", message: `"${slug}" is reserved for the app itself.` });
  } else if (!isValidSlug(slug)) {
    problems.push({
      field: "slug",
      message: "Use 2-32 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen.",
    });
  }

  if (!input.name.trim()) problems.push({ field: "name", message: "A display name is required." });

  if (input.people.length === 0) {
    problems.push({ field: "people", message: "Add at least one person, or nobody can log in." });
  }
  if (!input.people.some((p) => p.role === "manager")) {
    problems.push({ field: "people", message: "At least one person has to be a manager - only a manager can reach settings." });
  }

  const seen = new Set<string>();
  for (const p of input.people) {
    if (!p.name.trim()) problems.push({ field: "people", message: "Every person needs a name." });
    if (!EMAIL.test(p.email)) problems.push({ field: "people", message: `"${p.email}" is not an email address.` });
    const key = p.email.trim().toLowerCase();
    if (seen.has(key)) problems.push({ field: "people", message: `${p.email} appears twice.` });
    seen.add(key);
  }

  return problems;
}

/**
 * Warnings, not errors: a person whose name does not appear anywhere in the seed will render an
 * empty inbox and no error, because derive.ts matches people to cases by NAME. Worth saying out
 * loud on the create form rather than leaving someone to wonder why their demo looks empty.
 */
export function seedNameWarnings(seed: Seed, people: NewPerson[]): string[] {
  const known = new Set<string>();
  for (const p of seed.personas) known.add(p.who.name);
  for (const r of seed.routes) known.add(r.owner.name);
  for (const p of seed.people) known.add(p.name);
  for (const b of seed.buddies) known.add(b.name);
  if (known.size === 0) return []; // an empty template has nobody to match, which is fine

  return people
    .filter((p) => !known.has(p.name.trim()))
    .map(
      (p) =>
        `${p.name} does not appear in this company's seed data, so their inbox and "my cases" will look empty. ` +
        `Names that do: ${[...known].slice(0, 4).join(", ")}…`,
    );
}

/** Initials for the avatar, matching what the demo seed uses. */
export function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

/** The one-letter mark shown in the company chip. */
export function markFor(input: Pick<NewCompany, "name" | "mark">): string {
  const given = input.mark?.trim();
  return (given || input.name.trim().charAt(0) || "?").toUpperCase().slice(0, 1);
}

export function normaliseSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
