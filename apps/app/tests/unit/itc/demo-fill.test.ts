import { describe, expect, it } from "vitest";
import { demoFillAllowed } from "@/app/admin/login/demo-fill";

describe("ITC demo fill", () => {
  it("fills the code on a demo company", () => {
    expect(demoFillAllowed("demo")).toBe(true);
  });
  it("never on sandbox or live", () => {
    expect(demoFillAllowed("sandbox")).toBe(false);
    expect(demoFillAllowed("live")).toBe(false);
  });
  it("fails closed on pilot, unknown or missing stages", () => {
    expect(demoFillAllowed("pilot")).toBe(false);
    expect(demoFillAllowed("")).toBe(false);
    expect(demoFillAllowed(undefined)).toBe(false);
  });
});
