// The bulk generator is pure and repeatable (VIS-Z1): same input, same rows, as many as asked for.
import { expect, test } from "@playwright/test";
import { buildBulk } from "./bulk-events";

const people = [{ userId: "u1", name: "A" }, { userId: "u2", name: "B" }, { userId: "u3", name: "C" }];
const seats = [{ id: "s1", userId: "u1" }, { id: "s2", userId: null }];
const opts = { cases: 40, eventsPerCase: 10, now: new Date("2026-11-02T10:00:00Z") };

test("buildBulk gives cases x eventsPerCase rows, the same ones every time", () => {
  const a = buildBulk("co", people, seats, 400, opts);
  const b = buildBulk("co", people, seats, 400, opts);
  expect(a).toHaveLength(400);
  expect(b).toEqual(a);
  expect(new Set(a.map((r) => r.id)).size).toBe(400);
  expect(a.every((r) => r.day <= 400 && r.day >= 400 - 260)).toBe(true);
});
