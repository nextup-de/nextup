"use client";
import { useState } from "react";
import { linkTitle } from "@/features/projects/tool-content";
import { useT } from "@/i18n/client";
import type { ToolProps } from "./types";
import { useToolContent } from "../hub/useToolContent";
import { ContentEditor } from "../hub/content/SaveStatus";
import s from "../hub/content/content.module.css";
import styles from "../CustomPageView.module.css";

export function LinksTool({ p, tool }: ToolProps) {
  const t = useT();
  const save = useToolContent<"links">(p, tool);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const { links } = save.value;
  const valid = !!linkTitle(url);
  return <ContentEditor save={save}>
    {!!links.length && <ul className={styles.files}>{links.map((link) => <li key={link.id} className={s.row}>
      <div className={s.name}>
        <a className={styles.url} href={link.url} target="_blank" rel="noreferrer noopener">{link.title || linkTitle(link.url)}</a>
        <span className={s.meta}>{linkTitle(link.url)}</span>
      </div>
      {save.editor && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" aria-label={t("projectHub.linksRemove")} onClick={() => save.setValue({ links: links.filter((x) => x.id !== link.id) })}>×</button>}
    </li>)}</ul>}
    {!links.length && !save.editor && <p className={styles.empty}>{t("projectHub.linksEmpty")}</p>}
    {save.editor && <div>
      <button type="button" className={s.addLink} aria-expanded={open} onClick={() => setOpen(!open)}>+ {t("projectHub.linksAdd")}</button>
      {open && <form className={s.popover} aria-label={t("projectHub.linksAddTitle")} onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        save.setValue({ links: [...links, { id: crypto.randomUUID(), url: url.trim(), title: title.trim() || linkTitle(url) }] });
        setOpen(false); setUrl(""); setTitle("");
        void save.flush();
      }}>
        <label className={s.field}>{t("projectHub.linksAddress")}<input className={styles.input} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} aria-invalid={!!url && !valid} /></label>
        {!!url && !valid && <span className={s.meta}>{t("projectHub.linksInvalidAddress")}</span>}
        <label className={s.field}>{t("projectHub.linksName")}<input className={styles.input} value={title} placeholder={linkTitle(url)} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className={s.actions}>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setOpen(false)}>{t("projectHub.linksCancel")}</button>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!valid}>{t("projectHub.linksAdd")}</button>
        </div>
      </form>}
    </div>}
  </ContentEditor>;
}
