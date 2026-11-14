import { expect, it } from "vitest";
import { EVENT_BUDGET, fitsEvent } from "./pages";
import { linkTitle, readContent, roomLeft, saveState, writeContent, type ContentKind } from "./tool-content";

it("HUB content: round trips all four content tools without losing user text", () => {
  const doc = { body: "# Heading\n\n- A list\nUnicode: ä, \"quoted\"" };
  const checklist = { items: [{ id: "a", text: "Check the result", done: true }] };
  const table = { rows: [["Name", "Value"], ["Baseline", "10"], ["ragged"]] };
  const links = { links: [{ id: "a", url: "https://example.com/a", title: "Reference" }] };
  expect(readContent("doc", writeContent("doc", doc))).toEqual(doc);
  expect(readContent("checklist", writeContent("checklist", checklist))).toEqual(checklist);
  expect(readContent("table", writeContent("table", table))).toEqual(table);
  expect(readContent("links", writeContent("links", links))).toEqual(links);
});

it("HUB content: broken JSON and invalid shapes read as empty", () => {
  const empty = { doc: { body: "" }, checklist: { items: [] }, table: { rows: [] }, links: { links: [] } };
  for (const kind of Object.keys(empty) as ContentKind[]) {
    for (const raw of [null, "{broken", "null", "[]", "7", "{}"]) expect(readContent(kind, raw)).toEqual(empty[kind]);
  }
  expect(readContent("doc", '{"body":42}')).toEqual(empty.doc);
  expect(readContent("checklist", '{"items":[{"id":"a","text":"x","done":"yes"}]}')).toEqual(empty.checklist);
  expect(readContent("table", '{"rows":[[1]]}')).toEqual(empty.table);
  expect(readContent("links", '{"links":[{"id":"a","url":"javascript:alert(1)","title":"x"}]}')).toEqual(empty.links);
});

it("HUB content: links require http(s) and derive an empty title from the address", () => {
  expect(linkTitle(" https://wiki.example.com/notes?q=a ")).toBe("wiki.example.com");
  expect(linkTitle("http://localhost:3000/path")).toBe("localhost");
  for (const url of ["", "example.com", "//example.com", "ftp://example.com", "javascript:alert(1)", "https://", "https://example.com/a b"]) {
    expect(linkTitle(url)).toBe("");
    expect(() => writeContent("links", { links: [{ id: "a", url, title: "" }] })).toThrow();
  }
  const links = readContent("links", writeContent("links", { links: [{ id: "a", url: " https://example.com/a ", title: "  " }] }));
  expect(links.links[0]).toEqual({ id: "a", url: "https://example.com/a", title: "example.com" });
});

it("HUB content: counts both JSON envelopes, escaped text and the revision against fitsEvent", () => {
  for (const content of [writeContent("doc", { body: '"\\\n'.repeat(2000) }), "x".repeat(EVENT_BUDGET), ""]) {
    const payload = { toolId: "notes", content, baseRev: 12 };
    expect(roomLeft("notes", content, 12)).toBe(EVENT_BUDGET - JSON.stringify(payload).length);
    expect(roomLeft("notes", content, 12) >= 0).toBe(fitsEvent(payload));
  }
  const overhead = JSON.stringify({ toolId: "a", content: "", baseRev: 1 }).length;
  expect(roomLeft("a", "x".repeat(EVENT_BUDGET - overhead), 1)).toBe(0);
  expect(roomLeft("a", "x".repeat(EVENT_BUDGET - overhead + 1), 1)).toBe(-1);
});

it("HUB content: saving becomes saved only after the server's ok", () => {
  expect(saveState("idle", "edit")).toBe("dirty");
  expect(saveState("dirty", "save")).toBe("saving");
  expect(saveState("saving", "ok")).toBe("saved");
  expect(saveState("dirty", "ok")).toBe("dirty");
  expect(saveState("failed", "ok")).toBe("failed");
  expect(saveState("saving", "edit")).toBe("dirty");
});

it("HUB content: a refusal stays not saved until Retry succeeds", () => {
  expect(saveState("saving", "fail")).toBe("failed");
  expect(saveState("failed", "save")).toBe("saving");
  expect(saveState("saving", "ok")).toBe("saved");
});

it("HUB content: a stale refusal holds the conflict bar until the user resolves it", () => {
  expect(saveState("saving", "stale")).toBe("stale");
  expect(saveState("stale", "ok")).toBe("stale");
  expect(saveState("stale", "edit")).toBe("stale");
  expect(saveState("stale", "save")).toBe("stale");
  expect(saveState("stale", "reload")).toBe("idle");
});
