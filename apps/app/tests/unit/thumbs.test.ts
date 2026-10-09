// Feed covers without the generator: the sample's own picture, else a stable pick from the library.
import { describe, expect, it } from "vitest";
import { libraryCoverFor, SAMPLE_COVERS, sampleCoverFor } from "@/features/cases/thumbs";

const samples = SAMPLE_COVERS;
const s = { ...SAMPLE_COVERS[0], text: SAMPLE_COVERS[0].text + ", like missing parts, awkward tools, or unclear instructions.", cover: { src: SAMPLE_COVERS[0].src, fit: SAMPLE_COVERS[0].fit, stat: SAMPLE_COVERS[0].stat, hook: SAMPLE_COVERS[0].hook } };

describe("sampleCoverFor", () => {
  it("the dev panel's sample has its picture", () => {
    expect(samples.length).toBeGreaterThan(0);
    expect(sampleCoverFor({ title: s.title, body: "" }, samples)).toEqual(s.cover);
  });
  it("still found when renamed (the text leads the body) or titled by its text", () => {
    expect(sampleCoverFor({ title: "Station screens", body: s.text }, samples)).toEqual(s.cover);
    expect(sampleCoverFor({ title: s.text.slice(0, 120), body: "" }, samples)).toEqual(s.cover);
  });
  it("any other idea has none", () => {
    expect(sampleCoverFor({ title: "Pre-heat moulds during shift change", body: "The line stands still." }, samples)).toBeNull();
  });
});

describe("libraryCoverFor", () => {
  const lib = ["/a.webp", "/b.webp", "/c.webp"].map((src) => ({ src, fit: 1, stat: "Safer", hook: "a hazard taken away" }));
  it("the same case always gets the same picture", () => {
    expect(libraryCoverFor("c7", lib)).toBe(libraryCoverFor("c7", lib));
    expect(lib).toContain(libraryCoverFor("c7", lib));
  });
  it("spreads cases over the library", () => {
    expect(new Set(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => libraryCoverFor(id, lib))).size).toBeGreaterThan(1);
  });
  it("an empty library means no picture", () => {
    expect(libraryCoverFor("c1", [])).toBeNull();
  });
});

describe("the library", () => {
  it("has its ten pictures, each with a measured placement, and every case gets one", async () => {
    const { COVER_LIBRARY } = await import("@/features/cases/thumbs");
    expect(COVER_LIBRARY).toHaveLength(10);
    expect(COVER_LIBRARY.every((p) => p.src.startsWith("/feed/library/") && p.fit >= 0.7 && p.fit <= 1)).toBe(true);
    // The preset text keeps docs/AI_COVERS.md's limits and never shows a number it cannot know.
    for (const p of [...COVER_LIBRARY, ...SAMPLE_COVERS]) {
      expect(p.stat.length).toBeLessThanOrEqual(7);
      expect(p.stat).not.toMatch(/[0-9]/);
      expect(p.hook.length).toBeLessThanOrEqual(24);
      expect(p.hook.split(" ").length).toBeGreaterThanOrEqual(2);
      expect(p.hook.split(" ").length).toBeLessThanOrEqual(4);
    }
    expect(libraryCoverFor("c1")).not.toBeNull();
  });
});
