"use client";
// The Files page of an idea that has no project yet: the same page as a project's Files (plan FIL, Paper "Files · 3"),
// with the files raised with the idea. An idea and its project are one thing: once the idea gets its yes, its project's
// Files page carries on with these and links the SharePoint folder; until then there is nothing to upload into.
import { useState } from "react";
import { PageHead } from "@/components/ui/elements/PageHead";
import { kindOf } from "@/features/files/items";
import { useT } from "@/i18n/client";
import { FileIcon } from "./FileIcon";
import { kindKey } from "./FileList";
import files from "./Files.module.css";
import list from "./List.module.css";
import panel from "./Panel.module.css";
import states from "./States.module.css";

export type IdeaFile = { name: string; meta: string };

export function IdeaFilesView({ items }: { items: IdeaFile[] }) {
  const t = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked !== null ? items[picked] : undefined;
  return <div className={files.ideaPage}>
    <PageHead title={t("projectFiles.title")} />
    <div className={files.files} data-testid="idea-files-view">
      <section className={files.list} aria-label={t("projectFiles.pageLabel")}>
        {items.length === 0 ? <div className={states.state}>
          <h2 className={states.title}>{t("projectFiles.ideaNoneTitle")}</h2>
          <p className={states.hint}>{t("projectFiles.ideaHint")}</p>
        </div> : <div className={list.listWrap}>
          <table className={list.table}>
            <thead><tr>
              <th scope="col">{t("projectFiles.colName")}</th>
              <th scope="col">{t("projectFiles.ideaColFrom")}</th>
            </tr></thead>
            <tbody>{items.map((f, i) => {
              const kind = kindOf(f.name);
              return <tr key={f.name + i} tabIndex={0} className={list.row} data-selected={picked === i || undefined}
                onClick={() => setPicked(picked === i ? null : i)} onKeyDown={(e) => { if (e.key === "Enter") setPicked(i); if (e.key === "Escape") setPicked(null); }}>
                <td className={list.nameCell}><span className={list.nameInner}>
                  <FileIcon kind={kind} size={30} />
                  <span className={list.nameText}>
                    <span className={list.name}>{f.name}</span>
                    <span className={list.kind}>{t(kindKey(kind))}</span>
                  </span>
                </span></td>
                <td>{f.meta}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </section>
      <aside className={files.side}>
        <section className={panel.panel} aria-label={t("projectFiles.panelLabel")}>
          <div className={panel.preview}><FileIcon kind={sel ? kindOf(sel.name) : "folder"} size={84} /></div>
          <div className={panel.titleBlock}>
            <h2 className={panel.name}>{sel ? sel.name : t("projectFiles.ideaFolder")}</h2>
            <span className={panel.sub}>{sel ? t(kindKey(kindOf(sel.name))) : t("projectFiles.ideaFolderSub", { count: items.length })}</span>
          </div>
          <p className={panel.note}>{t("projectFiles.ideaHint")}</p>
        </section>
      </aside>
    </div>
  </div>;
}
