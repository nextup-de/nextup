// Reads the break-glass window the host script wrote (SEC/D4, D6). Read-only, never cached beyond a call.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseWindow, type BreakGlassWindow } from "@/features/admin/break-glass";

export const BREAK_GLASS_DIR_DEFAULT = "/run/nextup/break-glass";

/** The current window, or null when the file is missing or unreadable. */
export async function readBreakGlassWindow(): Promise<BreakGlassWindow | null> {
  const dir = process.env.BREAK_GLASS_DIR?.trim() || BREAK_GLASS_DIR_DEFAULT;
  try {
    return parseWindow(await readFile(path.join(dir, "window.json"), "utf8"));
  } catch {
    return null;
  }
}
