// REG-Z1: the acceptance of plan REG. Every shared registry is composed from five area files (case, project, agent, approval,
// overload, always in that order) and still holds what it held before REG; each composer imports all five of its area files and
// holds no area entry of its own. The guard at the end is the point of the plan (D17): a phase that writes into a composer instead
// of its area file fails here, and in review.
//
// The snapshots (tests/unit/reg/snapshot/*.json) were recorded by REG-A1, B1, C1 and E1 from fixed lists, never from a reducer run.
// Later phases (MOV, NOR, RES, ...) add entries to their area files, so each snapshot is a lower bound: every recorded entry is still
// there, and every other entry comes from an area file. No area list is asserted empty.
//
// THE ALLOWLIST BELOW IS CLOSED. A later phase never extends it: it writes into its area file, its i18n namespace and its docs file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_EVENT_TYPES, CORE_APP_EVENT_TYPES } from "@/features/cases/persist";
import * as caseEvents from "@/features/cases/events/case";
import * as projectEvents from "@/features/cases/events/project";
import * as agentEvents from "@/features/cases/events/agent";
import * as approvalEvents from "@/features/cases/events/approval";
import * as overloadEvents from "@/features/cases/events/overload";
import { DUE_KINDS } from "@/features/clock/due";
import * as caseKinds from "@/features/clock/kinds/case";
import * as projectKinds from "@/features/clock/kinds/project";
import * as agentKinds from "@/features/clock/kinds/agent";
import * as approvalKinds from "@/features/clock/kinds/approval";
import * as overloadKinds from "@/features/clock/kinds/overload";
import { DUTY_TEMPLATES } from "@/features/notify/channels";
import { FOLLOWS, LOOP_TEMPLATES } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { REMINDER_KINDS } from "@/features/notify/templates";
import * as caseAreas from "@/features/notify/areas/case";
import * as projectAreas from "@/features/notify/areas/project";
import * as agentAreas from "@/features/notify/areas/agent";
import * as approvalAreas from "@/features/notify/areas/approval";
import * as overloadAreas from "@/features/notify/areas/overload";
import { COMPANY_RULE_KEYS, MOV_SINCE_KEY } from "@/features/knowledge/rules";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import eventsSnapshot from "./snapshot/events.json";
import clockSnapshot from "./snapshot/clock.json";
import noticesSnapshot from "./snapshot/notices.json";
import rulesSnapshot from "./snapshot/rules.json";

const AREAS = ["case", "project", "agent", "approval", "overload"] as const;
type Area = (typeof AREAS)[number];
type Mod = Record<string, unknown>;

const EVENTS: Record<Area, Mod> = { case: caseEvents, project: projectEvents, agent: agentEvents, approval: approvalEvents, overload: overloadEvents };
const KINDS: Record<Area, Mod> = { case: caseKinds, project: projectKinds, agent: agentKinds, approval: approvalKinds, overload: overloadKinds };
const NOTIFY: Record<Area, Mod> = { case: caseAreas, project: projectAreas, agent: agentAreas, approval: approvalAreas, overload: overloadAreas };

/** `<AREA>_<NAME>` of every area, concatenated in area order. */
const listOf = (mods: Record<Area, Mod>, name: string): string[] =>
  AREAS.flatMap((a) => {
    const v = mods[a][`${a.toUpperCase()}_${name}`];
    expect(Array.isArray(v), `${a.toUpperCase()}_${name} is exported by the ${a} area file`).toBe(true);
    return [...(v as readonly string[])];
  });
const mapOf = (mods: Record<Area, Mod>, name: string): Record<string, string> =>
  Object.assign({}, ...AREAS.map((a) => {
    const v = mods[a][`${a.toUpperCase()}_${name}`];
    expect(v !== null && typeof v === "object", `${a.toUpperCase()}_${name} is exported by the ${a} area file`).toBe(true);
    return v as Record<string, string>;
  })) as Record<string, string>;

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

/** The snapshot is a lower bound; whatever else the registry holds comes from an area file (and so is in `fromAreas`). */
function expectCoversSnapshot(registry: string, composed: Iterable<string>, snapshot: readonly string[], fromAreas: readonly string[], core: readonly string[] = []): void {
  const have = new Set(composed);
  expect(snapshot.filter((e) => !have.has(e)), `${registry}: entries of the snapshot that are gone`).toEqual([]);
  const known = new Set([...snapshot, ...fromAreas, ...core]);
  expect([...have].filter((e) => !known.has(e)), `${registry}: entries that no area file exports`).toEqual([]);
}

