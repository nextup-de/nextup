import { expect, it } from "vitest";
import { archivedSteps } from "@/features/projects/archive-view";
import type { Step } from "@/features/projects/types";

const step = (id: string, text: string, dropped: Step["dropped"], key: string | null = null) => ({ id, text, dropped, external: key ? { system: "jira", key, url: "" } : null } as unknown as Step);
const p = { steps: [
  step("a", "Old supplier list", { why: "replaced", day: 4, byUserId: "u1" }, "KAN-8"),
  step("b", "Map Tier-1 contacts", null),
  step("c", "Email-only alert", { why: "SMS instead", day: 9, byUserId: null }, "KAN-6"),
] };

it("PGB archive: only dropped steps, newest drop first, with who dropped them", () => {
  expect(archivedSteps(p).map((a) => [a.step.id, a.day, a.byUserId])).toEqual([["c", 9, null], ["a", 4, "u1"]]);
});

it("PGB archive: the search matches the text or the Jira key, case ignored", () => {
  expect(archivedSteps(p, "kan-8").map((a) => a.step.id)).toEqual(["a"]);
  expect(archivedSteps(p, "EMAIL").map((a) => a.step.id)).toEqual(["c"]);
  expect(archivedSteps(p, "Map")).toEqual([]);
});
