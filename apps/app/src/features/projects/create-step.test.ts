import { it, expect } from "vitest";
import { toStepAdded, validStep, type CreateStepInput } from "./create-step";

it("STP create: maps a preset step and keeps optional values out when absent", () => {
  const ids = (prefix: "s") => `${prefix}_fixed`;
  const input: CreateStepInput = { title: "  Call Brose  ", column: "doing", owner: "Sam", ownerUserId: "sam", dueDay: 12, note: "  Check the test number.  " };
  expect(toStepAdded(input, { column: "todo", dueDay: 8 }, ids)).toEqual({
    stepId: "s_fixed", text: "Call Brose", owner: "Sam", ownerUserId: "sam", dueDay: 12, to: "doing", note: "Check the test number.",
  });
  expect(toStepAdded({ title: "First step" }, undefined, ids)).toEqual({ stepId: "s_fixed", text: "First step" });
});

it("STP create: applies the preset column and due day when the input leaves them unset", () => {
  expect(toStepAdded({ title: "Call the supplier" }, { column: "doing", dueDay: 7, note: "Confirm timing" }, () => "s_1"))
    .toEqual({ stepId: "s_1", text: "Call the supplier", dueDay: 7, to: "doing", note: "Confirm timing" });
});

it("STP create: uses a preset title when the caller has no title", () => {
  expect(toStepAdded({ title: " " }, { title: "Preset title" }, () => "s_2").text).toBe("Preset title");
});

it("STP create: requires a title and keeps details within the event limit", () => {
  const input: CreateStepInput = { title: "  ", note: "" };
  expect(validStep(input)).toBe(false);
  expect(validStep({ ...input, title: "Make the call" })).toBe(true);
  expect(validStep({ ...input, title: "x".repeat(501) })).toBe(false);
  expect(validStep({ ...input, title: "Make the call", note: "x".repeat(2001) })).toBe(false);
});
