// The raiser's View choice: everyone, private, or the people and departments they picked.
import { describe, expect, it } from "vitest";
import { seesByChoice } from "@/features/cases/visibility";

const kim = { name: "K. Adler", dept: "Finance" };

describe("seesByChoice", () => {
  it("everyone: anyone sees it", () => expect(seesByChoice("everyone", [], kim)).toBe(true));
  it("private: nobody but the raiser and the desk (not answered here)", () => expect(seesByChoice("private", ["K. Adler"], kim)).toBe(false));
  it("custom: a picked person sees it", () => expect(seesByChoice("custom", ["K. Adler"], kim)).toBe(true));
  it("custom: a picked department's people see it", () => expect(seesByChoice("custom", ["Finance"], kim)).toBe(true));
  it("custom: anyone else does not", () => expect(seesByChoice("custom", ["B. Hartmann", "Production"], kim)).toBe(false));
  it("custom: a viewer with no department only matches by name", () => expect(seesByChoice("custom", ["Finance"], { name: "K. Adler", dept: null })).toBe(false));
  it("no choice: the old rule decides", () => expect(seesByChoice(null, [], kim)).toBeNull());
});
