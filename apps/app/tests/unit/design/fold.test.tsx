// DESIGN_RULES.md, section 9: a section is folded by default and opens on demand.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Fold } from "@/components/ui/elements";

describe("Fold", () => {
  it("is closed unless asked: the summary line is in view, the rest waits inside", () => {
    const out = html(h(Fold, { summary: "Details", meta: "3", name: "details" }, "Typed by A. Weber"));
    expect(out).toMatch(/^<details(?![^>]* open)/);
    expect(out).toContain("<summary>");
    expect(out).toContain("Details");
    expect(out).toContain("Typed by A. Weber");
    expect(out).toContain('data-name="details"');
  });

  it("opens from the start for the one thing the viewer has to do now", () => {
    expect(html(h(Fold, { summary: "Your move", open: true }, "Confirm"))).toMatch(/^<details[^>]* open/);
  });

  it("draws no meta when there is none", () => {
    expect(html(h(Fold, { summary: "Comments" }, "x")).match(/<span/g)?.length).toBe(1);
  });
});
