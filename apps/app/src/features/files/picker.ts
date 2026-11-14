// What the folder picker knows about a Graph driveItem (plan FIL, D4, frame 6.4). Pure.
export type PickerFolder = { id: string; driveId: string; name: string; webUrl: string; path: string; count: number };
export type PickerAnswer = { state: "ok"; folders: PickerFolder[] } | { state: "not-connected" | "no-access" | "offline" };

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Only plain Graph ids are put into a request address. */
export const SAFE_ID = /^[A-Za-z0-9!_.$-]{1,200}$/;

/** The folders among Graph's driveItems; files and items without a drive or an address are left out. */
export function foldersOf(json: unknown): PickerFolder[] {
  const items = record(json) && Array.isArray(json.value) ? json.value : [];
  const out: PickerFolder[] = [];
  for (const item of items) {
    if (!record(item) || !record(item.folder)) continue;
    const ref = record(item.parentReference) ? item.parentReference : {};
    const id = text(item.id), name = text(item.name), driveId = text(ref.driveId), webUrl = text(item.webUrl);
    if (!id || !name || !driveId || !webUrl) continue;
    const at = text(ref.path).indexOf("root:");
    out.push({ id, driveId, name, webUrl, path: at < 0 ? "" : text(ref.path).slice(at + 5).replace(/^\/+|\/+$/g, ""), count: typeof item.folder.childCount === "number" ? item.folder.childCount : 0 });
  }
  return out;
}