describe("REG acceptance: every registry is composed from area files and nothing changed", () => {
  it("APP_EVENT_TYPES holds every recorded event type, and the area lists of the project, case, ... areas make up the rest", () => {
    const areas = listOf(EVENTS, "EVENT_TYPES");
    expectCoversSnapshot("APP_EVENT_TYPES", APP_EVENT_TYPES, eventsSnapshot.appEventTypes, areas, CORE_APP_EVENT_TYPES);
    expect([...APP_EVENT_TYPES]).toEqual([...CORE_APP_EVENT_TYPES, ...areas]);
    expect(new Set(APP_EVENT_TYPES).size, "no type twice").toBe(APP_EVENT_TYPES.length);
  });

  it("DUE_KINDS holds every recorded clock kind and is the five area lists in order", () => {
    const areas = listOf(KINDS, "DUE_KINDS");
    expectCoversSnapshot("DUE_KINDS", DUE_KINDS, clockSnapshot.dueKinds, areas);
    expect([...DUE_KINDS]).toEqual(areas);
  });

  it("LOOP_TYPES, LOOP_TEMPLATES, REMINDER_KINDS, DUTY_TEMPLATES, LOOP_MAIL_TYPES and FOLLOWS hold every recorded entry and are the five area lists in order", () => {
    const loopTypes = listOf(NOTIFY, "LOOP_TYPES");
    expectCoversSnapshot("LOOP_TYPES", LOOP_TYPES, noticesSnapshot.loopTypes, loopTypes);
    expect([...LOOP_TYPES]).toEqual([...new Set(loopTypes)]);

    const templates = listOf(NOTIFY, "LOOP_TEMPLATES");
    expectCoversSnapshot("LOOP_TEMPLATES", LOOP_TEMPLATES, noticesSnapshot.loopTemplates, templates);
    expect([...LOOP_TEMPLATES]).toEqual(templates);

    const reminders = listOf(NOTIFY, "REMINDER_KINDS");
    expectCoversSnapshot("REMINDER_KINDS", REMINDER_KINDS, noticesSnapshot.reminderKinds, reminders);
    expect([...REMINDER_KINDS]).toEqual(reminders);

    // The raised notice is the one duty that stays core (its notice is built in plan.ts).
    const duties = listOf(NOTIFY, "DUTY_TEMPLATES");
    expectCoversSnapshot("DUTY_TEMPLATES", DUTY_TEMPLATES, noticesSnapshot.dutyTemplates, duties, ["raised"]);
    expect([...DUTY_TEMPLATES]).toEqual(["raised", ...duties]);

    const mail = listOf(NOTIFY, "LOOP_MAIL_TYPES");
    expectCoversSnapshot("LOOP_MAIL_TYPES", LOOP_MAIL_TYPES, noticesSnapshot.loopMailTypes, mail);
    expect([...LOOP_MAIL_TYPES]).toEqual([...new Set(mail)]);

    const follows = mapOf(NOTIFY, "FOLLOWS");
    const recorded = noticesSnapshot.follows as Record<string, string>;
    expect(Object.entries(recorded).filter(([k, v]) => FOLLOWS[k] !== v), "FOLLOWS: recorded entries that changed or are gone").toEqual([]);
    expect(Object.keys(FOLLOWS).filter((k) => !(k in recorded) && !(k in follows)), "FOLLOWS: entries that no area file exports").toEqual([]);
    expect(FOLLOWS).toEqual(follows);
  });

  it("COMPANY_RULE_KEYS holds every recorded rule key, and MOV's release day stays outside it", () => {
    expect(rulesSnapshot.companyRuleKeys.filter((k) => !(COMPANY_RULE_KEYS as readonly string[]).includes(k))).toEqual([]);
    expect(MOV_SINCE_KEY).toBe(rulesSnapshot.movSinceKey);
    expect(sorted(COMPANY_RULE_KEYS)).not.toContain(MOV_SINCE_KEY); // saving the company rules never deletes it
  });

  it("de.ts and en.ts register the seven phase namespaces, each with its own file", () => {
    for (const lang of ["de", "en"] as const) {
      const src = read(`src/i18n/${lang}.ts`);
      for (const ns of ["projectMove", "caseNo", "caseSee", "projectResult", "projectAgent", "approvals", "overload"]) {
        expect(src, `${lang}.ts imports ${ns}`).toContain(`import { ${ns} } from "./messages/${ns}"`);
        expect(src, `${lang}.ts registers ${ns}`).toContain(`${ns}: ${ns}.${lang},`);
      }
    }
  });
});

