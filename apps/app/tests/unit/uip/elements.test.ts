import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Banner, DataTable, DeptChip, PageHeader, PersonFace, SectionCard, Tabs, TooFewToShow } from "@/components/ui/elements";
import { ConfirmDialog, SecretOnce } from "@/components/ui/elements/interactive";
import { avatarTone } from "@/lib/avatar";
import { deptTone } from "@/lib/dept-tone";

const noop = () => {};

describe("UIP elements", () => {
  it("PageHeader and SectionCard carry the test ids the page sweep looks for", () => {
    expect(html(h(PageHeader, { title: "Webhooks", lede: "What goes out" }))).toContain('data-testid="page-header"');
    const card = html(h(SectionCard, { title: "Tokens", hint: "Hint", name: "tokens" }));
    expect(card).toContain('data-testid="section-card"');
    expect(card).toContain('data-name="tokens"');
    expect(card).toContain("Hint");
  });

  it("DataTable shows every value with its column's name for the phone, or the empty line", () => {
    const columns = [{ key: "n", header: "Name", render: (r: { n: string }) => r.n }];
    const full = html(h(DataTable<{ n: string }>, { columns, rows: [{ n: "Vogel" }], rowKey: (r) => r.n, empty: "Nobody" }));
    expect(full).toContain("Vogel");
    expect(full.match(/Name/g)).toHaveLength(2);
    expect(full).not.toContain("Nobody");
    expect(html(h(DataTable<{ n: string }>, { columns, rows: [], rowKey: (r) => r.n, empty: "Nobody" }))).toContain("Nobody");
  });

  it("Tabs marks only the current tab", () => {
    const out = html(h(Tabs, { label: "Views", current: "b", items: [{ key: "a", label: "A", href: "/a" }, { key: "b", label: "B", href: "/b", count: 3 }] }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toContain(">3<");
  });

  it("an error Banner is an alert, a quiet one is not", () => {
    expect(html(h(Banner, { tone: "error", children: "Failed" }))).toContain('role="alert"');
    expect(html(h(Banner, { tone: "quiet", children: "AI off" }))).not.toContain("alert");
  });

  it("TooFewToShow shows the reason and takes no number", () => {
    const out = html(h(TooFewToShow, { title: "Too few to show", why: "Fewer than 5 people" }));
    expect(out).toContain("Too few to show");
    expect(out).not.toMatch(/>\d+</);
  });

  it("ConfirmDialog keeps Confirm off until the word is typed", () => {
    const out = html(h(ConfirmDialog, { title: "Delete", text: "Sure?", confirmLabel: "Delete", cancelLabel: "Cancel", danger: true, typed: { word: "acme", label: "Type acme" }, onConfirm: noop, onCancel: noop }));
    expect(out).toMatch(/<button[^>]*disabled/);
    expect(out).toContain("Type acme");
  });

  it("SecretOnce shows the value and the note", () => {
    const out = html(h(SecretOnce, { value: "nxu_1", note: "Shown once", copyLabel: "Copy", copiedLabel: "Copied" }));
    expect(out).toContain("nxu_1");
    expect(out).toContain("Shown once");
  });

  it("a person and a department keep one tone everywhere, anonymous people have none", () => {
    expect(deptTone("Production, Line 3")).toBe(deptTone("Production"));
    expect(deptTone("production · Ulm plant")).toBe(deptTone("Production"));
    expect(deptTone("")).toBeUndefined();
    expect(avatarTone("Anonymous #4471")).toBeUndefined();
    expect(html(h(PersonFace, { name: "T. Vogel" }))).toContain(`data-avatar="${avatarTone("T. Vogel")}"`);
    expect(html(h(PersonFace, { name: "T. Vogel" }))).toContain("TV");
    expect(html(h(PersonFace, { name: "Anonymous #4471" }))).not.toContain("data-avatar");
    expect(html(h(DeptChip, { name: "Quality" }))).toContain(`data-dept-tone="${deptTone("Quality")}"`);
  });
});

describe("UIP tones", () => {
  const css = readFileSync(path.resolve(__dirname, "../../../src/app/globals.css"), "utf8");
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const hex = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));

  it.each(["blue", "green", "amber", "violet", "teal", "pink"])("the %s department tint is soft and its ink reads at 4.5:1", (tone) => {
    const rule = css.match(new RegExp(`\\[data-dept-tone="${tone}"\\] \\{ --nh-dept: rgb\\((\\d+) (\\d+) (\\d+) / 50%\\); --nh-dept-ink: (#[0-9a-f]{6}); \\}`));
    expect(rule, `${tone} at 50 %`).not.toBeNull();
    const [r, g, b, ink] = rule!.slice(1);
    const onWhite = [r, g, b].map((c) => (Number(c) + 255) / 2);
    expect((lum(onWhite) + 0.05) / (lum(hex(ink)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it("every avatar tone has its colours", () => {
    for (const tone of ["blue", "green", "amber", "violet", "teal", "pink"]) expect(css).toContain(`[data-avatar="${tone}"]`);
  });
});
