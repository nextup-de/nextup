// OVL-G1 (B1): the overload area's scaffold exists and nothing behaves differently yet (plan OVL, D6, D10, D15, D17, D22, D26, D27). Fixed literals and
// registry reads only. The area lists are read through the composers, so a name in the area file but not in the registry fails here. Flat tests (D32).
import { expect, expectTypeOf, it } from "vitest";
import type { EventPayload } from "@/features/cases/events";
import { OVERLOAD_EVENT_TYPES, type OverloadAreaEventType } from "@/features/cases/events/overload";
import { APP_EVENT_TYPES, isAppEventType } from "@/features/cases/persist";
import { DUE_KINDS } from "@/features/clock/due";
import { OVERLOAD_DUE_KINDS, overloadAfterFacts, overloadDues } from "@/features/clock/kinds/overload";
import { DEFAULT_RULES, COMPANY_RULE_KEYS, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { LOOP_DEFAULTS, loopRules, OVERLOAD_AT_DEFAULT, overloadAtOf } from "@/features/loop/rules";
import { OVERLOAD_DUTY_TEMPLATES, OVERLOAD_FOLLOWS, OVERLOAD_LOOP_MAIL_TYPES, OVERLOAD_LOOP_TEMPLATES, OVERLOAD_LOOP_TYPES, OVERLOAD_REMINDER_KINDS } from "@/features/notify/areas/overload";
import { DUTY_TEMPLATES } from "@/features/notify/channels";
import { FOLLOWS, LOOP_TEMPLATES, NOTIFY_GROUPS } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";
import { FIXTURES, above, TODAY } from "../reg/clock-fixture";

const SIX: OverloadAreaEventType[] = ["person.away", "person.back", "desk.covered", "desk.overloaded", "desk.cleared", "org.seat.vacant"];

it("OVL scaffold declares the overload event, due and loop lists", () => {
  // The three events OVL's own server actions write are the area's list; the six types are the area's union (a type error here fails the typecheck).
  expect([...OVERLOAD_EVENT_TYPES]).toEqual(["person.away", "person.back", "desk.covered"]);
  expectTypeOf<OverloadAreaEventType>().toEqualTypeOf<"person.away" | "person.back" | "desk.covered" | "desk.overloaded" | "desk.cleared" | "org.seat.vacant">();
  const away: EventPayload = { userId: "u1", awayId: "ev_1", from: 3, setBy: "u2" };
  const overloaded: EventPayload = { roleId: "role_a", level: 20, perHolder: 21, holders: 2, seatId: "s1", takenBy: "u3" };
  expect([away.awayId, overloaded.level]).toEqual(["ev_1", 20]);
  // The clock: four kinds, in the composed list, and the stubs give nothing until OVL-C1.
  expect([...OVERLOAD_DUE_KINDS]).toEqual(["away", "overflow", "overloaded", "cleared"]);
  for (const k of OVERLOAD_DUE_KINDS) expect(DUE_KINDS as readonly string[], k).toContain(k);
  const state = FIXTURES[0].state;
  expect(overloadDues(state, TODAY, above)).toEqual([]);
  expect(overloadAfterFacts({ kind: "deadline" } as never)).toBe(false);
  // The notices: five loop types, four templates (org.seat.vacant is a duty template), each follows the group's older template, five mail types, no reminders.
  expect([...OVERLOAD_LOOP_TYPES]).toEqual(["person.away", "desk.overloaded", "desk.covered", "desk.cleared", "org.seat.vacant"]);
  expect([...OVERLOAD_LOOP_MAIL_TYPES]).toEqual([...OVERLOAD_LOOP_TYPES]);
  expect(OVERLOAD_LOOP_TEMPLATES).toEqual(["loop.person.away", "loop.desk.overloaded", "loop.desk.covered", "loop.desk.cleared"]);
  expect(OVERLOAD_FOLLOWS).toEqual(Object.fromEntries(OVERLOAD_LOOP_TEMPLATES.map((t) => [t, "loop.case.decided"])));
  expect([...OVERLOAD_REMINDER_KINDS]).toEqual([]);
  for (const t of OVERLOAD_LOOP_TYPES) {
    expect([...LOOP_TYPES], t).toContain(t);
    expect([...LOOP_MAIL_TYPES], t).toContain(t);
  }
  for (const [t, follows] of Object.entries(OVERLOAD_FOLLOWS)) expect(FOLLOWS[t], t).toBe(follows);
});

it("OVL scaffold marks person.away, person.back and desk.covered as app types and no other", () => {
  for (const t of ["person.away", "person.back", "desk.covered"]) {
    expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
    expect(isAppEventType(t), t).toBe(true);
  }
  for (const t of ["desk.overloaded", "desk.cleared", "org.seat.vacant"]) {
    expect(APP_EVENT_TYPES as readonly string[], t).not.toContain(t);
    expect(isAppEventType(t), t).toBe(false);
  }
  expect(SIX.filter((t) => isAppEventType(t))).toEqual(["person.away", "person.back", "desk.covered"]);
  expect(new Set(APP_EVENT_TYPES).size).toBe(APP_EVENT_TYPES.length);
});

it("OVL scaffold round-trips overload_at and ignores an out-of-range value", () => {
  const at = { triage: 8, up: 15, overflow: 25, late: 2 };
  const rules = rulesFromRows([{ key: "overload_at", value: at }]);
  expect(rules.overloadAt).toEqual(at);
  expect(rowsFromRules(rules).find((r) => r.key === "overload_at")).toEqual({ key: "overload_at", value: at });
  expect(rulesFromRows(rowsFromRules(rules)).overloadAt).toEqual(at);
  // Only written once it was set.
  expect(rowsFromRules(DEFAULT_RULES).some((r) => r.key === "overload_at")).toBe(false);
  expect(COMPANY_RULE_KEYS as readonly string[]).toContain("overload_at");
  // Out of range, in the wrong order, not whole or missing a field: no rule, the default stands.
  const bad: unknown[] = [
    { triage: 0, up: 15, overflow: 25, late: 2 }, { triage: 8, up: 8, overflow: 25, late: 2 }, { triage: 8, up: 15, overflow: 15, late: 2 }, { triage: 8, up: 15, overflow: 201, late: 2 },
    { triage: 8, up: 15, overflow: 25, late: 0 }, { triage: 8, up: 15, overflow: 25, late: 51 }, { triage: 8.5, up: 15, overflow: 25, late: 2 }, { triage: 8, up: 15, overflow: 25 },
    { triage: "8", up: 15, overflow: 25, late: 2 }, null, 7, [],
  ];
  for (const value of bad) expect(rulesFromRows([{ key: "overload_at", value }]).overloadAt, JSON.stringify(value)).toBeUndefined();
  // The edges of the range are valid.
  expect(rulesFromRows([{ key: "overload_at", value: { triage: 1, up: 2, overflow: 200, late: 50 } }]).overloadAt).toEqual({ triage: 1, up: 2, overflow: 200, late: 50 });
});

it("OVL scaffold defaults overload_at to 10, 20, 30 and 3 late", () => {
  expect(OVERLOAD_AT_DEFAULT).toEqual({ triage: 10, up: 20, overflow: 30, late: 3 });
  expect(overloadAtOf(LOOP_DEFAULTS)).toEqual({ triage: 10, up: 20, overflow: 30, late: 3 });
  expect(overloadAtOf({})).toEqual({ triage: 10, up: 20, overflow: 30, late: 3 });
  // loopRules() carries a company's thresholds and leaves the default alone without them.
  expect(overloadAtOf(loopRules({ overloadAt: { triage: 5, up: 9, overflow: 14, late: 1 } }))).toEqual({ triage: 5, up: 9, overflow: 14, late: 1 });
  expect(overloadAtOf(loopRules({}))).toEqual(OVERLOAD_AT_DEFAULT);
  expect(LOOP_DEFAULTS.overloadAt).toBeUndefined(); // optional: LoopRules literals stay valid
});

it("OVL scaffold has every overload key in English and German", () => {
  const keys = [
    "title",
    ...["title", "lede", "from", "to", "save", "end", "now", "setFor", "noReason", "errRange", "errRights", "errTarget", "othersTitle", "othersNone", "othersFilter", "takeBackTitle", "takeBackLede", "takeBack", "takeBackNone"].map((k) => `away.${k}`),
    ...["triage", "triageLate", "select", "pass", "ask", "why", "question", "done", "refused", "pinned"].map((k) => `inbox.${k}`),
    ...["title", "lede", "desk", "open", "perHolder", "late", "pinned", "state", "normal", "triage", "up", "overflow", "addHolder", "appointCover", "coverSeat", "coverSaved", "passBulk", "none"].map((k) => `load.${k}`),
    ...["awaySetSubject", "awaySetBody", "coverSubject", "coverBody", "upSubject", "upBody", "overflowSubject", "overflowBody", "coveredSubject", "coveredBody", "clearedSubject", "clearedBody", "seatVacantSubject", "seatVacantBody"].map((k) => `mail.${k}`),
    ...["wrongPath", "notAway", "nothing", "notAbove", "notOverloaded", "notOnDesk", "badDay"].map((k) => `err.${k}`),
  ];
  const holders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const english = en.overload as Record<string, string>;
  const german = de.overload as Record<string, string>;
  for (const k of keys) {
    expect(typeof english[k], `en ${k}`).toBe("string");
    expect(english[k].trim(), `en ${k}`).not.toBe("");
    expect(german[k]?.trim(), `de ${k}`).toBeTruthy();
    expect(holders(german[k]), `placeholders of ${k}`).toEqual(holders(english[k]));
  }
  // Nothing else: no key beyond the plan's, no reason and no person ranking in any text.
  expect(Object.keys(english).sort()).toEqual([...keys].sort());
  expect(Object.keys(german).sort()).toEqual([...keys].sort());
  for (const text of [...Object.values(english), ...Object.values(german)]) expect(text).not.toMatch(/\b(ranking|leaderboard|slowest|fastest)\b/i);
});

it("OVL scaffold puts the overload templates in the loop group and org.seat.vacant in the duty list", () => {
  for (const t of OVERLOAD_LOOP_TEMPLATES) {
    expect(LOOP_TEMPLATES, t).toContain(t);
    expect(NOTIFY_GROUPS.loop, t).toContain(t);
    expect(DUTY_TEMPLATES as readonly string[], t).not.toContain(t);
  }
  expect([...OVERLOAD_DUTY_TEMPLATES]).toEqual(["loop.org.seat.vacant"]);
  expect(DUTY_TEMPLATES as readonly string[]).toContain("loop.org.seat.vacant");
  expect(LOOP_TEMPLATES).not.toContain("loop.org.seat.vacant");
  // No new group: the four groups of today, each template in one of them only.
  expect(Object.keys(NOTIFY_GROUPS)).toEqual(["raised", "loop", "reminders", "digest"]);
});
