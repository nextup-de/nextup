// A sample company for the pilot bootstrap (PIL D13): the four structure CSV files for N people, deterministic from
// the seed. Names and the PRNG are the TST generator's (read only). 3 sites with teams below, a lead for every site
// and team, exactly one person with app_role manager, and one team of fewer than 5 people (for the small-team rule).
import { writeCsv } from "../../../src/features/api/csv";
import { COLUMNS, type FileKind } from "../../../src/features/api/structure-csv";
import { ascii, nameAt, namePermutation } from "../musterwerk/names";
import { makeRng } from "../musterwerk/rng";

export const SAMPLE_MIN_PEOPLE = 12;
export const SAMPLE_MAX_PEOPLE = 2000;
export type SampleFiles = Record<FileKind, string>;

const SITES = [{ key: "NORD", name: "Standort Nord" }, { key: "SUED", name: "Standort Süd" }, { key: "WEST", name: "Standort West" }] as const;
const TEAM_NAMES = ["Montage", "Qualität", "Logistik", "Instandhaltung", "Einkauf", "Service", "Planung", "Versand"] as const;
const SMALL_TEAM = 3;

const ROUTES = [
  ["defect", "defekt;ausfall;machine;broken"],
  ["quality", "qualität;ausschuss;quality"],
  ["safety", "sicherheit;unfall;safety"],
  ["material", "material;lager;lieferung"],
  ["people", "urlaub;schicht;personal"],
] as const;

type Person = { name: string; email: string; role: "manager" | "leader" | "member"; dept: string; seat: { unit: string; title: string } | null };

export function pilotSample(opts: { people: number; seed: number | string }): SampleFiles {
  const { people } = opts;
  if (!Number.isInteger(people) || people < SAMPLE_MIN_PEOPLE || people > SAMPLE_MAX_PEOPLE) {
    throw new Error(`people must be a whole number from ${SAMPLE_MIN_PEOPLE} to ${SAMPLE_MAX_PEOPLE}`);
  }
  const rng = makeRng(opts.seed);
  const order = namePermutation(rng);
  const teamCount = Math.max(3, Math.round(people / 12));

  // Teams in round-robin over the sites; the last one is the small team.
  const teams = Array.from({ length: teamCount }, (_, i) => {
    const site = SITES[i % SITES.length];
    const base = TEAM_NAMES[Math.floor(i / SITES.length) % TEAM_NAMES.length];
    const n = Math.floor(i / SITES.length) + 1;
    return { key: `${site.key}_T${n}`, name: `${base} ${site.name.replace("Standort ", "")}`, site, headcount: 0 };
  });
  const rest = people - SMALL_TEAM - SITES.length; // site heads are people too; they sit in their site, not a team
  const big = teams.length - 1;
  teams.forEach((t, i) => { t.headcount = i === big ? SMALL_TEAM : Math.floor(rest / big) + (i < rest % big ? 1 : 0); });

  const crew: Person[] = [];
  const add = (role: Person["role"], dept: string, seat: Person["seat"]) => {
    const { first, last } = nameAt(order, crew.length);
    crew.push({ name: `${first} ${last}`, email: `${ascii(first)}.${ascii(last)}${crew.length}@pilot.example`, role, dept, seat });
  };
  SITES.forEach((s, i) => add(i === 0 ? "manager" : "leader", s.key, { unit: s.key, title: `Leitung ${s.name}` }));
  for (const t of teams) {
    add("leader", t.key, { unit: t.key, title: `Teamleitung ${t.name}` });
    for (let k = 1; k < t.headcount; k++) add("member", t.key, null);
  }

  const units = [
    ...SITES.map((s) => [s.key, s.name, "dept", "", "1"]),
    ...teams.map((t) => [t.key, t.name, "team", t.site.key, String(t.headcount)]),
  ];
  const roles = [
    ...SITES.map((s) => [s.key, `Leitung ${s.name}`, "", "", "1", "", ""]),
    ...teams.map((t) => [t.key, `Teamleitung ${t.name}`, t.site.key, `Leitung ${t.site.name}`, "1", "", ""]),
  ];
  const members = crew.map((p) => [p.name, p.email, p.dept, p.role, "de", p.seat?.unit ?? "", p.seat?.title ?? ""]);
  const routes = ROUTES.map(([key, words], i) => {
    const t = teams[i % teams.length];
    return [key, words, t.key, `Teamleitung ${t.name}`];
  });
  return {
    units: writeCsv(COLUMNS.units, units),
    roles: writeCsv(COLUMNS.roles, roles),
    members: writeCsv(COLUMNS.members, members),
    routes: writeCsv(COLUMNS.routes, routes),
  };
}
