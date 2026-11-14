"use client";
import { useEffect, useRef } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { rowMenuItems, rx, type MenuItem } from "@/features/files/remove";
import { useLocale, useT } from "@/i18n/client";
import { useRights } from "../parts";
import type { FilesPartProps } from "./types";
import styles from "./Menu.module.css";

/** The ⋮ menu of a row (3.1): every action calls what the panels use: the file's own links, the clipboard and the dialogs. */
export function RowMenu({ state, actions }: FilesPartProps) {
  return <div data-testid="files-row-menu">{state.dialog?.kind === "row-menu" && <Menu state={state} actions={actions} row={state.dialog.row} />}</div>;
}

function Menu({ state, actions, row }: FilesPartProps & { row: import("@/features/files/items").FileRow }) {
  const t = useT();
  const locale = useLocale();
  const { showToast } = useDemo();
  const rights = useRights(state.p);
  const panel = useRef<HTMLDivElement>(null);
  const editor = rights.check("project.linked", { system: "sharepoint", url: state.folder?.url ?? "https://t.sharepoint.com" }).ok;
  const items = rowMenuItems(row, { editor });
  useEffect(() => { panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus(); }, []);

  const run = (item: MenuItem) => {
    if (item === "delete" || item === "linkToStep" || item === "history") { actions.openDialog({ kind: item === "delete" ? "delete" : item === "history" ? "history" : "link-step", row }); return; }
    if (item === "copyLink") {
      void navigator.clipboard.writeText(row.webUrl).then(() => showToast(t("projectFiles.linkCopied"))).catch(() => undefined);
    } else if (item === "open" && row.isFolder) {
      actions.open(row);
    } else if (item === "download") {
      const a = document.createElement("a");
      a.href = row.webUrl + (row.webUrl.includes("?") ? "&" : "?") + "download=1"; a.download = row.name; a.click();
    } else {
      window.open(row.webUrl, "_blank", "noopener,noreferrer");
    }
    actions.closeDialog();
  };
  const label = (item: MenuItem): string => {
    switch (item) {
      case "open": return t("projectFiles.menuOpen");
      case "openInBrowser": return t("projectFiles.inBrowser");
      case "download": return t("projectFiles.download");
      case "copyLink": return t("projectFiles.copyLink");
      case "linkToStep": return t("projectFiles.menuLinkToStep");
      case "history": return t("projectFiles.history");
      case "rename": return t("projectFiles.menuRename");
      case "move": return t("projectFiles.menuMove");
      case "delete": return t("projectFiles.menuDelete");
    }
  };
  const out = (item: MenuItem) => item === "openInBrowser" || item === "rename" || item === "move";
  return <div className={styles.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) actions.closeDialog(); }}>
    <div ref={panel} className={styles.menu} role="menu" aria-label={rx(locale, "menuLabel", { name: row.name })} onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); actions.closeDialog(); return; }
      const all = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
    }}>
      {items.map((item) => <button key={item} type="button" role="menuitem" data-danger={item === "delete" || undefined} onClick={() => run(item)}>
        {label(item)}{out(item) && <span aria-hidden="true"> ↗</span>}
      </button>)}
    </div>
  </div>;
}
