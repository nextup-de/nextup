"use server";
// Dev panel → Design → "Set as default": writes the dot-grid values into
// src/config/design-defaults.json, the default every device gets once it is committed and deployed.
// Local dev server only - a deployed build has no source tree to write to.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeDots, type Dots } from "@/features/design/dots";

export async function saveDesignDefaultsAction(input: Dots): Promise<{ ok?: boolean; error?: string }> {
  if (process.env.NODE_ENV !== "development") return { error: "Defaults can only be set on the local dev server." };
  const dots = normalizeDots(input);
  await writeFile(join(process.cwd(), "src", "config", "design-defaults.json"), JSON.stringify(dots, null, 2) + "\n");
  return { ok: true };
}
