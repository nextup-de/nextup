// A project's folder: the SharePoint or OneDrive link the team connected (plan FIL, D4). Pure.
import type { Link, ReducedProject } from "@/features/projects/types";

const HOSTS = /(?:^|\.)(?:sharepoint\.com|sharepoint-df\.com|onedrive\.live\.com|1drv\.ms)$/i;

/** Graph's share id for a SharePoint or OneDrive link (`u!` + the link, base64url without padding), or null for anything else. */
export function folderOf(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { return null; }
  if (parsed.protocol !== "https:" || !HOSTS.test(parsed.hostname)) return null;
  const encoded = Buffer.from(parsed.toString(), "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return "u!" + encoded;
}

/** The newest project.linked with system sharepoint and no step (D4), or null. Later in the log wins; the day breaks no ties. */
export function projectFolder(p: Pick<ReducedProject, "links">): Link | null {
  let newest: Link | null = null;
  for (const link of p.links) if (link.system === "sharepoint" && link.stepId === null) newest = link;
  return newest;
}
