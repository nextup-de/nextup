// The Paper check's rules (scripts/design/paper-check.mjs), without Paper: a frame's JSX in, findings out.
import { describe, expect, it } from "vitest";
import { checkNodes, nodesOf } from "../../../scripts/design/paper-check.mjs";
import { readScale } from "../../../scripts/design/scale.mjs";

const scale = readScale();
const frame = (inner: string) => nodesOf(`(\n<div id="A-1" style={{ display: 'flex' }}>${inner}</div>\n)`);
const rules = (inner: string) => checkNodes(frame(inner), scale).map((i: { level: string; rule: string; fix: string }) => `${i.level} ${i.rule} ${i.fix}`);

describe("Paper check", () => {
  it("reads every element's id and inline style, quotes inside values included", () => {
    const nodes = frame(`<div id="B-2" style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: '14px', gap: 6 }} />`);
    expect(nodes.map((n: { id: string }) => n.id)).toEqual(["A-1", "B-2"]);
    expect(nodes[1].style.fontFamily).toBe('"Inter", system-ui, sans-serif');
  });

  it("a frame on the scale passes", () => {
    expect(rules(`<div id="B-2" style={{ fontFamily: 'var(--nh-font)', fontSize: 'var(--nh-fs-ui)', lineHeight: '18px', padding: '0', gap: 'var(--nh-sp-8)', color: 'var(--nh-ink)' }} />`)).toEqual([]);
  });

  it("sizes off the scale go to the nearest step, with the line height of that step", () => {
    expect(rules(`<div id="B-2" style={{ fontSize: '11px', lineHeight: '14px' }} />`)).toEqual([
      "error type-size var(--nh-fs-xs) (12px)",
      "error line-height 16px (--nh-lh-xs)",
    ]);
  });

  it("system-ui is not the app's font", () => {
    expect(rules(`<div id="B-2" style={{ fontFamily: 'system-ui, sans-serif' }} />`)).toEqual(["error font-family var(--nh-font) (Inter)"]);
  });

  it("spacing between steps is an error; a raw step is a warning naming the token", () => {
    expect(rules(`<div id="B-2" style={{ padding: '7px 12px', gap: '1px' }} />`)).toEqual([
      "error space var(--nh-sp-8)",
      "warn space-token var(--nh-sp-12)",
    ]);
  });

  it("a colour must be a token; a hex equal to a token names it", () => {
    expect(rules(`<div id="B-2" style={{ color: '#3A3A3C', backgroundColor: '#123456' }} />`)).toEqual([
      "warn colour-token var(--nh-ink-2)",
      "error colour a colour token (tokens.css)",
    ]);
  });

  it("a token Paper has but the app does not is an error", () => {
    expect(rules(`<div id="B-2" style={{ color: 'var(--nh-dark)' }} />`)).toEqual(["error unknown-token a token from tokens.css"]);
  });
});
