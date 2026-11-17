import { beforeEach, expect, it } from "vitest";
import { folderOf } from "@/features/files/link";
import { addDemoFile, DEMO_FOLDER, DEMO_TRAIL, demoVersions, listDemoFolder, removeDemoItem, resetDemoFiles } from "./files-demo";

beforeEach(resetDemoFiles);

it("FIL demo files: the root holds seven files and the subfolder Delivery reports Q3, in the answer shapes of the server", () => {
  expect(DEMO_TRAIL).toEqual(["Shared documents", "Supplier data"]);
  const answer = listDemoFolder("");
  expect(answer.state).toBe("ok");
  if (answer.state !== "ok") return;
  expect(answer.rows.filter((r) => !r.isFolder)).toHaveLength(7);
  expect(answer.rows.filter((r) => r.isFolder).map((r) => [r.name, r.childCount])).toEqual([["Delivery reports Q3", 3]]);
  expect(answer.next).toBeNull();
  expect(answer.rows.every((r) => r.id && r.webUrl.startsWith("https://") && r.modifiedBy && r.modifiedAt)).toBe(true);
  const sub = listDemoFolder("Delivery reports Q3");
  expect(sub.state === "ok" && sub.rows.map((r) => r.parentPath)).toEqual(["Delivery reports Q3", "Delivery reports Q3", "Delivery reports Q3"]);
  expect(listDemoFolder("Nowhere")).toEqual({ state: "no-access" });
});

it("FIL demo files: uploads and deletes change the tree in memory and a reset brings it back", () => {
  const row = addDemoFile("", { name: "Price list.pdf", size: 1000, by: "T. Vogel" });
  expect(row).toMatchObject({ kind: "pdf", modifiedBy: "T. Vogel", parentPath: "" });
  const after = listDemoFolder("");
  expect(after.state === "ok" && after.rows[0].name).toBe("Price list.pdf");
  expect(addDemoFile("Missing", { name: "x.pdf", size: 1, by: "A" })).toBeNull();
  expect(removeDemoItem("", row!.id)).toBe(true);
  expect(removeDemoItem("", row!.id)).toBe(false);
  expect(removeDemoItem("", "demo-Delivery reports Q3")).toBe(false);
  const sub = listDemoFolder("Delivery reports Q3");
  for (const r of sub.state === "ok" ? sub.rows : []) expect(removeDemoItem("Delivery reports Q3", r.id)).toBe(true);
  expect(listDemoFolder("Delivery reports Q3")).toEqual({ state: "empty" });
  expect(removeDemoItem("", "demo-Delivery reports Q3")).toBe(true);
  expect(listDemoFolder("Delivery reports Q3")).toEqual({ state: "no-access" });
  resetDemoFiles();
  expect(listDemoFolder("Delivery reports Q3").state).toBe("ok");
});

it("FIL demo files: the demo folder is a SharePoint link a project can have, and a file's history holds its one version", () => {
  expect(DEMO_FOLDER.system).toBe("sharepoint");
  expect(folderOf(DEMO_FOLDER.url)).not.toBeNull();
  const answer = listDemoFolder("");
  const row = answer.state === "ok" ? answer.rows.find((r) => r.name === "Supplier scorecard.xlsx") : undefined;
  expect(demoVersions(row!.id)).toEqual({ state: "ok", versions: [{ id: "1.0", modifiedAt: row!.modifiedAt, modifiedBy: row!.modifiedBy, size: row!.size }] });
  expect(demoVersions("demo-Delivery reports Q3")).toEqual({ state: "no-access" });
  expect(demoVersions("elsewhere")).toEqual({ state: "no-access" });
});
