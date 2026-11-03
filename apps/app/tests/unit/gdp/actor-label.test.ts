import { describe, expect, it } from "vitest";
import { actorLabel } from "@/features/cases/actor-label";

describe("GDP actor label", () => {
  const labels = { u1: "Former member #4471" };

  it("a resolved pseudonym wins over a stale stored actor", () => {
    expect(actorLabel({ actor: "L. Brandt", actorUserId: "u1" }, labels)).toBe("Former member #4471");
  });

  it("system and handle actors are preserved", () => {
    expect(actorLabel({ actor: "system:clock", actorUserId: null }, labels)).toBe("system:clock");
    expect(actorLabel({ actor: "system:n8n" }, labels)).toBe("system:n8n");
    expect(actorLabel({ actor: "Anonymous #0042", actorUserId: "u1" }, labels)).toBe("Anonymous #0042");
  });

  it("someone who is not a former member keeps the stored label", () => {
    expect(actorLabel({ actor: "M. Roth", actorUserId: "u2" }, labels)).toBe("M. Roth");
    expect(actorLabel({ actor: "M. Roth", actorUserId: "u2" }, undefined)).toBe("M. Roth");
  });
});
