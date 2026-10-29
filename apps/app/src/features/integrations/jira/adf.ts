// Text <-> Atlassian Document Format (Jira Cloud API v3 sends and takes comments and descriptions as
// ADF). Pure. The sync only deals in plain text: textToAdf for what NextUp writes into Jira,
// adfToText for what Jira's people wrote. Data Center (API v2) uses plain strings, which
// adfToText passes through.

type Node = { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown };

/** The most nodes read from one document, so a hostile or huge body cannot stall a round. */
const MAX_NODES = 5000;

/** Plain text as an ADF document: one paragraph per non-empty line. */
export function textToAdf(text: string): { version: 1; type: "doc"; content: unknown[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const content = (lines.length ? lines : [""]).map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { version: 1, type: "doc", content };
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "panel", "rule", "tableRow", "mediaSingle", "mediaGroup", "expand", "decisionItem", "taskItem"]);

const asNode = (v: unknown): Node | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Node) : null);
const attr = (n: Node, key: string): string | null => {
  const a = asNode(n.attrs);
  const v = a ? (a as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v : null;
};

/**
 * Plain text out of an ADF body (or a string, which is already plain). Blocks become lines, list
 * items get a dash, a mention becomes "@someone" (the sync never carries a person's name over).
 * Anything unreadable is "".
 */
export function adfToText(body: unknown): string {
  if (typeof body === "string") return body.replace(/\r\n?/g, "\n").trim();
  let budget = MAX_NODES;
  const walk = (raw: unknown): string => {
    const n = asNode(raw);
    if (!n || budget-- <= 0) return "";
    const type = typeof n.type === "string" ? n.type : "";
    if (type === "text") return typeof n.text === "string" ? n.text : "";
    if (type === "hardBreak") return "\n";
    if (type === "mention") return "@someone";
    if (type === "emoji") return attr(n, "text") ?? attr(n, "shortName") ?? "";
    if (type === "inlineCard" || type === "blockCard") return attr(n, "url") ?? "";
    if (type === "media" || type === "mediaInline") return "[attachment]";
    const kids = Array.isArray(n.content) ? n.content : [];
    const inner = kids.map(walk);
    if (type === "bulletList") return inner.map((l) => "- " + l.trim()).join("\n") + "\n";
    if (type === "orderedList") return inner.map((l, i) => `${i + 1}. ` + l.trim()).join("\n") + "\n";
    if (type === "tableCell" || type === "tableHeader") return inner.join(" ") + " ";
    if (type === "tableRow") return inner.join("").trim() + "\n";
    const text = inner.join("");
    return BLOCKS.has(type) ? text.trim() + "\n" : text;
  };
  return walk(body).replace(/\n{3,}/g, "\n\n").trim();
}
