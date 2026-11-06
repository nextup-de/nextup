// Musterwerk GmbH: the demo company every TST task runs on (TST-G1, D5). Deterministic: the same
// seed gives the same rows (own PRNG; `now` is an argument, nothing reads the system clock).
//
//   const { companyId, counts } = await generateMusterwerk(getDb(), { slug: "mw", people: 150, weeks: 2, seed: 1, now })
//
// Order: company (stage sandbox, config, calendar, flags) -> people -> structure -> case history ->
// rebuildProjections -> the clock scheduler stepped day by day up to `now`.
//
// runClockOnce visits every non-demo company in the database, not just this one; the generator is
// meant for a test or local database, where that is what you want.
import { writeFileSync } from "node:fs";
import { DEFAULT_CALENDAR, type CalendarSpec } from "../../../src/features/clock";
import { templateWrites } from "../../../src/features/demo/content";
import { toSeedJson } from "../../../src/features/demo/parse";
import type { Db } from "../../../src/lib/db/client";
import { saveCalendar } from "../../../src/lib/db/calendar";
import { replaceFlagOverrides } from "../../../src/lib/db/flags";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";
import { writeStructure } from "../../../src/lib/db/structure-writes";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { musterwerkHistory, windowDays } from "./cases";
import { DEFAULT_EMAIL_DOMAIN, musterwerkCrew, writePeopleExport } from "./export";

export type GenerateOptions = {
  slug: string;
  people: number;
  weeks: number;
  seed: number | string;
  now: Date;
  /** Write "<email>\t<login code>" for every person here. Without it the plain codes are not kept anywhere. */
  codesFile?: string;
  /** Delete a company with this slug first. Without it an existing slug is refused. */
  replace?: boolean;
  /** Delete a company with this slug only when nothing real can be lost: a sandbox company with no people, or a Musterwerk of an earlier run. */
  replaceGenerated?: boolean;
  /** What stands after the @ of every address (default musterwerk.test). The people stay the same. */
  emailDomain?: string;
  /** Write the people as JSON here (export.ts), for ops/tst/entra-users.ts. */
  exportFile?: string;
  /** Switch AI routing and the assistant on for the company (default: both off). */
  aiOn?: boolean;
};

export type GenerateResult = {
  companyId: string;
  counts: { units: number; roles: number; holders: number; routes: number; users: number; cases: number; events: number; clockFacts: number };
};

/** German federal holidays plus Bavaria. Per-site calendars do not exist in the product. */
export const MUSTERWERK_CALENDAR: CalendarSpec = { ...DEFAULT_CALENDAR, region: "DE-BY" };

const MUSTERWERK_NAME = "Musterwerk GmbH";
const CHUNK_USERS = 500;
const CHUNK_EVENTS = 1000;

export async function generateMusterwerk(db: Db, opts: GenerateOptions): Promise<GenerateResult> {
  const { slug, people, weeks, now } = opts;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`slug "${slug}" must be lower-case letters, digits and hyphens`);
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error("weeks must be a whole number of at least 1");

  const existing = await db.company.findUnique({ where: { slug }, select: { id: true, name: true, stage: true } });
  if (existing && !opts.replace) {
    if (!opts.replaceGenerated) throw new Error(`company "${slug}" exists; pass --replace to delete it and generate again`);
    const people = await db.user.count({ where: { companyId: existing.id } });
    if (existing.stage !== "sandbox" || (people > 0 && existing.name !== MUSTERWERK_NAME)) {
      throw new Error(`company "${slug}" (stage ${existing.stage}, ${people} people) is not an empty sandbox or an earlier Musterwerk; refusing to delete it`);
    }
  }

  // Built before anything is written: a bad people count fails with the database untouched.
  const emailDomain = opts.emailDomain ?? DEFAULT_EMAIL_DOMAIN;
  const { rng, knowledge, people: crew } = musterwerkCrew({ slug, people, seed: opts.seed, emailDomain });
  const withUsers = { ...knowledge, holders: crew.holders };
  const history = musterwerkHistory(rng.fork("cases"), { slug, knowledge: withUsers, users: crew.users, holders: crew.holders, calendar: MUSTERWERK_CALENDAR }, weeks, now);

  if (existing) await db.company.delete({ where: { id: existing.id } });
  const company = await db.company.create({
    data: {
      slug, name: "Musterwerk GmbH", mark: "M", stage: "sandbox", openedAt: now,
      seedJson: toSeedJson(templateWrites("empty", () => crypto.randomUUID()).seedJson) as object,
      config: { create: { aiRouting: opts.aiOn === true, assistant: opts.aiOn === true } },
    },
  });
  const companyId = company.id;
  await saveCalendar(companyId, MUSTERWERK_CALENDAR, "generator");
  await replaceFlagOverrides(companyId, [
    { key: "discussion", enabled: true, updatedAt: now },
    { key: "projects", enabled: true, updatedAt: now },
  ]);

  for (let i = 0; i < crew.users.length; i += CHUNK_USERS) {
    await db.user.createMany({
      data: crew.users.slice(i, i + CHUNK_USERS).map((u) => ({ ...u, companyId, loginCodeAt: now })),
    });
  }
  await writeStructure(companyId, { knowledge: withUsers, rules: null }, "generator");

  for (let i = 0; i < history.length; i += CHUNK_EVENTS) {
    await db.caseEvent.createMany({
      data: history.slice(i, i + CHUNK_EVENTS).map((e) => ({ ...e, companyId, payload: e.payload as object, source: "app" })),
    });
  }
  const cases = await rebuildProjections(companyId, now);

  // One scheduler pass per working day, then `now` itself: the deadline facts and hand-overs fall due
  // on the day they would have.
  for (const d of windowDays(weeks, now, MUSTERWERK_CALENDAR)) {
    const noon = new Date(`${d.iso}T12:00:00Z`);
    if (noon.getTime() < now.getTime()) await runClockOnce(noon);
  }
  await runClockOnce(now);

  if (opts.codesFile) writeFileSync(opts.codesFile, crew.codes.map((c) => `${c.email}\t${c.code}`).join("\n") + "\n");
  if (opts.exportFile) writePeopleExport(opts.exportFile, crew.users, emailDomain);

  const clockFacts = await db.caseEvent.count({ where: { companyId, type: "clock.due" } });
  const events = await db.caseEvent.count({ where: { companyId } });
  return {
    companyId,
    counts: {
      units: knowledge.units.length, roles: knowledge.roles.length, holders: knowledge.holders.length, routes: knowledge.rules.length,
      users: crew.users.length, cases, events, clockFacts,
    },
  };
}
