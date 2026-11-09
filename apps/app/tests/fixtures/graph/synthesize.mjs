// Writes responses/<qid>.json for every ground-truth question from made-up data (D8):
//   npx tsx tests/fixtures/graph/synthesize.mjs
// tsx, because the request comes from the app's own searchRequest (src/features/m365/search.ts), so the fixture
// asks what the app asks. A file recorded against the test tenant (source "recorded") is left alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { searchRequest } from "../../../src/features/m365/search.ts";
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
  writeFileSync(target, JSON.stringify(synthesizeResponse(q, files, searchRequest(q.question, 10)), null, 2) + "\n");
  console.log(`${q.id}: synthetic written`);
}
