// Writes responses/<qid>.json for every ground-truth question from made-up data (D8):
//   node tests/fixtures/graph/synthesize.mjs
// Needs Node 22.18 or newer (it runs fixtures.ts through Node's type stripping). A file recorded against the
// test tenant (source "recorded") is left alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadFiles, loadQuestions, synthesizeResponse } from "./fixtures.ts";

const dir = new URL("./responses/", import.meta.url);
mkdirSync(dir, { recursive: true });
const files = loadFiles();
for (const q of loadQuestions()) {
  const target = new URL(`${q.id}.json`, dir);
  if (existsSync(target) && JSON.parse(readFileSync(target, "utf8")).source === "recorded") {
    console.log(`${q.id}: recorded, kept`);
    continue;
  }
  writeFileSync(target, JSON.stringify(synthesizeResponse(q, files), null, 2) + "\n");
  console.log(`${q.id}: synthetic written`);
}
