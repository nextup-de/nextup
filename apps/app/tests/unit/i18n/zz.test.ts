import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { inlineStrings } from "./inline";
it("x", async () => {
  const f = await inlineStrings(["src/components/dashboard/team/**/*.{ts,tsx}", "src/components/dashboard/leader/**/*.{ts,tsx}"]);
  writeFileSync(process.env.OUT!, f.map((x) => `${x.file}:${x.line}: ${x.text}`).join("\n"));
}, 60000);
