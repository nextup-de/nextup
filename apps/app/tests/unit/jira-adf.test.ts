// Text <-> Atlassian Document Format (features/integrations/jira/adf.ts).
import { describe, expect, it } from "vitest";
import { adfToText, textToAdf } from "@/features/integrations/jira/adf";

describe("jira adf: text in, document out", () => {
  it("makes one paragraph per non-empty line", () => {
    const doc = textToAdf("First line\r\n\r\nSecond line  \n");
    expect(doc).toMatchObject({ version: 1, type: "doc" });
    expect(doc.content).toHaveLength(2);
    expect(adfToText(doc)).toBe("First line\nSecond line");
  });

  it("empty text is still a valid document", () => {
    expect(textToAdf("").content).toHaveLength(1);
    expect(adfToText(textToAdf(""))).toBe("");
  });
});

describe("jira adf: document in, text out", () => {
  const p = (...inline: unknown[]) => ({ type: "paragraph", content: inline });
  const t = (text: string) => ({ type: "text", text });

  it("reads paragraphs, hard breaks and marks", () => {
    const doc = { type: "doc", version: 1, content: [p(t("Hello "), { type: "text", text: "world", marks: [{ type: "strong" }] }), p(t("a"), { type: "hardBreak" }, t("b"))] };
    expect(adfToText(doc)).toBe("Hello world\na\nb");
  });

  it("lists get dashes and numbers", () => {
    const li = (s: string) => ({ type: "listItem", content: [p(t(s))] });
    const doc = { type: "doc", content: [{ type: "bulletList", content: [li("one"), li("two")] }, { type: "orderedList", content: [li("x"), li("y")] }] };
    expect(adfToText(doc)).toBe("- one\n- two\n1. x\n2. y");
  });

  it("never carries a person's name over: a mention becomes @someone", () => {
    const doc = { type: "doc", content: [p(t("Thanks "), { type: "mention", attrs: { id: "acc-1", text: "@Anna Keller" } }, t("!"))] };
    expect(adfToText(doc)).toBe("Thanks @someone!");
    expect(adfToText(doc)).not.toContain("Anna");
  });

  it("links and attachments stay readable", () => {
    const doc = { type: "doc", content: [p({ type: "inlineCard", attrs: { url: "https://example.com/x" } }), { type: "mediaSingle", content: [{ type: "media", attrs: { id: "1" } }] }] };
    expect(adfToText(doc)).toBe("https://example.com/x\n[attachment]");
  });

  it("a plain string (Data Center) passes through; junk is empty", () => {
    expect(adfToText("  plain\r\ntext ")).toBe("plain\ntext");
    for (const junk of [null, undefined, 42, [], {}, { type: "doc" }, { type: "doc", content: "no" }]) expect(adfToText(junk)).toBe("");
  });

  it("a huge document is cut off instead of stalling", () => {
    const doc = { type: "doc", content: Array.from({ length: 20000 }, () => p(t("x"))) };
    expect(adfToText(doc).length).toBeLessThan(6000);
  });
});