// ── the guard ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const read = (path: string): string => readFileSync(path, "utf8");

/** Each composer of D17 and the paths of the area files it imports. */
const COMPOSERS: { file: string; imports: string[] }[] = [
  { file: "src/features/cases/events.ts", imports: AREAS.map((a) => `./events/${a}`) },
  { file: "src/features/cases/persist.ts", imports: AREAS.map((a) => `./events/${a}`) },
  { file: "src/features/clock/due.ts", imports: AREAS.map((a) => `./kinds/${a}`) },
  { file: "src/server/scheduler/clock.ts", imports: AREAS.map((a) => `./writers/${a}`) },
  { file: "src/features/notify/plan.ts", imports: AREAS.map((a) => `./areas/${a}`) },
  { file: "src/features/notify/digest.ts", imports: AREAS.map((a) => `./areas/${a}`) },
  { file: "src/features/notify/templates.ts", imports: AREAS.map((a) => `./areas/${a}`) },
  { file: "src/features/notify/channels.ts", imports: AREAS.map((a) => `./areas/${a}`) },
  { file: "src/server/loop-notice.ts", imports: AREAS.map((a) => `@/features/notify/areas/${a}`) },
  { file: "src/features/loop/notice.ts", imports: AREAS.map((a) => `./notice/${a}`) },
  { file: "src/components/dashboard/DemoProvider.tsx", imports: ["./demo/case-acts", "./demo/project-acts"] },
  { file: "src/server/actions/events.ts", imports: AREAS.map((a) => `./append/${a}`) },
];

/** The source without its comments, so a sentence in a comment is not a literal. Strings are walked, so `"http://x"` keeps its slashes. */
function withoutComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += next ?? ""; i++; } else if (c === quote) quote = null;
    } else if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
    } else {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
    }
  }
  return out;
}

/** A string literal that names an area entry: an event type, a `reminder.<kind>` or a `loop.<type>` template. */
const AREA_ENTRY = /["'`]((?:case|project|agent|approval|overload|reminder|loop)\.[a-z.]+)["'`]/g;

/**
 * What the composers hold today, file -> literal -> why it is not an entry of an area's list. CLOSED: a later phase never extends this
 * list; it writes into its area file. A literal here is a rule about an event (a flag, a branch, a guard), not a list of what an area has.
 */
const ALLOWED: Record<string, Record<string, string>> = {
  "src/features/cases/persist.ts": {
    "case.discussion": "DISCUSSION_EVENT_TYPES: the events behind the discussion flag, a flag rule and no area list",
    "case.invited": "DISCUSSION_EVENT_TYPES: behind the discussion flag",
    "case.revised": "DISCUSSION_EVENT_TYPES: behind the discussion flag",
    "case.checkin": "DISCUSSION_EVENT_TYPES: behind the discussion flag",
    "case.decided": "needsProjectsFlag: a yes that names a project is behind the projects flag",
  },
  "src/features/notify/plan.ts": {
    "case.raised": "planNotices: the raised notice is core (D10), built here",
    "case.handed": "planNotices: the clock's deadline hand-over notice to the raiser, a branch of the core planner",
    "loop.case.handed": "planNotices: the template of that notice, as the profile's switches name it",
  },
  "src/features/loop/notice.ts": {
    "case.raised": "the raiser of a case is found by its raised event (shared by every area's builders)",
    "case.discussion": "the people invited to a discussion, read for the case's notice context",
    "case.invited": "the people invited to a discussion, read for the case's notice context",
  },
  "src/server/actions/events.ts": {
    "case.raised": "the raise path: draft check, handle, proposal; the action's own flow, not a list",
    "case.decided": "a yes also tells Jira (kickJira); the action's own flow, not a list",
  },
};

describe("REG acceptance: the composers are closed", () => {
  for (const { file, imports } of COMPOSERS) {
    it(`${file} imports every area file of its registry`, () => {
      const src = read(file);
      for (const path of imports) expect(src, `${file} must import "${path}"`).toMatch(new RegExp(`from "${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    });

    it(`${file} holds no area entry outside the closed allowlist`, () => {
      const found = [...new Set([...withoutComments(read(file)).matchAll(AREA_ENTRY)].map((m) => m[1]))];
      const allowed = ALLOWED[file] ?? {};
      expect(found.filter((lit) => !(lit in allowed)), `${file}: a literal that names an area entry belongs in its area file`).toEqual([]);
    });
  }
});
