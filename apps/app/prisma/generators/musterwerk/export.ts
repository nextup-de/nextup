// Musterwerk's people as a file for another directory (TST, the Entra test tenant): the same people the
// generator writes, built without a database. ops/tst/entra-users.ts reads this file.
//
//   const crew = musterwerkCrew({ slug: "mw", people: 150, seed: 1, emailDomain: "nextuptest.example" })
//   writePeopleExport(file, crew.people.users, "nextuptest.example")
import { writeFileSync } from "node:fs";
import type { Knowledge } from "../../../src/features/knowledge";
import { musterwerkPeople, type PeopleResult, type UserRow } from "./people";
import { makeRng, type Rng } from "./rng";
import { musterwerkStructure } from "./structure";

export const DEFAULT_EMAIL_DOMAIN = "musterwerk.test";

/** A DNS name in lower case: what stands after the @ of every generated address. */
export function checkEmailDomain(domain: string): string {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error(`email domain "${domain}" must be a host name in lower case, e.g. nextuptest.onmicrosoft.com`);
  }
  return domain;
}

/** The structure and the people of one seed. `rng` has been drawn from for both: fork it for anything after. */
export function musterwerkCrew(opts: { slug: string; people: number; seed: number | string; emailDomain?: string }): {
  rng: Rng;
  knowledge: Knowledge;
  people: PeopleResult;
} {
  const emailDomain = checkEmailDomain(opts.emailDomain ?? DEFAULT_EMAIL_DOMAIN);
  const rng = makeRng(opts.seed);
  const knowledge = musterwerkStructure(rng, opts.people, opts.slug);
  const people = musterwerkPeople(rng, knowledge, opts.people, opts.slug, emailDomain);
  return { rng, knowledge, people };
}

export type ExportPerson = {
  name: string;
  /** The sign-in name (userPrincipalName) and the address NextUp knows the person by. */
  email: string;
  /** The unit KEY, not its name: names repeat across the sites, and the directory sync matches either. */
  department: string;
  jobTitle: string;
  managerEmail: string | null;
  enabled: boolean;
};
export type PeopleExport = { emailDomain: string; people: ExportPerson[] };

/** In `users` order: a manager stands before the people who report to them. */
export function peopleExport(users: readonly UserRow[], emailDomain: string): PeopleExport {
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  return {
    emailDomain,
    people: users.map((u) => ({
      name: u.name,
      email: u.email,
      department: u.dept,
      jobTitle: u.line,
      managerEmail: u.managerId ? (emailOf.get(u.managerId) ?? null) : null,
      enabled: true,
    })),
  };
}

export function writePeopleExport(file: string, users: readonly UserRow[], emailDomain: string): void {
  writeFileSync(file, JSON.stringify(peopleExport(users, emailDomain), null, 2) + "\n");
}
