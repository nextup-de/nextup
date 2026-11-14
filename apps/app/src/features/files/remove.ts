// What the row menu offers and how Delete reads (plan FIL-B2, D8). Pure.
import type { FileRow } from "./items";

export type MenuItem = "open" | "openInBrowser" | "download" | "copyLink" | "linkToStep" | "history" | "rename" | "move" | "delete";

/**
 * The items of the ⋮ menu. A folder has no download or history. Rename and Move leave NextUp for SharePoint (D8). Delete
 * shows only to people who may append project.linked (`editor`); a read-only grant is told at the press, not hidden here.
 */
export function rowMenuItems(row: Pick<FileRow, "isFolder">, o: { editor: boolean }): MenuItem[] {
  const items: MenuItem[] = ["open", "openInBrowser"];
  if (!row.isFolder) items.push("download");
  items.push("copyLink");
  if (!row.isFolder && o.editor) items.push("linkToStep");
  if (!row.isFolder) items.push("history");
  items.push("rename", "move");
  if (o.editor) items.push("delete");
  return items;
}

/** Graph moves a deleted item to the site's recycle bin: `https://t.sharepoint.com/sites/x/...` -> its RecycleBin page. */
export function recycleBinUrl(folderUrl: string): string | null {
  try {
    const url = new URL(folderUrl);
    const [kind, site] = url.pathname.split("/").filter(Boolean);
    const base = kind === "sites" || kind === "teams" ? `${url.origin}/${kind}/${site}` : url.origin;
    return `${base}/_layouts/15/RecycleBin.aspx`;
  } catch { return null; }
}

export const removeText = {
  en: {
    openRecycleBin: "Open recycle bin",
    deletedOk: "Deleted {name}. It is in the recycle bin.",
    linkedNote: "Still linked from {steps}: those links stay on the steps.",
    deleting: "Deleting…",
    readOnly: "Connect again to delete: your Microsoft sign-in only lets NextUp read files.",
    noAccess: "SharePoint did not let you delete this.",
    offline: "SharePoint can't be reached. Nothing was deleted.",
    notConnected: "Connect Microsoft 365 in your profile to delete files.",
    gone: "This file is no longer there.",
    menuLabel: "Actions for {name}",
    rowMenuClose: "Close menu",
    downloadFolder: "Folders open in SharePoint",
  },
  de: {
    openRecycleBin: "Papierkorb öffnen",
    deletedOk: "{name} gelöscht. Es liegt im Papierkorb.",
    linkedNote: "Noch verknüpft mit {steps}: Diese Verknüpfungen bleiben an den Schritten.",
    deleting: "Wird gelöscht …",
    readOnly: "Verbinden Sie sich erneut, um zu löschen: Ihre Microsoft-Anmeldung erlaubt NextUp nur das Lesen von Dateien.",
    noAccess: "SharePoint hat das Löschen nicht erlaubt.",
    offline: "SharePoint ist nicht erreichbar. Es wurde nichts gelöscht.",
    notConnected: "Verbinden Sie Microsoft 365 in Ihrem Profil, um Dateien zu löschen.",
    gone: "Diese Datei ist nicht mehr da.",
    menuLabel: "Aktionen für {name}",
    rowMenuClose: "Menü schließen",
    downloadFolder: "Ordner öffnen sich in SharePoint",
  },
} as const;

export type RemoveKey = keyof typeof removeText.en;
export function rx(locale: "en" | "de", key: RemoveKey, params: Record<string, string> = {}): string {
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), removeText[locale][key] as string);
}
