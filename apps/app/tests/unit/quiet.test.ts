// lib/utils/quiet.ts: a 0 or missing number is not shown; a long list shows its top few.
import { describe, expect, it } from "vitest";
import { capped, LIST_FITS, LIST_TOP, shows } from "@/lib/utils/quiet";

describe("shows", () => {
  it("hides 0, null, undefined and NaN", () => {
    for (const n of [0, -0, null, undefined, NaN, Infinity]) expect(shows(n)).toBe(false);
  });
  it("shows any other number, negative ones too", () => {
    for (const n of [1, 0.4, -3, 100]) expect(shows(n)).toBe(true);
  });
});

describe("capped", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("keeps a list that fits as it is", () => {
    expect(capped(list(LIST_FITS), false)).toEqual({ shown: list(LIST_FITS), hidden: 0 });
  });
  it("shows the first few of a longer list, in the given order", () => {
    expect(capped(list(LIST_FITS + 1), false)).toEqual({ shown: list(LIST_TOP), hidden: LIST_FITS + 1 - LIST_TOP });
  });
  it("shows everything once opened", () => {
    expect(capped(list(20), true)).toEqual({ shown: list(20), hidden: 0 });
  });
});
