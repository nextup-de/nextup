// Step 3 of a cover: the safe-zone check and the safe placement (docs/AI_COVERS.md).
import { describe, expect, it } from "vitest";
import { BACKDROP, boxScale, fitCover, isBackdrop, objectPoints, SAMPLE_H, SAMPLE_W } from "@/features/cases/coverFit";

// A 160×90 backdrop with grey rectangles painted on it (fractions of the frame).
function picture(...rects: [number, number, number, number][]) {
  const px = new Uint8Array(SAMPLE_W * SAMPLE_H * 3);
  for (let y = 0; y < SAMPLE_H; y++) for (let x = 0; x < SAMPLE_W; x++) {
    const inside = rects.some(([x0, y0, x1, y1]) => x / SAMPLE_W >= x0 && x / SAMPLE_W < x1 && y / SAMPLE_H >= y0 && y / SAMPLE_H < y1);
    px.set(inside ? [120, 125, 135] : BACKDROP, (y * SAMPLE_W + x) * 3);
  }
  return objectPoints(px);
}

describe("isBackdrop", () => {
  it("the backdrop and colours close to it are empty; grey and navy are not", () => {
    expect(isBackdrop([0xee, 0xf4, 0xfd])).toBe(true);
    expect(isBackdrop([0xec, 0xf2, 0xfb])).toBe(true);
    expect(isBackdrop([0x1b, 0x2a, 0x44])).toBe(false);
    expect(isBackdrop([200, 200, 200])).toBe(false);
  });
});

describe("fitCover", () => {
  it("a diorama in the bottom-right corner passes as is", () => {
    expect(fitCover(picture([0.6, 0.5, 0.95, 0.95]))).toEqual({ status: "pass", scale: 1 });
  });
  it("a scene reaching into the top band or the number's box is shrunk into the corner", () => {
    const fit = fitCover(picture([0.35, 0.25, 0.95, 0.95]));
    expect(fit.status).toBe("safe-placed");
    expect(fit.scale).toBeGreaterThanOrEqual(0.7);
    expect(fit.scale).toBeLessThan(1);
  });
  it("safe placement moves the whole object box clear: right of the number's box and below the band", () => {
    // A box from x 0.3, y 0.3 to the corner: right of the box needs s ≤ 0.55 / 0.7, below the band s ≤ 0.64 / 0.7.
    const s = boxScale([0.3, 0.3, 0.95, 0.95]);
    expect(s).toBeCloseTo(0.55 / (1 - (0.3 - 0.5 / SAMPLE_W)), 3);
    expect(1 - s + s * 0.3).toBeGreaterThanOrEqual(0.449);
  });
  it("a box that already sits above the number's box only has to clear the band", () => {
    expect(boxScale([0.1, 0.4, 0.9, 0.5])).toBe(1);
  });
  it("a scene filling the frame cannot be saved: the fallback cover", () => {
    expect(fitCover(picture([0.02, 0.05, 0.98, 0.98]))).toEqual({ status: "fallback", scale: 0 });
  });
  it("an empty picture passes", () => {
    expect(fitCover(picture()).status).toBe("pass");
  });
});
