import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { inlineStrings } from "./inline";
it("list", async () => {
  const f = await inlineStrings([
  "src/components/shell/{AppShell,Ground,InputSheet,LoopSheets,NavSearch,ShellSkeleton,SimpleShell,TopBar}.tsx",
  "src/components/{auth,profile,settings,report,ui,demo}/**/*.{ts,tsx}",
  "src/app/{[company],demo,(auth)}/**/*.{ts,tsx}",
  "src/app/page.tsx"]);
  writeFileSync("zz-findings.txt", f.map(x=>`${x.file}:${x.line}: ${x.text}`).join("\n"));
}, 120000);
