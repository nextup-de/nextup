import { EVENT_BUDGET, fitsEvent } from "./pages";

export type ToolContent = {
  doc: { body: string };
  checklist: { items: { id: string; text: string; done: boolean }[] };
  table: { rows: string[][] };
  links: { links: { id: string; url: string; title: string }[] };
};
export type ContentKind = keyof ToolContent;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function linkTitle(url: string): string {
  try {
    if (/\s/.test(url.trim())) return "";
    const parsed = new URL(url.trim());
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname ? parsed.hostname : "";
  } catch { return ""; }
}

export function readContent<K extends ContentKind>(kind: K, raw: string | null): ToolContent[K] {
  let value: unknown;
  try { value = JSON.parse(raw ?? "null"); } catch { value = null; }
  const v = record(value) ? value : {};
  let result: ToolContent[ContentKind];
  switch (kind) {
    case "doc": result = { body: typeof v.body === "string" ? v.body : "" }; break;
    case "checklist": result = { items: Array.isArray(v.items) && v.items.every((x) => record(x) && typeof x.id === "string" && typeof x.text === "string" && typeof x.done === "boolean") ? v.items : [] }; break;
    case "table": result = { rows: Array.isArray(v.rows) && v.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string")) ? v.rows : [] }; break;
    case "links": result = { links: Array.isArray(v.links) ? v.links.flatMap((x, index) => record(x) && typeof x.url === "string" && !!linkTitle(x.url) && typeof x.title === "string" ? [{ id: typeof x.id === "string" ? x.id : `link-${index}`, url: x.url.trim(), title: x.title.trim() || linkTitle(x.url) }] : []) : [] }; break;
  }
  return result! as ToolContent[K];
}

export function writeContent<K extends ContentKind>(kind: K, value: ToolContent[K]): string {
  if (kind === "links" && (value as ToolContent["links"]).links.some((link) => !linkTitle(link.url))) throw new Error("Invalid link address");
  return JSON.stringify(readContent(kind, JSON.stringify(value)));
}

/** Remaining serialized characters, including both JSON envelopes and escaped text. */
export function roomLeft(toolId: string, content: string, baseRev: number): number {
  const payload = { toolId, content, baseRev };
  const remaining = EVENT_BUDGET - JSON.stringify(payload).length;
  return fitsEvent(payload) ? Math.max(0, remaining) : remaining;
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed" | "stale";
export type SaveEvent = "edit" | "save" | "ok" | "fail" | "stale" | "reload";
export function saveState(state: SaveState, event: SaveEvent): SaveState {
  switch (event) {
    case "edit": return state === "stale" ? "stale" : "dirty";
    case "save": return state === "stale" ? "stale" : "saving";
    case "ok": return state === "saving" ? "saved" : state;
    case "fail": return state === "saving" ? "failed" : state;
    case "stale": return "stale";
    case "reload": return "idle";
  }
}
